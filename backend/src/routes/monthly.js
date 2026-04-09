// ================================================================
// routes/monthly.js — Report mensili utente + generazione
// ================================================================
const router = require('express').Router()
const { query } = require('../utils/db')
const { requireAuth } = require('../middleware/auth')
const { requireAdmin } = require('../middleware/auth')
const { generaReportMensile, generaReportMensileTutti } = require('../services/monthlyReport')

router.use(requireAuth)

// ── GET /api/monthly — Lista report mensili dell'utente ───────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM report_mensili
       WHERE user_id = $1
       ORDER BY anno DESC, mese DESC`,
      [req.userId]
    )
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore caricamento report mensili' })
  }
})

// ── GET /api/monthly/:anno/:mese — Dettaglio mese ─────────────────
router.get('/:anno/:mese', async (req, res) => {
  const anno = Number(req.params.anno)
  const mese = Number(req.params.mese)

  try {
    const { rows: riepilogo } = await query(
      `SELECT * FROM report_mensili WHERE user_id = $1 AND anno = $2 AND mese = $3`,
      [req.userId, anno, mese]
    )

    const { rows: giorni } = await query(
      `SELECT * FROM report
       WHERE user_id = $1 AND EXTRACT(YEAR FROM data) = $2 AND EXTRACT(MONTH FROM data) = $3
       ORDER BY data ASC`,
      [req.userId, anno, mese]
    )

    return res.json({
      success: true,
      data: { riepilogo: riepilogo[0] || null, giorni }
    })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore caricamento dettaglio' })
  }
})

// ── POST /api/monthly/genera — Genera report mensile per utente ──
router.post('/genera', async (req, res) => {
  const { anno, mese } = req.body
  if (!anno || !mese) {
    return res.status(400).json({ success: false, error: 'anno e mese obbligatori' })
  }

  try {
    const result = await generaReportMensile(req.userId, anno, mese, 'manual')
    return res.json({ success: true, data: result })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Errore generazione' })
  }
})

// ── POST /api/monthly/genera-tutti — Admin: genera per tutti ──────
router.post('/genera-tutti', requireAdmin, async (req, res) => {
  const { anno, mese } = req.body
  if (!anno || !mese) {
    return res.status(400).json({ success: false, error: 'anno e mese obbligatori' })
  }

  try {
    const risultati = await generaReportMensileTutti(anno, mese)
    return res.json({ success: true, data: risultati })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Errore generazione' })
  }
})

module.exports = router
