// ================================================================
// services/monthlyReport.js v3
// Fix: compatibilità ore_standard / ore_standard_giornaliere
// Fix: errori singoli utenti visibili nel risultato
// ================================================================
const { query } = require('../utils/db')
const { calcolaGiorniLavorativi, calcolaKPI } = require('./kpi')

function commentoRulesBased(nome, meseName, anno, kpi) {
  const { ore_totali, ore_attese, percentuale_comp, valutazione,
          giorni_lavorati, giorni_attesi, giorni_mancanti, media_ore_giorno } = kpi

  const t = {
    OTTIMO:        `${nome} ha registrato una prestazione eccellente in ${meseName} ${anno}: ${ore_totali}h su ${ore_attese}h attese (${percentuale_comp}%), con ${giorni_lavorati}/${giorni_attesi} giorni lavorativi presenti e media di ${media_ore_giorno}h/giorno.`,
    BUONO:         `Buona prestazione per ${nome} in ${meseName} ${anno}: ${percentuale_comp}% di completamento ore (${ore_totali}/${ore_attese}h), ${giorni_lavorati}/${giorni_attesi} giorni lavorativi.${giorni_mancanti > 0 ? ` Si notano ${giorni_mancanti} giorni senza report.` : ''}`,
    SUFFICIENTE:   `In ${meseName} ${anno} ${nome} ha raggiunto il ${percentuale_comp}% del target (${ore_totali}/${ore_attese}h). Presenza parziale: ${giorni_lavorati}/${giorni_attesi} giorni. Margini di miglioramento nella continuità.`,
    INSUFFICIENTE: `${meseName} ${anno} evidenzia criticità per ${nome}: ${ore_totali}h su ${ore_attese}h attese (${percentuale_comp}%). ${giorni_mancanti > 0 ? `${giorni_mancanti} giorni senza report.` : ''} Necessario un confronto per identificare le cause.`,
  }
  return t[valutazione] ?? t.INSUFFICIENTE
}

async function commentoAI(nome, meseName, anno, testo, kpi) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `Sei un sistema HR. Analizza il report mensile del collaboratore "${nome}" per ${meseName} ${anno}.\nDati: ${kpi.ore_totali}h lavorate (${kpi.percentuale_comp}% target), valutazione ${kpi.valutazione}, ${kpi.giorni_mancanti} giorni mancanti.\nAttività (estratto):\n${testo.slice(0, 1200)}\nScrivi un commento HR professionale di 2-3 frasi in italiano. Tono oggettivo e costruttivo. Solo il testo, niente prefissi.`

  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const txt  = data.content?.[0]?.text?.trim()
      if (txt && txt.length > 20) return txt
    } catch (err) {
      console.warn(`[AI] tentativo ${i}/3 fallito:`, err.message)
      if (i < 3) await new Promise(r => setTimeout(r, i * 1000))
    }
  }
  return null
}

