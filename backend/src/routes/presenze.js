// ================================================================
// routes/presenze.js v4
// 4 eventi GPS: checkin_mattina 9:00 | checkout_mattina 13:00
//               checkin_pomeriggio 14:30 | checkout_pomeriggio 18:30
// Tolleranza: ±30 minuti per ogni evento
// Solo da PC (rilevato lato frontend)
// ================================================================
const router = require('express').Router()
const { query } = require('../utils/db')
const { requireAuth, requireAdmin } = require('../middleware/auth')

router.use(requireAuth)

// ── Orari fissi (ora italiana) ────────────────────────────────────
const EVENTI = {
  checkin_mattina:     { ora: 9,  min: 0,  tol: 90 },   // 08:30 - 09:30
  checkout_mattina:    { ora: 13, min: 0,  tol: 90 },   // 12:30 - 13:30
  checkin_pomeriggio:  { ora: 14, min: 30, tol: 90 },   // 14:00 - 15:00
  checkout_pomeriggio: { ora: 18, min: 30, tol: 90 },   // 18:00 - 19:00
}

// ── Helper: ora italiana corrente in minuti ───────────────────────
function oraITMinuti() {
  const oraIT = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
  return oraIT.getHours() * 60 + oraIT.getMinutes()
}

// ── Determina evento attivo adesso ───────────────────────────────
function getEventoAttivo() {
  const hm = oraITMinuti()
  for (const [nome, cfg] of Object.entries(EVENTI)) {
    const centro = cfg.ora * 60 + cfg.min
    if (hm >= centro - cfg.tol && hm <= centro + cfg.tol) return nome
  }
  // Determina messaggio fuori finestra
  const hm9   = 9  * 60
  const hm13  = 13 * 60
  const hm14h = 14 * 60 + 30
  const hm18h = 18 * 60 + 30
  const tol   = 30

  if (hm < hm9 - tol)             return 'troppo_presto'
  if (hm > hm9 + tol && hm < hm13 - tol) return 'attesa_checkout_mat'
  if (hm > hm13 + tol && hm < hm14h - tol) return 'pausa_pranzo'
  if (hm > hm14h + tol && hm < hm18h - tol) return 'attesa_checkout_pom'
  if (hm > hm18h + tol)           return 'giornata_finita'
  return 'fuori_orario'
}

