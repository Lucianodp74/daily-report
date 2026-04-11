// ================================================================
// routes/tasks.js — Sistema Task completo
// Privacy: ogni utente vede solo le task che lo riguardano
// Admin: vede tutto
// ================================================================
const router = require('express').Router()
const { query } = require('../utils/db')
const { requireAuth, requireAdmin } = require('../middleware/auth')

router.use(requireAuth)

// GET /api/tasks/utenti — lista collaboratori per assegnazione task
router.get('/utenti', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nome, avatar FROM utenti WHERE attivo = true ORDER BY nome ASC`
    )
    return res.json({ success: true, data: rows })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore' })
  }
})


// ── Helper: label priorità ────────────────────────────────────────
const PRIORITA = { 1: 'Bassa', 2: 'Media', 3: 'Alta', 4: 'Urgente' }
const PRIORITA_EMOJI = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴' }

// ── GET /api/tasks — le mie task (assegnate a me) ─────────────────
router.get('/', async (req, res) => {
  const { stato, priorita } = req.query
  const isAdmin = req.userRuolo === 'admin'

  let sql, params

  if (isAdmin) {
    // Admin vede tutte le task
    sql    = 'SELECT * FROM v_tasks WHERE 1=1'
    params = []
  } else {
    // Collaboratore vede solo le sue (assegnate a lui O create da lui)
    sql    = 'SELECT * FROM v_tasks WHERE (assegnato_a = $1 OR creato_da = $1)'
    params = [req.userId]
  }

  if (stato)    { params.push(stato);    sql += ` AND stato = $${params.length}` }
  if (priorita) { params.push(priorita); sql += ` AND priorita = $${params.length}` }

  try {
    const { rows } = await query(sql, params)
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('GET /tasks error:', err.message)
    return res.status(500).json({ success: false, error: 'Errore recupero task' })
  }
})

// ── GET /api/tasks/stats — statistiche task ───────────────────────
router.get('/stats', async (req, res) => {
  const isAdmin = req.userRuolo === 'admin'
  try {
    let sql, params
    if (isAdmin) {
      sql    = `SELECT
        COUNT(*)::int                                           AS totale,
        COUNT(CASE WHEN stato = 'todo' THEN 1 END)::int        AS todo,
        COUNT(CASE WHEN stato = 'in_corso' THEN 1 END)::int    AS in_corso,
        COUNT(CASE WHEN stato = 'completata' THEN 1 END)::int  AS completate,
        COUNT(CASE WHEN scadenza < CURRENT_DATE AND stato NOT IN ('completata','annullata') THEN 1 END)::int AS scadute,
        COUNT(CASE WHEN priorita = 4 AND stato NOT IN ('completata','annullata') THEN 1 END)::int AS urgenti
        FROM tasks`
      params = []
    } else {
      sql    = `SELECT
        COUNT(*)::int                                           AS totale,
        COUNT(CASE WHEN stato = 'todo' THEN 1 END)::int        AS todo,
        COUNT(CASE WHEN stato = 'in_corso' THEN 1 END)::int    AS in_corso,
        COUNT(CASE WHEN stato = 'completata' THEN 1 END)::int  AS completate,
        COUNT(CASE WHEN scadenza < CURRENT_DATE AND stato NOT IN ('completata','annullata') THEN 1 END)::int AS scadute,
        COUNT(CASE WHEN priorita = 4 AND stato NOT IN ('completata','annullata') THEN 1 END)::int AS urgenti
        FROM tasks WHERE assegnato_a = $1`
      params = [req.userId]
    }
    const { rows } = await query(sql, params)
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore statistiche task' })
  }
})

// ── POST /api/tasks — crea nuova task ────────────────────────────
router.post('/', async (req, res) => {
  const { titolo, descrizione, assegnato_a, priorita = 2, scadenza, progetto } = req.body

  if (!titolo?.trim() || !assegnato_a) {
    return res.status(400).json({ success: false, error: 'Titolo e destinatario obbligatori' })
  }

  try {
    // Verifica che il destinatario esista
    const { rows: utenti } = await query(
      'SELECT id FROM utenti WHERE id = $1 AND attivo = true', [assegnato_a]
    )
    if (!utenti[0]) {
      return res.status(404).json({ success: false, error: 'Utente destinatario non trovato' })
    }

    const { rows } = await query(
      `INSERT INTO tasks (creato_da, assegnato_a, titolo, descrizione, priorita, scadenza, progetto)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.userId,          // chi crea
        assegnato_a,
        titolo.trim(),
        descrizione?.trim() || null,
        Number(priorita),
        scadenza || null,
        progetto?.trim() || null,
      ]
    )

    // Recupera task completa dalla vista
    const { rows: taskCompleta } = await query(
      'SELECT * FROM v_tasks WHERE id = $1', [rows[0].id]
    )

    return res.status(201).json({ success: true, data: taskCompleta[0] })
  } catch (err) {
    console.error('POST /tasks error:', err.message)
    return res.status(500).json({ success: false, error: 'Errore creazione task' })
  }
})

