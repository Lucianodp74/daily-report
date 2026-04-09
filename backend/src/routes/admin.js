// ================================================================
// routes/admin.js — Dashboard e gestione admin
// ================================================================
const router = require('express').Router()
const { query } = require('../utils/db')
const { requireAdmin } = require('../middleware/auth')

router.use(requireAdmin)

// ── GET /api/admin/stats — Statistiche generali ───────────────────
router.get('/stats', async (req, res) => {
  const anno = Number(req.query.anno) || new Date().getFullYear()
  const mese = Number(req.query.mese) || (new Date().getMonth() + 1)

  try {
    // Stats mese
    const { rows: meseStats } = await query(`
      SELECT
        COUNT(DISTINCT u.id)::int AS collaboratori_attivi,
        COUNT(r.id)::int          AS totale_report,
        COALESCE(SUM(r.ore_lavorate), 0)::float AS ore_totali,
        COALESCE(AVG(r.ore_lavorate), 0)::float AS media_ore_report
      FROM utenti u
      LEFT JOIN report r ON r.user_id = u.id
        AND EXTRACT(YEAR FROM r.data) = $1
        AND EXTRACT(MONTH FROM r.data) = $2
      WHERE u.ruolo = 'user' AND u.attivo = true
    `, [anno, mese])

    // Ranking mensile
    const { rows: ranking } = await query(`
      SELECT rm.*, u.nome, u.avatar
      FROM report_mensili rm
      JOIN utenti u ON u.id = rm.user_id
      WHERE rm.anno = $1 AND rm.mese = $2
      ORDER BY rm.percentuale_comp DESC
    `, [anno, mese])

    // Mancanti oggi
    const { rows: mancanti } = await query(`
      SELECT u.id, u.nome, u.email, u.avatar
      FROM utenti u
      WHERE u.ruolo = 'user' AND u.attivo = true
        AND u.id NOT IN (SELECT user_id FROM report WHERE data = CURRENT_DATE)
      ORDER BY u.nome
    `)

    // Statistiche aggregate
    const { rows: statsAgg } = await query(`
      SELECT * FROM statistiche_mensili WHERE anno = $1 AND mese = $2
    `, [anno, mese])

    // Se non ci sono statistiche aggregate, calcolale al volo dai report_mensili
    let statistiche = statsAgg[0] || null
    if (!statistiche && ranking.length > 0) {
      statistiche = {
        n_ottimo:        ranking.filter(r => r.valutazione === 'OTTIMO').length,
        n_buono:         ranking.filter(r => r.valutazione === 'BUONO').length,
        n_sufficiente:   ranking.filter(r => r.valutazione === 'SUFFICIENTE').length,
        n_insufficiente: ranking.filter(r => r.valutazione === 'INSUFFICIENTE').length,
      }
    }

    return res.json({
      success: true,
      data: {
        mese:           meseStats[0],
        ranking,
        mancanti_oggi:  mancanti,
        statistiche,
        periodo:        { anno, mese },
      }
    })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore caricamento statistiche' })
  }
})

// ── GET /api/admin/users — Lista collaboratori con stats ──────────
router.get('/users', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        u.id, u.nome, u.email, u.avatar, u.attivo,
        u.ore_standard_giornaliere, u.giorni_lavorativi_sett,
        COUNT(r.id)::int AS totale_report,
        COALESCE(SUM(r.ore_lavorate), 0)::float AS ore_totali,
        COALESCE(AVG(r.ore_lavorate), 0)::float AS media_ore,
        MAX(r.data) AS ultimo_report,
        COUNT(CASE WHEN r.data >= CURRENT_DATE - 30 THEN 1 END)::int AS report_30gg,
        CASE WHEN EXISTS(
          SELECT 1 FROM report r2 WHERE r2.user_id = u.id AND r2.data = CURRENT_DATE
        ) THEN false ELSE true END AS mancante_oggi
      FROM utenti u
      LEFT JOIN report r ON r.user_id = u.id
      WHERE u.ruolo = 'user'
      GROUP BY u.id, u.nome, u.email, u.avatar, u.attivo,
               u.ore_standard_giornaliere, u.giorni_lavorativi_sett
      ORDER BY u.nome
    `)
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore caricamento utenti' })
  }
})

// ── GET /api/admin/reports — Tutti i report (con filtri) ──────────
router.get('/reports', async (req, res) => {
  const { data_da, data_a, user_id, limit = 100 } = req.query
  try {
    let sql = `
      SELECT r.*, u.nome AS nome_utente, u.email AS email_utente, u.avatar AS avatar_utente
      FROM report r
      JOIN utenti u ON u.id = r.user_id
      WHERE 1=1
    `
    const params = []; let idx = 1

    if (data_da)  { sql += ` AND r.data >= $${idx++}`; params.push(data_da) }
    if (data_a)   { sql += ` AND r.data <= $${idx++}`; params.push(data_a) }
    if (user_id)  { sql += ` AND r.user_id = $${idx++}`; params.push(user_id) }

    sql += ` ORDER BY r.data DESC, u.nome ASC LIMIT $${idx++}`
    params.push(Number(limit))

    const { rows } = await query(sql, params)
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore caricamento report' })
  }
})

// ── GET /api/admin/monthly — Report mensili di tutti ──────────────
router.get('/monthly', async (req, res) => {
  const anno = Number(req.query.anno) || new Date().getFullYear()
  const mese = Number(req.query.mese) || (new Date().getMonth() + 1)

  try {
    const { rows } = await query(`
      SELECT rm.*, u.nome, u.avatar
      FROM report_mensili rm
      JOIN utenti u ON u.id = rm.user_id
      WHERE rm.anno = $1 AND rm.mese = $2
      ORDER BY rm.percentuale_comp DESC
    `, [anno, mese])

    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore caricamento report mensili' })
  }
})

// ── PATCH /api/admin/users/:id/toggle — Attiva/disattiva utente ──
router.patch('/users/:id/toggle', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE utenti SET attivo = NOT attivo, updated_at = NOW()
       WHERE id = $1 AND ruolo = 'user'
       RETURNING id, nome, email, attivo`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Utente non trovato' })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore aggiornamento utente' })
  }
})

module.exports = router
