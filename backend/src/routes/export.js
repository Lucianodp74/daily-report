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

// ── Helper ────────────────────────────────────────────────────────
const SEP = ';'

function fmtData(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
}

function fmtTesto(t) {
  return `"${(t || '').replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '')}"`
}

function inviaCSV(res, csv, filename) {
  const buf = Buffer.from('\uFEFF' + csv, 'utf8')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Length', buf.length)
  res.setHeader('Access-Control-Allow-Origin', '*')
  return res.end(buf)
}

// ── GET /api/export/csv ───────────────────────────────────────────
router.get('/csv', async (req, res) => {
  const { data_da, data_a, user_id } = req.query
  const isAdmin = req.userRuolo === 'admin'

  try {
    let sql, params, idx

    if (isAdmin) {
      sql    = `SELECT u.nome AS nome_utente, r.data, r.attivita, r.note, r.ore_lavorate
                FROM report r JOIN utenti u ON u.id = r.user_id WHERE 1=1`
      params = []; idx = 1
      if (user_id) { sql += ` AND r.user_id = $${idx++}`; params.push(user_id) }
    } else {
      sql    = `SELECT r.data, r.attivita, r.note, r.ore_lavorate, r.umore
                FROM report r WHERE r.user_id = $1`
      params = [req.userId]; idx = 2
    }

    if (data_da) { sql += ` AND r.data >= $${idx++}`; params.push(data_da) }
    if (data_a)  { sql += ` AND r.data <= $${idx++}`; params.push(data_a) }
    sql += ' ORDER BY r.data DESC'

    const { rows } = await query(sql, params)

    const header = isAdmin
      ? ['Collaboratore','Data','Attivita','Note','Ore Lavorate'].join(SEP)
      : ['Data','Attivita','Note','Ore Lavorate','Umore'].join(SEP)

    const righe = rows.map(r => {
      const att  = fmtTesto(r.attivita)
      const note = fmtTesto(r.note)
      return isAdmin
        ? [r.nome_utente, fmtData(r.data), att, note, r.ore_lavorate].join(SEP)
        : [fmtData(r.data), att, note, r.ore_lavorate, r.umore ?? ''].join(SEP)
    })

    return inviaCSV(res, [header, ...righe].join('\n'), 'report.csv')

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore export CSV' })
  }
})

// ── GET /api/export/monthly-csv ───────────────────────────────────
router.get('/monthly-csv', async (req, res) => {
  const anno = Number(req.query.anno)
  const mese = Number(req.query.mese)

  if (!anno || !mese) {
    return res.status(400).json({ success: false, error: 'anno e mese obbligatori' })
  }

  try {
    let sql, params
    if (req.userRuolo === 'admin') {
      sql    = `SELECT u.nome, rm.ore_totali, rm.ore_attese, rm.giorni_lavorati, rm.giorni_attesi,
                       rm.giorni_sotto_std, rm.media_ore_giorno, rm.percentuale_comp, rm.valutazione
                FROM report_mensili rm JOIN utenti u ON u.id = rm.user_id
                WHERE rm.anno = $1 AND rm.mese = $2 ORDER BY u.nome`
      params = [anno, mese]
    } else {
      sql    = `SELECT rm.ore_totali, rm.ore_attese, rm.giorni_lavorati, rm.giorni_attesi,
                       rm.giorni_sotto_std, rm.media_ore_giorno, rm.percentuale_comp, rm.valutazione
                FROM report_mensili rm
                WHERE rm.user_id = $1 AND rm.anno = $2 AND rm.mese = $3`
      params = [req.userId, anno, mese]
    }

    const { rows } = await query(sql, params)

    const header = req.userRuolo === 'admin'
      ? ['Nome','Ore Totali','Ore Attese','Giorni Lavorati','Giorni Attesi','Sotto Std','Media/Giorno','Completamento %','Valutazione'].join(SEP)
      : ['Ore Totali','Ore Attese','Giorni Lavorati','Giorni Attesi','Sotto Std','Media/Giorno','Completamento %','Valutazione'].join(SEP)

    const righe = rows.map(r => {
      const vals = req.userRuolo === 'admin'
        ? [r.nome, r.ore_totali, r.ore_attese, r.giorni_lavorati, r.giorni_attesi, r.giorni_sotto_std, r.media_ore_giorno, r.percentuale_comp, r.valutazione]
        : [r.ore_totali, r.ore_attese, r.giorni_lavorati, r.giorni_attesi, r.giorni_sotto_std, r.media_ore_giorno, r.percentuale_comp, r.valutazione]
      return vals.join(SEP)
    })

    return inviaCSV(res, [header, ...righe].join('\n'), `report_mensile_${anno}_${mese}.csv`)

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore export mensile' })
  }
})

module.exports = router