// ── GET /api/tasks/:id — dettaglio task + commenti ────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows: task } = await query(
      'SELECT * FROM v_tasks WHERE id = $1', [req.params.id]
    )
    if (!task[0]) return res.status(404).json({ success: false, error: 'Task non trovata' })

    // Privacy: solo chi è coinvolto o admin
    const t = task[0]
    if (req.userRuolo !== 'admin' && t.assegnato_a !== req.userId && t.creato_da !== req.userId) {
      return res.status(403).json({ success: false, error: 'Accesso negato' })
    }

    // Commenti
    const { rows: commenti } = await query(
      `SELECT tc.*, u.nome AS autore_nome, u.avatar AS autore_avatar
       FROM task_commenti tc
       JOIN utenti u ON u.id = tc.autore_id
       WHERE tc.task_id = $1
       ORDER BY tc.created_at ASC`,
      [req.params.id]
    )

    return res.json({ success: true, data: { ...t, commenti } })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore server' })
  }
})

// ── PATCH /api/tasks/:id — aggiorna stato/avanzamento ────────────
router.patch('/:id', async (req, res) => {
  const { stato, avanzamento, titolo, descrizione, priorita, scadenza, progetto } = req.body

  try {
    // Verifica accesso
    const { rows: check } = await query(
      'SELECT creato_da, assegnato_a FROM tasks WHERE id = $1', [req.params.id]
    )
    if (!check[0]) return res.status(404).json({ success: false, error: 'Task non trovata' })

    const t = check[0]
    const puoModificare = req.userRuolo === 'admin' ||
      t.creato_da === req.userId ||
      t.assegnato_a === req.userId

    if (!puoModificare) return res.status(403).json({ success: false, error: 'Accesso negato' })

    const sets = [], params = []

    if (titolo       !== undefined) { params.push(titolo.trim());       sets.push(`titolo = $${params.length}`) }
    if (descrizione  !== undefined) { params.push(descrizione?.trim() || null); sets.push(`descrizione = $${params.length}`) }
    if (priorita     !== undefined) { params.push(Number(priorita));    sets.push(`priorita = $${params.length}`) }
    if (scadenza     !== undefined) { params.push(scadenza || null);    sets.push(`scadenza = $${params.length}`) }
    if (progetto     !== undefined) { params.push(progetto?.trim() || null); sets.push(`progetto = $${params.length}`) }
    if (avanzamento  !== undefined) {
      params.push(Number(avanzamento)); sets.push(`avanzamento = $${params.length}`)
      // Se avanzamento = 100, passa automaticamente a completata
      if (Number(avanzamento) === 100 && stato === undefined) {
        sets.push(`stato = 'completata'`)
        sets.push(`completata_at = NOW()`)
      }
    }
    if (stato !== undefined) {
      params.push(stato); sets.push(`stato = $${params.length}`)
      if (stato === 'completata') {
        sets.push(`completata_at = NOW()`)
        sets.push(`avanzamento = 100`)
      } else if (stato === 'todo') {
        sets.push(`completata_at = NULL`)
      }
    }

    if (sets.length === 0) return res.status(400).json({ success: false, error: 'Nessun campo da aggiornare' })

    params.push(req.params.id)
    await query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${params.length}`, params)

    const { rows: aggiornata } = await query('SELECT * FROM v_tasks WHERE id = $1', [req.params.id])
    return res.json({ success: true, data: aggiornata[0] })
  } catch (err) {
    console.error('PATCH /tasks error:', err.message)
    return res.status(500).json({ success: false, error: 'Errore aggiornamento' })
  }
})

// ── DELETE /api/tasks/:id — elimina (solo chi ha creato o admin) ──
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT creato_da FROM tasks WHERE id = $1', [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Task non trovata' })

    if (req.userRuolo !== 'admin' && rows[0].creato_da !== req.userId) {
      return res.status(403).json({ success: false, error: 'Solo chi ha creato la task può eliminarla' })
    }

    await query('DELETE FROM tasks WHERE id = $1', [req.params.id])
    return res.json({ success: true, message: 'Task eliminata' })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore eliminazione' })
  }
})

// ── POST /api/tasks/:id/commenti — aggiungi commento ─────────────
router.post('/:id/commenti', async (req, res) => {
  const { testo } = req.body
  if (!testo?.trim()) return res.status(400).json({ success: false, error: 'Testo obbligatorio' })

  try {
    // Verifica accesso alla task
    const { rows: check } = await query(
      'SELECT creato_da, assegnato_a FROM tasks WHERE id = $1', [req.params.id]
    )
    if (!check[0]) return res.status(404).json({ success: false, error: 'Task non trovata' })

    const t = check[0]
    const puoCommentare = req.userRuolo === 'admin' ||
      t.creato_da === req.userId ||
      t.assegnato_a === req.userId

    if (!puoCommentare) return res.status(403).json({ success: false, error: 'Accesso negato' })

    const { rows } = await query(
      `INSERT INTO task_commenti (task_id, autore_id, testo)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.userId, testo.trim()]
    )

    // Ritorna commento con nome autore
    const { rows: completo } = await query(
      `SELECT tc.*, u.nome AS autore_nome, u.avatar AS autore_avatar
       FROM task_commenti tc JOIN utenti u ON u.id = tc.autore_id
       WHERE tc.id = $1`,
      [rows[0].id]
    )
    return res.status(201).json({ success: true, data: completo[0] })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore commento' })
  }
})

module.exports = router