// ── Haversine ────────────────────────────────────────────────────
function distanzaMetri(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dL = (lat2 - lat1) * Math.PI / 180
  const dG = (lon2 - lon1) * Math.PI / 180
  const a  = Math.sin(dL/2) ** 2 +
             Math.cos(lat1 * Math.PI / 180) *
             Math.cos(lat2 * Math.PI / 180) * Math.sin(dG/2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
}

// ── Reverse geocoding ────────────────────────────────────────────
async function getIndirizzo(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=it`,
      { headers: { 'User-Agent': 'DailyReport-GruppoVisconti/1.0' }, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address ?? {}
    return [a.road, a.house_number, a.city || a.town || a.village].filter(Boolean).join(', ') || null
  } catch { return null }
}

// ── GET /api/presenze/stato ───────────────────────────────────────
router.get('/stato', async (req, res) => {
  try {
    const { rows: uRows } = await query(
      'SELECT sede_lat, sede_lon, sede_nome, sede_raggio FROM utenti WHERE id = $1',
      [req.userId]
    )
    const { rows: pRows } = await query(
      'SELECT * FROM presenze WHERE user_id = $1 AND data = CURRENT_DATE',
      [req.userId]
    )
    const p = pRows[0] ?? null

    return res.json({
      success: true,
      data: {
        presenza:     p,
        evento_attivo: getEventoAttivo(),
        eventi_fatti: {
          checkin_mattina:     !!p?.checkin_mattina_at,
          checkout_mattina:    !!p?.checkout_mattina_at,
          checkin_pomeriggio:  !!p?.checkin_pomeriggio_at,
          checkout_pomeriggio: !!p?.checkout_pomeriggio_at,
        },
        orari: {
          checkin_mattina:     '9:00',
          checkout_mattina:    '13:00',
          checkin_pomeriggio:  '14:30',
          checkout_pomeriggio: '18:30',
          tolleranza:          '±30 minuti',
        },
        sede_configurata: !!(uRows[0]?.sede_lat && uRows[0]?.sede_lon),
      }
    })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore' })
  }
})

// ── POST /api/presenze/evento — registra un evento GPS ───────────
router.post('/evento', async (req, res) => {
  const { lat, lon, tipo } = req.body

  if (!lat || !lon) {
    return res.status(400).json({ success: false, error: 'Posizione GPS obbligatoria' })
  }
  if (!EVENTI[tipo]) {
    return res.status(400).json({ success: false, error: 'Tipo evento non valido' })
  }

  // Verifica finestra oraria
  const eventoAttivo = getEventoAttivo()
  if (eventoAttivo !== tipo) {
    const cfg = EVENTI[tipo]
    const ora = `${cfg.ora}:${String(cfg.min).padStart(2,'0')}`
    return res.status(400).json({
      success: false,
      error: `Questo evento è disponibile intorno alle ${ora} (±30 minuti)`
    })
  }

  try {
    // Configurazione sede utente
    const { rows: uRows } = await query(
      'SELECT sede_lat, sede_lon, sede_raggio FROM utenti WHERE id = $1',
      [req.userId]
    )
    const u = uRows[0] ?? {}

    // Verifica non già fatto
    const { rows: check } = await query(
      `SELECT ${tipo}_at FROM presenze WHERE user_id = $1 AND data = CURRENT_DATE`,
      [req.userId]
    )
    if (check[0]?.[`${tipo}_at`]) {
      return res.status(409).json({ success: false, error: `${tipo.replace('_', ' ')} già registrato oggi` })
    }

    // Distanza sede
    let distanza = null, inSede = null
    if (u.sede_lat && u.sede_lon) {
      distanza = distanzaMetri(Number(lat), Number(lon), Number(u.sede_lat), Number(u.sede_lon))
      inSede   = distanza <= Number(u.sede_raggio ?? 200)
    }

    // Indirizzo
    const indirizzo = await getIndirizzo(lat, lon)

    // Mappa tipo → colonne DB
    const col = {
      checkin_mattina:     { at: 'checkin_mattina_at',    lat: 'checkin_mattina_lat',   lon: 'checkin_mattina_lon',   ind: 'checkin_mattina_ind',   ok: 'checkin_mattina_ok',   dist: 'distanza_checkin_mat'  },
      checkout_mattina:    { at: 'checkout_mattina_at',   lat: 'checkout_mattina_lat',  lon: 'checkout_mattina_lon',  ind: 'checkout_mattina_ind',  ok: 'checkout_mattina_ok',  dist: 'distanza_checkout_mat' },
      checkin_pomeriggio:  { at: 'checkin_pomeriggio_at', lat: 'checkin_pomeriggio_lat',lon: 'checkin_pomeriggio_lon',ind: 'checkin_pomeriggio_ind',ok: 'checkin_pomeriggio_ok',dist: 'distanza_checkin_pom'  },
      checkout_pomeriggio: { at: 'checkout_pomeriggio_at',lat: 'checkout_pomeriggio_lat',lon:'checkout_pomeriggio_lon',ind:'checkout_pomeriggio_ind',ok:'checkout_pomeriggio_ok',dist:'distanza_checkout_pom' },
    }[tipo]

    const sql = `
      INSERT INTO presenze (user_id, data, ${col.at}, ${col.lat}, ${col.lon}, ${col.ind}, ${col.ok}, ${col.dist})
      VALUES ($1, CURRENT_DATE, NOW(), $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, data) DO UPDATE SET
        ${col.at}   = NOW(),
        ${col.lat}  = $2,
        ${col.lon}  = $3,
        ${col.ind}  = $4,
        ${col.ok}   = $5,
        ${col.dist} = $6
      RETURNING *`

    const { rows } = await query(sql, [req.userId, Number(lat), Number(lon), indirizzo, inSede, distanza])

    return res.status(201).json({
      success: true,
      data:    rows[0],
      meta:    { tipo, in_sede: inSede, distanza_metri: distanza, indirizzo }
    })

  } catch (err) {
    console.error('Errore evento presenze:', err.message)
    return res.status(500).json({ success: false, error: 'Errore registrazione' })
  }
})

// ── GET /api/presenze/storico ─────────────────────────────────────
router.get('/storico', async (req, res) => {
  const { limit = 30 } = req.query
  try {
    const { rows } = await query(
      'SELECT * FROM presenze WHERE user_id = $1 ORDER BY data DESC LIMIT $2',
      [req.userId, Math.min(Number(limit), 90)]
    )
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore' })
  }
})

// ── GET /api/presenze/admin/oggi ──────────────────────────────────
router.get('/admin/oggi', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM v_presenze_oggi')
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore' })
  }
})

// ── GET /api/presenze/admin/storico ──────────────────────────────
router.get('/admin/storico', requireAdmin, async (req, res) => {
  const { data_da, data_a, user_id } = req.query
  let sql = `SELECT p.*, u.nome, u.avatar FROM presenze p JOIN utenti u ON u.id = p.user_id WHERE 1=1`
  const params = []
  if (user_id) { params.push(user_id); sql += ` AND p.user_id = $${params.length}` }
  if (data_da) { params.push(data_da); sql += ` AND p.data >= $${params.length}` }
  if (data_a)  { params.push(data_a);  sql += ` AND p.data <= $${params.length}` }
  sql += ' ORDER BY p.data DESC, u.nome LIMIT 500'
  try {
    const { rows } = await query(sql, params)
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore' })
  }
})

// ── PATCH /api/presenze/admin/sede/:userId ───────────────────────
router.patch('/admin/sede/:userId', requireAdmin, async (req, res) => {
  const { sede_lat, sede_lon, sede_nome, sede_raggio } = req.body
  try {
    const { rows } = await query(
      `UPDATE utenti SET sede_lat=$1, sede_lon=$2, sede_nome=$3, sede_raggio=$4
       WHERE id=$5 RETURNING id, nome, sede_lat, sede_lon, sede_nome, sede_raggio`,
      [sede_lat, sede_lon, sede_nome || 'Ufficio', sede_raggio || 200, req.params.userId]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Utente non trovato' })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore' })
  }
})

module.exports = router
