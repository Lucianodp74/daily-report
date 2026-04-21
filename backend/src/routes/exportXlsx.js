// ================================================================
// routes/exportXlsx.js — Export Excel report giornalieri
// Richiede: npm install exceljs (aggiungi a package.json)
// ================================================================
const router   = require('express').Router()
const jwt      = require('jsonwebtoken')
const ExcelJS  = require('exceljs')
const { query } = require('../utils/db')

// ── Auth via query string o header ───────────────────────────────
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

// ── Colori ────────────────────────────────────────────────────────
const NAVY   = '1E3A5F'
const AMBER  = 'F59E0B'
const LIGHT  = 'F1F5F9'
const WHITE  = 'FFFFFF'
const GREEN  = 'DCFCE7'
const GREEN_TEXT = '16A34A'

// ── Formatta data ────────────────────────────────────────────────
function fmtData(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
}

// ── GET /api/export/xlsx ─────────────────────────────────────────
router.get('/xlsx', async (req, res) => {
  const { data_da, data_a, user_id } = req.query
  const isAdmin = req.userRuolo === 'admin'

  try {
    // Query dati
    let sql, params, idx
    if (isAdmin) {
      sql    = `SELECT u.nome AS nome_utente, r.data, r.attivita, r.note, r.ore_lavorate
                FROM report r JOIN utenti u ON u.id = r.user_id WHERE 1=1`
      params = []; idx = 1
      if (user_id) { sql += ` AND r.user_id = $${idx++}`; params.push(user_id) }
    } else {
      sql    = `SELECT r.data, r.attivita, r.note, r.ore_lavorate
                FROM report r WHERE r.user_id = $1`
      params = [req.userId]; idx = 2
    }
    if (data_da) { sql += ` AND r.data >= $${idx++}`; params.push(data_da) }
    if (data_a)  { sql += ` AND r.data <= $${idx++}`; params.push(data_a) }
    sql += ' ORDER BY r.data DESC'

    const { rows } = await query(sql, params)

    // Crea workbook
    const wb   = new ExcelJS.Workbook()
    wb.creator = 'Gruppo Visconti — Daily Report'
    wb.created = new Date()

    const ws = wb.addWorksheet('Report Giornalieri', {
      views: [{ state: 'frozen', ySplit: 3 }]
    })

    // ── Riga 1: Titolo ─────────────────────────────────────────
    const periodoTitolo = data_da && data_a
      ? `dal ${fmtData(data_da)} al ${fmtData(data_a)}`
      : data_da ? `dal ${fmtData(data_da)}`
      : data_a  ? `fino al ${fmtData(data_a)}`
      : 'Tutti i periodi'

    const numCols = isAdmin ? 5 : 4
    ws.mergeCells(1, 1, 1, numCols)
    const titoloCell = ws.getCell('A1')
    titoloCell.value = `GRUPPO VISCONTI — Report Giornalieri   ${periodoTitolo}`
    titoloCell.font  = { name: 'Arial', bold: true, size: 13, color: { argb: WHITE } }
    titoloCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    titoloCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws.getRow(1).height = 28

    // ── Riga 2: Sottotitolo info ────────────────────────────────
    ws.mergeCells(2, 1, 2, numCols)
    const infoCell = ws.getCell('A2')
    infoCell.value = `${rows.length} report · Generato il ${fmtData(new Date().toISOString())}`
    infoCell.font  = { name: 'Arial', size: 9, italic: true, color: { argb: 'FFFFFF' } }
    infoCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2D5282' } }
    infoCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws.getRow(2).height = 18

    // ── Riga 3: Intestazione colonne ────────────────────────────
    const intestazioni = isAdmin
      ? ['Collaboratore', 'Data', 'Attività', 'Note', 'Ore']
      : ['Data', 'Attività', 'Note', 'Ore']

    const hRow = ws.getRow(3)
    intestazioni.forEach((h, i) => {
      const cell = hRow.getCell(i + 1)
      cell.value = h
      cell.font  = { name: 'Arial', bold: true, size: 10, color: { argb: WHITE } }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = {
        bottom: { style: 'medium', color: { argb: NAVY } }
      }
    })
    hRow.height = 22

    // ── Dati ────────────────────────────────────────────────────
    let prevCollaboratore = null
    let colBg = false

    rows.forEach((r, idx) => {
      const rowNum = idx + 4
      const dRow   = ws.getRow(rowNum)

      // Alterna colore sfondo per collaboratore (admin) o riga (user)
      if (isAdmin && r.nome_utente !== prevCollaboratore) {
        colBg = !colBg
        prevCollaboratore = r.nome_utente
      }
      const bg = isAdmin
        ? (colBg ? 'F8FAFC' : 'EFF6FF')
        : (idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC')

      const valori = isAdmin
        ? [r.nome_utente, fmtData(r.data), r.attivita || '', r.note || '', Number(r.ore_lavorate)]
        : [fmtData(r.data), r.attivita || '', r.note || '', Number(r.ore_lavorate)]

      valori.forEach((v, ci) => {
        const cell  = dRow.getCell(ci + 1)
        cell.value  = v
        cell.font   = { name: 'Arial', size: 9 }
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.border = { bottom: { style: 'hair', color: { argb: 'E2E8F0' } } }

        // Allineamento
        const isOre  = ci === valori.length - 1
        const isData = (isAdmin && ci === 1) || (!isAdmin && ci === 0)
        const isNome = isAdmin && ci === 0

        cell.alignment = {
          horizontal: isOre ? 'center' : isData ? 'center' : 'left',
          vertical:   'top',
          wrapText:   !isOre && !isData && !isNome,
        }

        // Ore: grassetto e colore
        if (isOre) {
          const ore = Number(v)
          cell.font = {
            name: 'Arial', size: 9, bold: true,
            color: { argb: ore >= 8 ? '16A34A' : ore >= 6 ? '92400E' : 'DC2626' }
          }
        }
      })

      dRow.height = 40
    })

    // ── Riga totale ─────────────────────────────────────────────
    const totRow  = ws.getRow(rows.length + 4)
    const oreCol  = numCols
    const oreRef  = `${String.fromCharCode(64 + oreCol)}4:${String.fromCharCode(64 + oreCol)}${rows.length + 3}`
    const totCell = totRow.getCell(numCols)

    ws.mergeCells(rows.length + 4, 1, rows.length + 4, numCols - 1)
    const labelCell = totRow.getCell(1)
    labelCell.value = `TOTALE ORE — ${rows.length} report`
    labelCell.font  = { name: 'Arial', bold: true, size: 10, color: { argb: NAVY } }
    labelCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } }
    labelCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }

    totCell.value = { formula: `SUM(${oreRef})` }
    totCell.font  = { name: 'Arial', bold: true, size: 11, color: { argb: GREEN_TEXT } }
    totCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } }
    totCell.alignment = { horizontal: 'center', vertical: 'middle' }
    totRow.height = 24

    // ── Larghezze colonne ────────────────────────────────────────
    if (isAdmin) {
      ws.getColumn(1).width = 22  // Collaboratore
      ws.getColumn(2).width = 13  // Data
      ws.getColumn(3).width = 55  // Attività
      ws.getColumn(4).width = 35  // Note
      ws.getColumn(5).width = 8   // Ore
    } else {
      ws.getColumn(1).width = 13  // Data
      ws.getColumn(2).width = 60  // Attività
      ws.getColumn(3).width = 35  // Note
      ws.getColumn(4).width = 8   // Ore
    }

    // ── Invia file ───────────────────────────────────────────────
    const filename = `Report_GruppoVisconti_${new Date().toISOString().slice(0,10)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Access-Control-Allow-Origin', '*')

    await wb.xlsx.write(res)
    res.end()

  } catch (err) {
    console.error('[EXPORT XLSX]', err.message)
    return res.status(500).json({ success: false, error: 'Errore generazione Excel' })
  }
})

module.exports = router