async function generaReportMensile(userId, anno, mese, generato_da = 'manual') {
  // Compatibile con vecchio schema (ore_standard) e nuovo (ore_standard_giornaliere)
  const { rows: uRows } = await query(
    `SELECT nome,
       COALESCE(ore_standard_giornaliere, ore_standard, 8) AS ore_standard_giornaliere,
       COALESCE(giorni_lavorativi_sett, 5)                 AS giorni_lavorativi_sett,
       COALESCE(tolleranza_pct, 10)                        AS tolleranza_pct
     FROM utenti WHERE id = $1`,
    [userId]
  )
  const u = uRows[0]
  if (!u) throw new Error(`Utente ${userId} non trovato`)

  const oreStd     = Number(u.ore_standard_giornaliere)
  const giorniSett = Number(u.giorni_lavorativi_sett)
  const tolleranza = Number(u.tolleranza_pct)

  // Report del mese
  const { rows: rRows } = await query(
    `SELECT data, attivita, note, ore_lavorate FROM report
     WHERE user_id = $1 AND EXTRACT(YEAR FROM data) = $2 AND EXTRACT(MONTH FROM data) = $3
     ORDER BY data ASC`,
    [userId, anno, mese]
  )

  // KPI
  const giorniAttesi   = calcolaGiorniLavorativi(anno, mese, giorniSett)
  const oreAttese      = giorniAttesi * oreStd
  const oreTotali      = rRows.reduce((s, r) => s + Number(r.ore_lavorate), 0)
  const giorniSottoStd = rRows.filter(r => Number(r.ore_lavorate) < oreStd).length

  const kpi = calcolaKPI({
    oreTotali, oreAttese,
    giorniLavorati: rRows.length, giorniAttesi,
    giorniSottoStd, tolleranzaPct: tolleranza, oreStandard: oreStd,
  })

  // Testo aggregato per AI
  const meseName  = new Date(anno, mese - 1).toLocaleString('it', { month: 'long' })
  const testoAggr = rRows.map(r => {
    const d = new Date(r.data).toLocaleDateString('it', { day: '2-digit', month: '2-digit' })
    return `[${d}] ${r.attivita}${r.note ? ` — ${r.note}` : ''}`
  }).join('\n')

  // Commento AI → rule-based
  let commento = null, sorgente = 'none'
  if (rRows.length > 0) {
    commento = await commentoAI(u.nome, meseName, anno, testoAggr, kpi)
    sorgente = commento ? 'ai' : 'rules'
    if (!commento) commento = commentoRulesBased(u.nome, meseName, anno, kpi)
  }

  // Upsert
  const { rows: saved } = await query(
    `INSERT INTO report_mensili
       (user_id, anno, mese, ore_totali, ore_attese, giorni_lavorati, giorni_attesi,
        giorni_sotto_std, media_ore_giorno, percentuale_comp, valutazione,
        commento_ai, testo_aggregato, generato_da)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (user_id, anno, mese) DO UPDATE SET
       ore_totali       = EXCLUDED.ore_totali,
       ore_attese       = EXCLUDED.ore_attese,
       giorni_lavorati  = EXCLUDED.giorni_lavorati,
       giorni_attesi    = EXCLUDED.giorni_attesi,
       giorni_sotto_std = EXCLUDED.giorni_sotto_std,
       media_ore_giorno = EXCLUDED.media_ore_giorno,
       percentuale_comp = EXCLUDED.percentuale_comp,
       valutazione      = EXCLUDED.valutazione,
       commento_ai      = EXCLUDED.commento_ai,
       testo_aggregato  = EXCLUDED.testo_aggregato,
       generato_at      = NOW(),
       generato_da      = EXCLUDED.generato_da
     RETURNING *`,
    [userId, anno, mese, kpi.ore_totali, kpi.ore_attese,
     kpi.giorni_lavorati, kpi.giorni_attesi, kpi.giorni_sotto_std,
     kpi.media_ore_giorno, kpi.percentuale_comp, kpi.valutazione,
     commento, testoAggr || null, generato_da]
  )

  return {
    ...saved[0],
    nome_utente: u.nome,
    kpi_dettaglio: kpi,
    report_dettaglio: rRows,
    commento_sorgente: sorgente,
  }
}

async function generaReportMensileTutti(anno, mese) {
  const { rows: utenti } = await query(
    "SELECT id, nome FROM utenti WHERE ruolo = 'user' AND attivo = true"
  )

  const risultati = []
  for (const u of utenti) {
    try {
      const r = await generaReportMensile(u.id, anno, mese, 'auto')
      console.log(`[monthly] ✅ ${u.nome}: ${r.kpi_dettaglio.valutazione} — ${r.kpi_dettaglio.ore_totali}h`)
      risultati.push({ userId: u.id, nome: u.nome, success: true, valutazione: r.kpi_dettaglio.valutazione })
    } catch (err) {
      console.error(`[monthly] ❌ ${u.nome} (${u.id}): ${err.message}`)
      risultati.push({ userId: u.id, nome: u.nome, success: false, error: err.message })
    }
    await new Promise(r => setTimeout(r, 300))
  }

  const successi = risultati.filter(r => r.success).length
  console.log(`[monthly] Completato: ${successi}/${risultati.length} report generati`)
  return risultati
}

module.exports = { generaReportMensile, generaReportMensileTutti }
