// ================================================================
// middleware/errorHandler.js
// Gestione centralizzata errori — evita leak di stack trace in prod
// ================================================================
const logger = require('../utils/logger')

// Tipi di errore applicativi (non espongono stack in produzione)
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message)
    this.statusCode = statusCode
    this.code       = code
    this.isOperational = true
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR')
    this.details = details
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Risorsa') {
    super(`${resource} non trovata`, 404, 'NOT_FOUND')
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Accesso negato') {
    super(message, 403, 'FORBIDDEN')
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Non autenticato') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

// ── Error handler Express ─────────────────────────────────────────
function errorHandler(err, req, res, _next) {
  const isProd = process.env.NODE_ENV === 'production'

  // Errore operativo (previsto): logga come warn
  if (err.isOperational) {
    logger.warn({ err: { message: err.message, code: err.code }, req: { method: req.method, url: req.url, userId: req.userId } })

    return res.status(err.statusCode).json({
      success: false,
      error:   err.message,
      code:    err.code,
      ...(err.details && { details: err.details }),
    })
  }

  // Errore PostgreSQL — mappa a messaggi user-friendly
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error:   'Dato già esistente. Controlla le informazioni inserite.',
      code:    'DUPLICATE',
    })
  }
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      error:   'Riferimento a dato non esistente.',
      code:    'FOREIGN_KEY',
    })
  }

  // Errore inaspettato — logga come error (include stack)
  logger.error({
    err: {
      message: err.message,
      stack:   err.stack,
      code:    err.code,
    },
    req: {
      method: req.method,
      url:    req.url,
      body:   isProd ? '[hidden]' : req.body,
      userId: req.userId,
    }
  }, 'Errore inaspettato')

  return res.status(500).json({
    success: false,
    error:   'Errore interno del server',
    code:    'INTERNAL_ERROR',
    // In sviluppo mostra il messaggio reale
    ...((!isProd) && { debug: err.message }),
  })
}

// ── Async wrapper — evita dimenticare try/catch nelle routes ──────
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
}
