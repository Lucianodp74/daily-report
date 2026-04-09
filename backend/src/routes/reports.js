// ================================================================
// routes/reports.js — CRUD report giornalieri + stats
// ================================================================
const router = require('express').Router()
const { query } = require('../utils/db')
const { requireAuth } = require('../middleware/auth')
const { validateReport, validateReportUpdate, validateReportQuery } = require('../middleware/validate')
const { calcolaGiorniLavorativi, calcolaKPI } = require('../services/kpi')

router.use(requireAuth)

// ── GET /api/reports — Lista report utente ────────────────────────
router.get('/', validateReportQuery, async (req, res) => {
  const { data_da, data_a, limit = 50, offset = 0 } = req.query
  try {
    let sql = `SELECT * FROM report WHERE user_id = $1`
    const params = [req.userId]
    let idx = 2

    if (data_da) { sql += ` AND data >= $${idx++}`; params.push(data_da) }
    if (data_a)  { sql += ` AND data <= $${idx++}`; params.push(data_a)  }

    sql += ` ORDER BY data DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(Number(limit), Number(offset))

    const { rows } = await query(sql, params)
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore caricamento report' })
  }
})

// ── GET /api/reports/stats/month — KPI mese corrente ─────────────
router.get('/stats/month', async (req, res) => {
  const anno = Number(req.query.anno) || new Date().getFullYear()
  const mese = Number(req.query.mese) || (new Date().getMonth() + 1)

  try {
    // Carica config utente
    const { rows: uRows } = await query(
      `SELECT ore_standard_giornaliere, giorni_lavorativi_sett, tolleranza_pct
       FROM utenti WHERE id = $1`, [req.userId]
    )
    const cfg = uRows[0] || { ore_standard_giornaliere: 8, giorni_lavorativi_sett: 5, tolleranza_pct: 10 }
    const oreStd    = Number(cfg.ore_standard_giornaliere)
    const giorniSett = Number(cfg.giorni_lavorativi_sett)
    const tollPct    = Number(cfg.tolleranza_pct)

    // Report del mese
    const { rows: reportGiorni } = await query(
      `SELECT data, ore_lavorate FROM report
       WHERE user_id = $1 AND EXTRACT(YEAR FROM data) = $2 AND EXTRACT(MONTH FROM data) = $3
       ORDER BY data ASC`,
      [req.userId, anno, mese]
    )

    const giorniAttesi   = calcolaGiorniLavorativi(anno, mese, giorniSett)
    const oreAttese      = giorniAttesi * oreStd
    const oreTotali      = reportGiorni.reduce((s, r) => s + Number(r.ore_lavorate), 0)
    const giorniLavorati = reportGiorni.length
    const giorniSottoStd = reportGiorni.filter(r => Number(r.ore_lavorate) < oreStd).length
    const giorniZero     = Math.max(0, giorniAttesi - giorniLavorati)

    const kpi = calcolaKPI({
      oreTotali, oreAttese, giorniLavorati, giorniAttesi,
      giorniSottoStd, giorniZero, tolleranzaPct: tollPct, oreStandard: oreStd,
    })

    return res.json({ success: true, data: kpi })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore calcolo statistiche' })
  }
})

// ── POST /api/reports — Crea report ──────────────────────────────
router.post('/', validateReport, async (req, res) => {
  const { data, attivita, note, ore_lavorate, umore, template_id } = req.body
  try {
    const { rows } = await query(
      `INSERT INTO report (user_id, data, attivita, note, ore_lavorate, umore, template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, data) DO UPDATE SET
         attivita = EXCLUDED.attivita,
         note = EXCLUDED.note,
         ore_lavorate = EXCLUDED.ore_lavorate,
         umore = EXCLUDED.umore,
         template_id = EXCLUDED.template_id,
         updated_at = NOW()
       RETURNING *`,
      [req.userId, data, attivita, note || null, ore_lavorate, umore || null, template_id || null]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore salvataggio report' })
  }
})

// ── PUT /api/reports/:id — Aggiorna report ────────────────────────
router.put('/:id', validateReportUpdate, async (req, res) => {
  const { attivita, note, ore_lavorate, umore } = req.body
  try {
    const sets = []; const vals = [req.params.id, req.userId]; let idx = 3

    if (attivita !== undefined)    { sets.push(`attivita = $${idx++}`);     vals.push(attivita) }
    if (note !== undefined)        { sets.push(`note = $${idx++}`);         vals.push(note) }
    if (ore_lavorate !== undefined){ sets.push(`ore_lavorate = $${idx++}`); vals.push(ore_lavorate) }
    if (umore !== undefined)       { sets.push(`umore = $${idx++}`);       vals.push(umore) }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'Nessun campo da aggiornare' })
    }

    sets.push('updated_at = NOW()')

    const { rows } = await query(
      `UPDATE report SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      vals
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Report non trovato' })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore aggiornamento' })
  }
})

// ── DELETE /api/reports/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM report WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    )
    if (rowCount === 0) return res.status(404).json({ success: false, error: 'Report non trovato' })
    return res.json({ success: true, message: 'Report eliminato' })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore eliminazione' })
  }
})

module.exports = router
