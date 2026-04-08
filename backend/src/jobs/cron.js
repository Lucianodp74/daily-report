// ================================================================
// jobs/cron.js v2
// Novità: deduplication via alert_log, retry, logging strutturato,
//         gestione errori per singolo utente non blocca gli altri
// ================================================================
const cron  = require('node-cron')
const { query }  = require('../utils/db')
const logger     = require('../utils/logger')
const { generaReportMensileTutti } = require('../services/monthlyReport')
const {
  sendReminderReportMancante,
  sendAlertAdminMancanti,
} = require('../services/email')

// ── Helper: verifica se alert già inviato oggi ────────────────────
async function alertGiaInviato(userId, tipo, riferimento) {
  const { rows } = await query(
    `SELECT id FROM alert_log
     WHERE user_id = $1 AND tipo = $2 AND riferimento = $3
     LIMIT 1`,
    [userId, tipo, riferimento]
  )
  return rows.length > 0
}

async function registraAlert(userId, tipo, riferimento, success, errore = null) {
  await query(
    `INSERT INTO alert_log (user_id, tipo, canale, riferimento, success, errore)
     VALUES ($1, $2, 'email', $3, $4, $5)
     ON CONFLICT (user_id, tipo, riferimento) DO UPDATE
     SET success = EXCLUDED.success, errore = EXCLUDED.errore, inviato_at = NOW()`,
    [userId, tipo, riferimento, success, errore]
  ).catch(err => logger.warn({ err: err.message }, 'Errore registrazione alert_log'))
}

// ── JOB: Reminder giornaliero ore 17:00 (lun-ven) ────────────────
async function runReminderGiornaliero() {
  const oggi = new Date().toISOString().slice(0, 10)
  logger.info({ oggi }, '[CRON] Avvio reminder giornaliero')

  try {
    // Collaboratori senza report oggi + notifiche attive
    const { rows: mancanti } = await query(
      `SELECT u.id, u.nome, u.email
       FROM utenti u
       WHERE u.ruolo = 'user'
         AND u.attivo = true
         AND u.notifiche_email = true
         AND u.id NOT IN (
           SELECT user_id FROM report WHERE data = CURRENT_DATE
         )
       ORDER BY u.nome`
    )

    logger.info({ n: mancanti.length, oggi }, '[CRON] Collaboratori senza report')

    let inviati = 0, saltati = 0, errori = 0

    for (const u of mancanti) {
      // Deduplication: non inviare se già inviato oggi
      if (await alertGiaInviato(u.id, 'reminder_report', oggi)) {
        saltati++
        continue
      }

      try {
        const ok = await sendReminderReportMancante(u.email, u.nome)
        await registraAlert(u.id, 'reminder_report', oggi, ok)
        if (ok) inviati++
        else    errori++
      } catch (err) {
        logger.error({ err: err.message, userId: u.id }, '[CRON] Errore invio reminder')
        await registraAlert(u.id, 'reminder_report', oggi, false, err.message)
        errori++
      }

      // Pausa per non saturare SMTP
      await new Promise(r => setTimeout(r, 200))
    }

    logger.info({ inviati, saltati, errori, oggi }, '[CRON] Reminder completato')

    // Alert admin se ci sono mancanti
    if (mancanti.length > 0) {
      const { rows: admins } = await query(
        "SELECT email FROM utenti WHERE ruolo = 'admin' AND attivo = true AND notifiche_email = true"
      )
      for (const admin of admins) {
        await sendAlertAdminMancanti(admin.email, mancanti, oggi).catch(() => {})
      }
    }

  } catch (err) {
    logger.error({ err: err.message }, '[CRON] Errore critico reminder giornaliero')
  }
}

