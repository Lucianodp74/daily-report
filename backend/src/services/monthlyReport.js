// ================================================================
// services/monthlyReport.js v2
// Novità: usa kpi.js centralizzato, fallback AI a 3 livelli,
//         retry con backoff, logging errori, commenti template
// ================================================================
const { query }     = require('../utils/db')
const logger        = require('../utils/logger')
const { aggregaReportMensile, getValutazioneConfig } = require('./kpi')

// ── Fallback AI: 3 livelli ────────────────────────────────────────
// Livello 1: Anthropic API
// Livello 2: Template rule-based deterministico
// Livello 3: Stringa minimale sempre disponibile

/**
 * Genera commento con Anthropic. Ritorna null se non disponibile.
 */
async function commentoViaAI(nomeUtente, meseName, anno, testo, kpi) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const { ore_totali, percentuale_comp, valutazione, giorni_mancanti, media_ore_giorno } = kpi

  const prompt = `Sei un sistema HR che analizza i report mensili dei collaboratori.

Collaboratore: ${nomeUtente}
Periodo: ${meseName} ${anno}
Ore lavorate: ${ore_totali}h (${percentuale_comp}% del target)
Valutazione sistema: ${valutazione}
Giorni mancanti: ${giorni_mancanti}
Media ore/giorno: ${media_ore_giorno}h

Attività del mese (estratto):
${testo.slice(0, 1200)}

Scrivi un commento HR professionale di 2-3 frasi in italiano che:
1. Citi dati specifici (ore, %)
2. Valuti la qualità e varietà delle attività
3. Sia coerente con la valutazione "${valutazione}"
${giorni_mancanti > 0 ? '4. Menzioni i giorni mancanti in modo costruttivo' : ''}

Tono: professionale, oggettivo, costruttivo. Niente frasi generiche.
Rispondi SOLO con il testo del commento.`

  // Retry con exponential backoff
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-opus-4-6',
          max_tokens: 300,
          messages:   [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(15000),  // 15s timeout
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Anthropic HTTP ${res.status}: ${body}`)
      }

      const data    = await res.json()
      const testo   = data.content?.[0]?.text?.trim()
      if (testo && testo.length > 20) return testo

      throw new Error('Risposta AI vuota o troppo breve')

    } catch (err) {
      logger.warn({ err: err.message, attempt, utente: nomeUtente }, 'Tentativo AI fallito')
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 1000))  // backoff: 1s, 2s
      }
    }
  }

  return null  // Tutti i tentativi falliti
}

/**
 * Fallback livello 2: commento deterministico basato su regole.
 * Sempre disponibile, non dipende da API esterne.
 */
function commentoRulesBased(nomeUtente, meseName, anno, kpi) {
  const {
    ore_totali, ore_attese, percentuale_comp, valutazione,
    giorni_lavorati, giorni_attesi, giorni_mancanti,
    media_ore_giorno, giorni_sotto_std, alerts,
  } = kpi

  const cfg = getValutazioneConfig(valutazione)

  const templates = {
    OTTIMO: [
      `${nomeUtente} ha registrato una prestazione eccellente in ${meseName} ${anno}: ${ore_totali}h lavorate su ${ore_attese}h attese (${percentuale_comp}%), con piena presenza per ${giorni_lavorati} giorni lavorativi. Le attività mostrano varietà e continuità. Valutazione: ${cfg.emoji} ${cfg.label}.`,
      `Mese di ${meseName} molto positivo per ${nomeUtente}: ${percentuale_comp}% di completamento ore con media di ${media_ore_giorno}h/giorno. Presenza costante e attività documentate con regolarità.`,
    ],
    BUONO: [
      `${nomeUtente} ha completato il ${percentuale_comp}% delle ore previste in ${meseName} ${anno} (${ore_totali}/${ore_attese}h), con ${giorni_lavorati} giorni su ${giorni_attesi} lavorativi. Prestazione nel complesso buona.${giorni_mancanti > 0 ? ` Si notano ${giorni_mancanti} giorni senza report.` : ''}`,
    ],
    SUFFICIENTE: [
      `In ${meseName} ${anno}, ${nomeUtente} ha raggiunto il ${percentuale_comp}% del target ore (${ore_totali}/${ore_attese}h). La presenza è risultata parziale (${giorni_lavorati}/${giorni_attesi} giorni). ${giorni_sotto_std > 0 ? `${giorni_sotto_std} giorni sotto lo standard di ore.` : ''} Margini di miglioramento nella continuità.`,
    ],
    INSUFFICIENTE: [
      `Il mese di ${meseName} ${anno} evidenzia criticità per ${nomeUtente}: ${ore_totali}h registrate su ${ore_attese}h attese (${percentuale_comp}%). ${giorni_mancanti > 0 ? `${giorni_mancanti} giorni lavorativi senza report.` : ''} È necessario un confronto per identificare le cause e pianificare azioni correttive.`,
    ],
  }

  const opts = templates[valutazione] ?? templates.INSUFFICIENTE
  return opts[Math.floor(Math.random() * opts.length)]
}

// ── Funzione principale ───────────────────────────────────────────
async function generaReportMensile(userId, anno, mese, generato_da = 'manual') {
  logger.info({ userId, anno, mese, generato_da }, 'Generazione report mensile')

  // 1. Dati utente (con nuovi campi configurazione)
  const { rows: uRows } = await query(
    `SELECT nome, ore_standard_giornaliere, giorni_lavorativi_sett, tolleranza_pct
     FROM utenti WHERE id = $1`,
    [userId]
  )
  const utente = uRows[0]
  if (!utente) throw new Error(`Utente ${userId} non trovato`)

  // 2. Report giornalieri del mese
  const { rows: reportGiorni } = await query(
    `SELECT data, attivita, note, ore_lavorate
     FROM report
     WHERE user_id = $1
       AND EXTRACT(YEAR FROM data) = $2
       AND EXTRACT(MONTH FROM data) = $3
     ORDER BY data ASC`,
    [userId, anno, mese]
  )

  // 3. KPI (logica centralizzata in kpi.js)
  const kpi = aggregaReportMensile(reportGiorni, {
    oreStandard:   Number(utente.ore_standard_giornaliere),
    giorniSett:    Number(utente.giorni_lavorativi_sett),
    tolleranzaPct: Number(utente.tolleranza_pct),
  })

  // 4. Testo aggregato per AI
  const meseName = new Date(anno, mese - 1).toLocaleString('it', { month: 'long' })
  const testoAggregato = reportGiorni.map(r => {
    const d = new Date(r.data).toLocaleDateString('it', { day: '2-digit', month: '2-digit' })
    return `[${d}] ${r.attivita}${r.note ? ` — ${r.note}` : ''}`
  }).join('\n')

  // 5. Commento: AI → rules-based → minimo
  let commentoAI = null
  let commentoSorgente = 'none'

  if (reportGiorni.length > 0) {
    commentoAI = await commentoViaAI(utente.nome, meseName, anno, testoAggregato, kpi)
    commentoSorgente = commentoAI ? 'ai' : 'rules'

    if (!commentoAI) {
      commentoAI = commentoRulesBased(utente.nome, meseName, anno, kpi)
      logger.info({ userId, fallback: 'rules_based' }, 'AI non disponibile, usato fallback rule-based')
    }
  }

  // 6. Upsert report_mensili
  const { rows: saved } = await query(
    `INSERT INTO report_mensili
       (user_id, anno, mese,
        ore_totali, ore_attese, ore_attese_reali,
        giorni_lavorati, giorni_attesi, giorni_sotto_std,
        media_ore_giorno, percentuale_comp, valutazione,
        commento_ai, testo_aggregato, generato_da, calc_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,2)
     ON CONFLICT (user_id, anno, mese) DO UPDATE SET
       ore_totali        = EXCLUDED.ore_totali,
       ore_attese        = EXCLUDED.ore_attese,
       ore_attese_reali  = EXCLUDED.ore_attese_reali,
       giorni_lavorati   = EXCLUDED.giorni_lavorati,
       giorni_attesi     = EXCLUDED.giorni_attesi,
       giorni_sotto_std  = EXCLUDED.giorni_sotto_std,
       media_ore_giorno  = EXCLUDED.media_ore_giorno,
       percentuale_comp  = EXCLUDED.percentuale_comp,
       valutazione       = EXCLUDED.valutazione,
       commento_ai       = EXCLUDED.commento_ai,
       testo_aggregato   = EXCLUDED.testo_aggregato,
       generato_at       = NOW(),
       generato_da       = EXCLUDED.generato_da,
       calc_version      = 2
     RETURNING *`,
    [
      userId, anno, mese,
      kpi.ore_totali, kpi.ore_attese, kpi.ore_attese,
      kpi.giorni_lavorati, kpi.giorni_attesi, kpi.giorni_sotto_std,
      kpi.media_ore_giorno, kpi.percentuale_comp, kpi.valutazione,
      commentoAI, testoAggregato || null, generato_da,
    ]
  )

  logger.info({
    userId, anno, mese,
    valutazione:     kpi.valutazione,
    perc:            kpi.percentuale_comp,
    commento:        commentoSorgente,
    alerts:          kpi.alerts.length,
  }, 'Report mensile generato')

  return {
    ...saved[0],
    nome_utente:         utente.nome,
    kpi_dettaglio:       kpi,
    report_dettaglio:    reportGiorni,
    commento_sorgente:   commentoSorgente,
  }
}

// Genera per tutti gli utenti attivi
async function generaReportMensileTutti(anno, mese) {
  const { rows: utenti } = await query(
    "SELECT id FROM utenti WHERE ruolo = 'user' AND attivo = true"
  )

  logger.info({ anno, mese, n_utenti: utenti.length }, 'Avvio generazione report mensili per tutti')

  const risultati = []
  for (const u of utenti) {
    try {
      const r = await generaReportMensile(u.id, anno, mese, 'auto')
      risultati.push({ userId: u.id, success: true, valutazione: r.kpi_dettaglio.valutazione })
    } catch (err) {
      logger.error({ err: err.message, userId: u.id }, 'Errore generazione report utente')
      risultati.push({ userId: u.id, success: false, error: err.message })
    }
    // Pausa tra utenti per non saturare rate limit AI
    await new Promise(r => setTimeout(r, 500))
  }

  const ok = risultati.filter(r => r.success).length
  logger.info({ anno, mese, ok, errori: risultati.length - ok }, 'Generazione completata')

  return risultati
}

module.exports = { generaReportMensile, generaReportMensileTutti }
