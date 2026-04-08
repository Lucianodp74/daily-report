// ================================================================
// routes/auth.js v2 — Auth completa
// Novità: refresh token, password reset, account lock, logout sicuro
// ================================================================
const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const crypto  = require('crypto')
const { query } = require('../utils/db')
const { requireAuth } = require('../middleware/auth')
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/email')
const {
  validateLogin,
  validateChangePassword,
  validateResetRequest,
  validateResetPassword,
  validateUserSettings,
} = require('../middleware/validate')

const ACCESS_TTL  = '15m'    // ← access token breve (era 7d — CRITICO da correggere)
const REFRESH_TTL = '30d'
const MAX_LOGIN_ATTEMPTS = 5
const LOCK_MINUTES = 15

// ── Helpers ──────────────────────────────────────────────────────
function signAccess(utente) {
  return jwt.sign(
    { email: utente.email, nome: utente.nome, ruolo: utente.ruolo },
    process.env.JWT_SECRET,
    { subject: String(utente.id), expiresIn: ACCESS_TTL }
  )
}

async function signRefresh(userId) {
  const token = crypto.randomBytes(48).toString('hex')
  const hash  = await bcrypt.hash(token, 10)   // hash leggero (non password)
  const exp   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await query(
    `UPDATE utenti
     SET refresh_token_hash = $1, refresh_token_expires_at = $2
     WHERE id = $3`,
    [hash, exp, userId]
  )
  return token   // restituisce il token grezzo (da mandare al client)
}

// ── POST /api/auth/login ──────────────────────────────────────────
router.post('/login', validateLogin, async (req, res) => {
  const { email, password } = req.body

  try {
    const { rows } = await query(
      `SELECT id, nome, email, password_hash, ruolo, avatar, attivo,
              login_attempts, login_locked_until, ore_standard_giornaliere
       FROM utenti WHERE email = $1 LIMIT 1`,
      [email]
    )
    const u = rows[0]

    // Account non trovato — risposta generica (no user enumeration)
    if (!u) return res.status(401).json({ success: false, error: 'Credenziali non valide' })

    if (!u.attivo) {
      return res.status(403).json({ success: false, error: 'Account disabilitato. Contattare l\'amministratore.' })
    }

    // ── Account lock check ───────────────────────────────────────
    if (u.login_locked_until && new Date(u.login_locked_until) > new Date()) {
      const minRim = Math.ceil((new Date(u.login_locked_until) - Date.now()) / 60000)
      return res.status(429).json({
        success: false,
        error:   `Account temporaneamente bloccato. Riprovare tra ${minRim} minuti.`
      })
    }

    // ── Verifica password ────────────────────────────────────────
    const ok = await bcrypt.compare(password, u.password_hash)

    if (!ok) {
      const attempts = (u.login_attempts ?? 0) + 1
      const lockUntil = attempts >= MAX_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
        : null

      await query(
        `UPDATE utenti
         SET login_attempts = $1, login_locked_until = $2
         WHERE id = $3`,
        [attempts, lockUntil, u.id]
      )

      const rimasti = MAX_LOGIN_ATTEMPTS - attempts
      return res.status(401).json({
        success: false,
        error:   rimasti > 0
          ? `Credenziali non valide. Tentativi rimasti: ${rimasti}`
          : `Troppi tentativi. Account bloccato per ${LOCK_MINUTES} minuti.`
      })
    }

    // ── Login OK: reset tentativi, genera tokens ─────────────────
    await query(
      `UPDATE utenti
       SET login_attempts = 0, login_locked_until = NULL, ultimo_accesso = NOW()
       WHERE id = $1`,
      [u.id]
    )

    const accessToken  = signAccess(u)
    const refreshToken = await signRefresh(u.id)

    const { password_hash: _, ...pub } = u

    return res.json({
      success: true,
      data: {
        access_token:  accessToken,
        refresh_token: refreshToken,
        expires_in:    15 * 60,   // secondi
        utente:        pub,
      }
    })
  } catch (err) {
    req.log.error({ err }, 'Errore login')
    return res.status(500).json({ success: false, error: 'Errore server' })
  }
})

// ── POST /api/auth/refresh ────────────────────────────────────────
// Scambia refresh token con un nuovo access token
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body
  if (!refresh_token) {
    return res.status(400).json({ success: false, error: 'refresh_token obbligatorio' })
  }

  try {
    // Cerca utenti con refresh token non scaduto
    const { rows } = await query(
      `SELECT id, nome, email, ruolo, avatar, attivo,
              refresh_token_hash, refresh_token_expires_at
       FROM utenti
       WHERE refresh_token_expires_at > NOW()
         AND refresh_token_hash IS NOT NULL
         AND attivo = true`
    )

    // Verifica il token contro tutti i candidati (necessario perché è hashed)
    let matched = null
    for (const u of rows) {
      if (await bcrypt.compare(refresh_token, u.refresh_token_hash)) {
        matched = u
        break
      }
    }

    if (!matched) {
      return res.status(401).json({ success: false, error: 'Refresh token non valido o scaduto' })
    }

    const newAccess  = signAccess(matched)
    const newRefresh = await signRefresh(matched.id)   // rotation: invalida il vecchio

    return res.json({
      success: true,
      data: {
        access_token:  newAccess,
        refresh_token: newRefresh,
        expires_in:    15 * 60,
      }
    })
  } catch (err) {
    req.log.error({ err }, 'Errore refresh')
    return res.status(500).json({ success: false, error: 'Errore server' })
  }
})