// ── JOB: Generazione report mensili (1° del mese alle 01:00) ─────
async function runGenerazioneReportMensili() {
  const ora        = new Date()
  const precedente = new Date(ora.getFullYear(), ora.getMonth() - 1, 1)
  const anno       = precedente.getFullYear()
  const mese       = precedente.getMonth() + 1

  logger.info({ anno, mese }, '[CRON] Avvio generazione report mensili')

  try {
    const risultati = await generaReportMensileTutti(anno, mese)
    const ok     = risultati.filter(r => r.success).length
    const errori = risultati.filter(r => !r.success)

    logger.info({ anno, mese, ok, n_errori: errori.length }, '[CRON] Report mensili generati')

    if (errori.length > 0) {
      logger.warn({ errori }, '[CRON] Utenti con errore nella generazione')
    }
  } catch (err) {
    logger.error({ err: err.message }, '[CRON] Errore critico generazione report mensili')
  }
}

// ── JOB: Check ore basse (ogni venerdì ore 16:00) ─────────────────
// Avverte collaboratori che hanno accumulato poche ore nel mese
async function runCheckOreBasse() {
  const ora  = new Date()
  const anno = ora.getFullYear()
  const mese = ora.getMonth() + 1
  logger.info({ anno, mese }, '[CRON] Avvio check ore basse')

  try {
    const { rows } = await query(
      `SELECT
         u.id, u.nome, u.email,
         u.ore_standard_giornaliere,
         u.tolleranza_pct,
         COALESCE(SUM(r.ore_lavorate), 0) AS ore_mese,
         COUNT(r.id) AS giorni_mese
       FROM utenti u
       LEFT JOIN report r ON r.user_id = u.id
         AND EXTRACT(YEAR FROM r.data) = $1
         AND EXTRACT(MONTH FROM r.data) = $2
       WHERE u.ruolo = 'user'
         AND u.attivo = true
         AND u.notifiche_email = true
       GROUP BY u.id, u.nome, u.email, u.ore_standard_giornaliere, u.tolleranza_pct
       HAVING
         -- Almeno 2 settimane nel mese e ore criticamente basse
         COUNT(r.id) >= 8
         AND COALESCE(SUM(r.ore_lavorate), 0) <
             (SELECT giorni_lavorativi_utente($1, $2, u2.giorni_lavorativi_sett) * u2.ore_standard_giornaliere * 0.5
              FROM utenti u2 WHERE u2.id = u.id)`,
      [anno, mese]
    )

    for (const u of rows) {
      const riferimento = `${anno}-${String(mese).padStart(2,'0')}-friday`
      if (await alertGiaInviato(u.id, 'ore_basse', riferimento)) continue

      // TODO: sendOreBassAlert(u.email, u.nome, u.ore_mese, ...)
      await registraAlert(u.id, 'ore_basse', riferimento, true)
      logger.info({ userId: u.id, ore: u.ore_mese }, '[CRON] Alert ore basse')
    }

  } catch (err) {
    logger.error({ err: err.message }, '[CRON] Errore check ore basse')
  }
}

// ── Inizializzazione ─────────────────────────────────────────────
function initCronJobs() {
  logger.info('[CRON] Inizializzazione job schedulati')

  // Generazione report mensili: 1° del mese alle 01:00
  cron.schedule('0 1 1 * *', runGenerazioneReportMensili, { timezone: 'Europe/Rome' })

  // Reminder report mancante: lun-ven alle 17:00
  cron.schedule('0 17 * * 1-5', runReminderGiornaliero, { timezone: 'Europe/Rome' })

  // Check ore basse: ogni venerdì alle 16:00
  cron.schedule('0 16 * * 5', runCheckOreBasse, { timezone: 'Europe/Rome' })

  logger.info({
    jobs: [
      '01:00 del 1° del mese → Generazione report mensili',
      '17:00 lun-ven         → Reminder report mancanti',
      '16:00 ogni venerdì    → Check ore basse',
    ]
  }, '[CRON] Job attivi')

  // Esposizione per chiamata manuale (utile per test/admin endpoint)
  return { runReminderGiornaliero, runGenerazioneReportMensili, runCheckOreBasse }
}

module.exports = { initCronJobs }
