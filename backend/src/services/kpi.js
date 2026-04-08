// ================================================================
// services/kpi.js
// Logica KPI centralizzata — configurabile per utente
// Sostituisce la logica hardcoded in reports.js e monthlyReport.js
// ================================================================

/**
 * Calcola i giorni lavorativi in un mese rispettando
 * la configurazione settimanale dell'utente (4 o 5 giorni).
 */
function calcolaGiorniLavorativi(anno, mese, giorniSett = 5) {
  let count = 0
  const d   = new Date(anno, mese - 1, 1)

  while (d.getMonth() === mese - 1) {
    const dow = d.getDay()  // 0=dom, 1=lun … 6=sab
    if (giorniSett === 5 && dow >= 1 && dow <= 5) count++
    if (giorniSett === 4 && dow >= 1 && dow <= 4) count++  // lun-gio
    if (giorniSett === 6 && dow >= 1 && dow <= 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

/**
 * Calcola valutazione in modo "intelligente":
 * - Tiene conto della tolleranza personalizzata dell'utente
 * - Non penalizza per variazioni minime (es. 7.75h vs 8h)
 * - Considera la consistenza (pochi giorni-zero pesano più di molti giorni-leggeri)
 *
 * @param {Object} params
 * @param {number} params.oreTotali
 * @param {number} params.oreAttese
 * @param {number} params.giorniLavorati
 * @param {number} params.giorniAttesi
 * @param {number} params.giorniSottoStd   - giorni con ore < ore_standard
 * @param {number} params.giorniZero       - giorni senza report inserito
 * @param {number} params.tolleranzaPct    - % tolleranza utente (default 10)
 * @param {number} params.oreStandard      - ore/giorno standard utente
 */
function calcolaKPI(params) {
  const {
    oreTotali,
    oreAttese,
    giorniLavorati,
    giorniAttesi,
    giorniSottoStd    = 0,
    giorniZero        = 0,
    tolleranzaPct     = 10,
    oreStandard       = 8,
  } = params

  // ── Percentuale completamento grezzo ──
  const percRaw = oreAttese > 0
    ? Math.round((oreTotali / oreAttese) * 1000) / 10
    : 0

  // ── Fattore presenza (penalizza giorni-zero più dei giorni-brevi) ──
  // Un giorno senza report pesa 2× rispetto a un giorno sotto standard
  const presenzaScore = giorniAttesi > 0
    ? Math.max(0, 1 - (giorniZero * 0.02 + giorniSottoStd * 0.01))
    : 1

  // ── Score finale (ore% × presenza) ──
  const scoreFinale = Math.min(100, percRaw * presenzaScore)

  // ── Soglie adattive con tolleranza ──
  const t = tolleranzaPct
  const SOGLIE = {
    OTTIMO:        100 - t * 0.05,  // es. tolleranza 10% → soglia 99.5%
    BUONO:         80  - t * 0.5,   // es. tolleranza 10% → soglia 75%
    SUFFICIENTE:   60  - t * 0.5,   // es. tolleranza 10% → soglia 55%
  }

  let valutazione
  if (scoreFinale >= SOGLIE.OTTIMO)      valutazione = 'OTTIMO'
  else if (scoreFinale >= SOGLIE.BUONO)  valutazione = 'BUONO'
  else if (scoreFinale >= SOGLIE.SUFFICIENTE) valutazione = 'SUFFICIENTE'
  else                                   valutazione = 'INSUFFICIENTE'

  // ── Media ore/giorno solo sui giorni con report ──
  const mediaOreGiorno = giorniLavorati > 0
    ? Math.round((oreTotali / giorniLavorati) * 100) / 100
    : 0

  // ── Alert flags ──
  const alerts = []
  if (giorniZero > 3) {
    alerts.push({
      tipo:      'giorni_mancanti',
      messaggio: `${giorniZero} giorni senza report nel mese`,
      gravita:   giorniZero > 7 ? 'alta' : 'media',
    })
  }
  if (mediaOreGiorno > 0 && mediaOreGiorno < oreStandard * 0.75) {
    alerts.push({
      tipo:      'ore_basse',
      messaggio: `Media ore/giorno (${mediaOreGiorno}h) molto sotto standard (${oreStandard}h)`,
      gravita:   'alta',
    })
  }
  if (percRaw >= 95 && giorniZero === 0) {
    alerts.push({
      tipo:      'eccellente',
      messaggio: 'Mese eccellente: piena presenza e ore complete',
      gravita:   'positivo',
    })
  }

  return {
    // Numeri
    ore_totali:          oreTotali,
    ore_attese:          oreAttese,
    giorni_lavorati:     giorniLavorati,
    giorni_attesi:       giorniAttesi,
    giorni_mancanti:     Math.max(0, giorniAttesi - giorniLavorati),
    giorni_sotto_std:    giorniSottoStd,
    giorni_zero:         giorniZero,
    media_ore_giorno:    mediaOreGiorno,
    // Percentuali
    percentuale_comp:    percRaw,          // grezzo (per display)
    score_finale:        Math.round(scoreFinale * 10) / 10,  // adattivo
    presenza_score:      Math.round(presenzaScore * 1000) / 10,
    // Valutazione
    valutazione,
    soglie_usate:        SOGLIE,
    // Alert
    alerts,
    has_alerts:          alerts.some(a => a.gravita !== 'positivo'),
  }
}

/**
 * Aggrega i report giornalieri di un mese e calcola KPI completi.
 * Chiamato da monthlyReport.js
 */
function aggregaReportMensile(reportGiorni, configUtente) {
  const {
    oreStandard     = 8,
    giorniSett      = 5,
    tolleranzaPct   = 10,
  } = configUtente

  const anno = reportGiorni[0] ? new Date(reportGiorni[0].data).getFullYear() : new Date().getFullYear()
  const mese  = reportGiorni[0] ? new Date(reportGiorni[0].data).getMonth() + 1 : new Date().getMonth() + 1

  const giorniAttesi   = calcolaGiorniLavorativi(anno, mese, giorniSett)
  const oreAttese      = giorniAttesi * oreStandard
  const oreTotali      = reportGiorni.reduce((s, r) => s + Number(r.ore_lavorate), 0)
  const giorniLavorati = reportGiorni.length
  const giorniSottoStd = reportGiorni.filter(r => Number(r.ore_lavorate) < oreStandard).length
  // Giorni lavorativi senza nessun report
  const giorniZero     = Math.max(0, giorniAttesi - giorniLavorati)

  return calcolaKPI({
    oreTotali,
    oreAttese,
    giorniLavorati,
    giorniAttesi,
    giorniSottoStd,
    giorniZero,
    tolleranzaPct,
    oreStandard,
  })
}

/**
 * Etichette human-friendly per la valutazione
 */
const VALUTAZIONE_CONFIG = {
  OTTIMO:        { emoji: '🏆', label: 'Ottimo',        color: 'emerald', desc: 'Prestazione eccellente' },
  BUONO:         { emoji: '✅', label: 'Buono',         color: 'blue',    desc: 'Buona prestazione' },
  SUFFICIENTE:   { emoji: '⚠️', label: 'Sufficiente',   color: 'amber',   desc: 'Prestazione nella norma' },
  INSUFFICIENTE: { emoji: '❌', label: 'Insufficiente', color: 'red',     desc: 'Attenzione necessaria' },
}

function getValutazioneConfig(val) {
  return VALUTAZIONE_CONFIG[val] ?? VALUTAZIONE_CONFIG.INSUFFICIENTE
}

module.exports = {
  calcolaGiorniLavorativi,
  calcolaKPI,
  aggregaReportMensile,
  getValutazioneConfig,
  VALUTAZIONE_CONFIG,
}
