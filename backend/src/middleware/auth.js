// ================================================================
// middleware/auth.js — Middleware autenticazione JWT
// ================================================================
const jwt = require('jsonwebtoken')

function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token mancante' })
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.userId    = payload.sub
    req.userEmail = payload.email
    req.userRuolo = payload.ruolo
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token scaduto', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ success: false, error: 'Token non valido' })
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.userRuolo !== 'admin') {
      return res.status(403).json({ success: false, error: 'Accesso riservato agli amministratori' })
    }
    next()
  })
}

module.exports = { requireAuth, requireAdmin }
