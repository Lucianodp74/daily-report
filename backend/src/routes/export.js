// ================================================================
// routes/export.js — Export CSV report
// ================================================================
const router = require('express').Router()
const jwt    = require('jsonwebtoken')
const { query } = require('../utils/db')

// Auth via query string (per download link diretti)
function authFromQuery(req, res, next) {
  const token = req.query.token || (req.headers.authorization?.slice(7))
  if (!token) return res.status(401).json({ success: false, error: 'Token mancante' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.userId    = payload.sub
    req.userRuolo = payload.ruolo
    next()
  } catch {
    return res.status(401).json({ success: false, error: 'Token non valido' })
  }
}

router.use(authFromQuery)

// ── GET /api/export/csv — Export report utente ────────────────────
router.get('/csv', async (req, res) => {
  const { data_da, data_a } = req.query
  try {
    let sql = `SELECT r.data, r.attivita, r.note, r.ore_lavorate, r.umore, r.created_at
               FROM report r WHERE r.user_id = $1`
    const params = [req.userId]; let idx = 2

    if (data_da) { sql += ` AND r.data >= $${idx++}`; params.push(data_da) }
    if (data_a)  { sql += ` AND r.data <= $${idx++}`; params.push(data_a) }

    sql += ' ORDER BY r.data DESC'

    const { rows } = await query(sql, params)

    // Genera CSV
    const header = 'Data,Attività,Note,Ore Lavorate,Umore'
    const csvRows = rows.map(r => {
      const att = `"${(r.attivita || '').replace(/"/g, '""')}"`
      const note = `"${(r.note || '').replace(/"/g, '""')}"`
      return `${r.data},${att},${note},${r.ore_lavorate},${r.umore ?? ''}`
    })

    const csv = [header, ...csvRows].join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"')
    return res.send('\uFEFF' + csv) // BOM per Excel
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore export' })
  }
})

// ── GET /api/export/monthly-csv — Export report mensile ───────────
router.get('/monthly-csv', async (req, res) => {
  const anno = Number(req.query.anno)
  const mese = Number(req.query.mese)

  if (!anno || !mese) {
    return res.status(400).json({ success: false, error: 'anno e mese obbligatori' })
  }

  try {
    // Admin vede tutti, user vede solo il suo
    let sql, params
    if (req.userRuolo === 'admin') {
      sql = `SELECT u.nome, rm.ore_totali, rm.ore_attese, rm.giorni_lavorati, rm.giorni_attesi,
                    rm.giorni_sotto_std, rm.media_ore_giorno, rm.percentuale_comp, rm.valutazione
             FROM report_mensili rm JOIN utenti u ON u.id = rm.user_id
             WHERE rm.anno = $1 AND rm.mese = $2 ORDER BY u.nome`
      params = [anno, mese]
    } else {
      sql = `SELECT rm.ore_totali, rm.ore_attese, rm.giorni_lavorati, rm.giorni_attesi,
                    rm.giorni_sotto_std, rm.media_ore_giorno, rm.percentuale_comp, rm.valutazione
             FROM report_mensili rm
             WHERE rm.user_id = $1 AND rm.anno = $2 AND rm.mese = $3`
      params = [req.userId, anno, mese]
    }

    const { rows } = await query(sql, params)

    const fields = req.userRuolo === 'admin'
      ? 'Nome,Ore Totali,Ore Attese,Giorni Lavorati,Giorni Attesi,Sotto Std,Media/Giorno,Completamento %,Valutazione'
      : 'Ore Totali,Ore Attese,Giorni Lavorati,Giorni Attesi,Sotto Std,Media/Giorno,Completamento %,Valutazione'

    const csvRows = rows.map(r => {
      const vals = req.userRuolo === 'admin'
        ? [r.nome, r.ore_totali, r.ore_attese, r.giorni_lavorati, r.giorni_attesi, r.giorni_sotto_std, r.media_ore_giorno, r.percentuale_comp, r.valutazione]
        : [r.ore_totali, r.ore_attese, r.giorni_lavorati, r.giorni_attesi, r.giorni_sotto_std, r.media_ore_giorno, r.percentuale_comp, r.valutazione]
      return vals.join(',')
    })

    const csv = [fields, ...csvRows].join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="report_mensile_${anno}_${mese}.csv"`)
    return res.send('\uFEFF' + csv)
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore export' })
  }
})

module.exports = router