// ── POST /api/auth/logout ─────────────────────────────────────────
// Invalida il refresh token (logout sicuro)
router.post('/logout', requireAuth, async (req, res) => {
  await query(
    `UPDATE utenti
     SET refresh_token_hash = NULL, refresh_token_expires_at = NULL
     WHERE id = $1`,
    [req.userId]
  ).catch(() => {})   // best effort

  return res.json({ success: true, message: 'Logout effettuato' })
})

// ── GET /api/auth/me ──────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nome, email, ruolo, avatar, attivo,
              ore_standard_giornaliere, giorni_lavorativi_sett,
              tolleranza_pct, notifiche_email, notifica_reminder_ora,
              ultimo_accesso, created_at
       FROM utenti WHERE id = $1`,
      [req.userId]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Utente non trovato' })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore server' })
  }
})

// ── PATCH /api/auth/settings ──────────────────────────────────────
// Aggiorna preferenze utente (ore standard, notifiche, ecc.)
router.patch('/settings', requireAuth, validateUserSettings, async (req, res) => {
  const allowed = [
    'ore_standard_giornaliere', 'giorni_lavorativi_sett',
    'tolleranza_pct', 'notifiche_email', 'notifica_reminder_ora'
  ]
  const updates = Object.entries(req.body)
    .filter(([k]) => allowed.includes(k))

  if (updates.length === 0) {
    return res.status(400).json({ success: false, error: 'Nessun campo valido' })
  }

  const sets   = updates.map(([k], i) => `${k} = $${i + 2}`)
  const values = [req.userId, ...updates.map(([, v]) => v)]

  try {
    const { rows } = await query(
      `UPDATE utenti SET ${sets.join(', ')}
       WHERE id = $1
       RETURNING id, nome, ore_standard_giornaliere, giorni_lavorativi_sett,
                 tolleranza_pct, notifiche_email, notifica_reminder_ora`,
      values
    )
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore aggiornamento' })
  }
})

// ── POST /api/auth/change-password ───────────────────────────────
router.post('/change-password', requireAuth, validateChangePassword, async (req, res) => {
  const { passwordAttuale, passwordNuova } = req.body
  try {
    const { rows } = await query('SELECT password_hash FROM utenti WHERE id = $1', [req.userId])
    if (!await bcrypt.compare(passwordAttuale, rows[0].password_hash)) {
      return res.status(401).json({ success: false, error: 'Password attuale errata' })
    }
    const hash = await bcrypt.hash(passwordNuova, 12)
    await query(
      'UPDATE utenti SET password_hash = $1, refresh_token_hash = NULL WHERE id = $2',
      [hash, req.userId]
    )
    return res.json({ success: true, message: 'Password aggiornata. Effettua di nuovo il login.' })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore server' })
  }
})

// ── POST /api/auth/forgot-password ───────────────────────────────
router.post('/forgot-password', validateResetRequest, async (req, res) => {
  const { email } = req.body

  // Risposta sempre OK (evita user enumeration)
  const successResponse = () => res.json({
    success: true,
    message: 'Se l\'email è registrata, riceverai le istruzioni.'
  })

  try {
    const { rows } = await query(
      'SELECT id, nome FROM utenti WHERE email = $1 AND attivo = true LIMIT 1',
      [email]
    )
    if (!rows[0]) return successResponse()

    const token   = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000)  // 1 ora

    await query(
      'UPDATE utenti SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3',
      [token, expires, rows[0].id]
    )

    await sendPasswordResetEmail(email, rows[0].nome, token)
    return successResponse()
  } catch (err) {
    req.log.error({ err }, 'Errore forgot-password')
    return successResponse()  // non rivelare errori
  }
})

// ── POST /api/auth/reset-password ────────────────────────────────
router.post('/reset-password', validateResetPassword, async (req, res) => {
  const { token, nuovaPassword } = req.body

  try {
    const { rows } = await query(
      `SELECT id FROM utenti
       WHERE reset_token = $1
         AND reset_token_expires_at > NOW()
         AND attivo = true
       LIMIT 1`,
      [token]
    )
    if (!rows[0]) {
      return res.status(400).json({ success: false, error: 'Token non valido o scaduto' })
    }

    const hash = await bcrypt.hash(nuovaPassword, 12)
    await query(
      `UPDATE utenti
       SET password_hash = $1,
           reset_token = NULL,
           reset_token_expires_at = NULL,
           login_attempts = 0,
           login_locked_until = NULL,
           refresh_token_hash = NULL
       WHERE id = $2`,
      [hash, rows[0].id]
    )
    return res.json({ success: true, message: 'Password reimpostata. Puoi ora effettuare il login.' })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Errore server' })
  }
})

module.exports = router
