// ================================================================
// middleware/validate.js
// Validazione centralizzata con express-validator
// Installazione: npm install express-validator
// ================================================================
const { body, param, query, validationResult } = require('express-validator')

// Helper: raccoglie errori e risponde con 400 se presenti
function handleValidation(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error:   'Dati non validi',
      details: errors.array().map(e => ({ field: e.path, msg: e.msg }))
    })
  }
  next()
}

// ── Auth validators ───────────────────────────────────────────────
const validateLogin = [
  body('email')
    .isEmail().withMessage('Email non valida')
    .normalizeEmail()
    .trim(),
  body('password')
    .isLength({ min: 6, max: 128 }).withMessage('Password: 6-128 caratteri')
    .trim(),
  handleValidation,
]

const validateChangePassword = [
  body('passwordAttuale')
    .notEmpty().withMessage('Password attuale obbligatoria'),
  body('passwordNuova')
    .isLength({ min: 8, max: 128 }).withMessage('Nuova password: min 8 caratteri')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La password deve contenere maiuscola, minuscola e numero'),
  handleValidation,
]

const validateResetRequest = [
  body('email')
    .isEmail().withMessage('Email non valida')
    .normalizeEmail(),
  handleValidation,
]

const validateResetPassword = [
  body('token')
    .notEmpty().withMessage('Token obbligatorio')
    .isLength({ min: 32, max: 128 }),
  body('nuovaPassword')
    .isLength({ min: 8, max: 128 }).withMessage('Password: min 8 caratteri')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La password deve contenere maiuscola, minuscola e numero'),
  handleValidation,
]

// ── Report validators ─────────────────────────────────────────────
const validateReport = [
  body('data')
    .isDate({ format: 'YYYY-MM-DD' }).withMessage('Data non valida (formato YYYY-MM-DD)')
    .custom(val => {
      const d     = new Date(val)
      const oggi  = new Date()
      const limit = new Date()
      limit.setDate(limit.getDate() - 90)  // max 90 giorni indietro
      if (d > oggi) throw new Error('Non puoi inserire report per date future')
      if (d < limit) throw new Error('Non puoi inserire report più vecchi di 90 giorni')
      return true
    }),
  body('attivita')
    .trim()
    .isLength({ min: 10, max: 3000 })
    .withMessage('Descrizione: 10-3000 caratteri')
    .escape(),   // sanitizza HTML
  body('note')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Note: max 1000 caratteri')
    .escape(),
  body('ore_lavorate')
    .isFloat({ min: 0, max: 24 }).withMessage('Ore lavorate: valore tra 0 e 24')
    .custom(val => {
      // Accetta incrementi di 0.25 (15 min)
      if (val * 4 !== Math.round(val * 4)) {
        throw new Error('Ore lavorate: incrementi di 15 minuti (es. 7.5, 8.25)')
      }
      return true
    }),
  body('umore')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 5 }).withMessage('Umore: valore 1-5'),
  body('template_id')
    .optional({ nullable: true })
    .isLength({ max: 50 })
    .matches(/^[a-z0-9_-]+$/).withMessage('Template ID non valido'),
  handleValidation,
]

const validateReportUpdate = [
  param('id').isUUID().withMessage('ID report non valido'),
  body('attivita')
    .optional()
    .trim()
    .isLength({ min: 10, max: 3000 }).withMessage('Descrizione: 10-3000 caratteri')
    .escape(),
  body('note')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 })
    .escape(),
  body('ore_lavorate')
    .optional()
    .isFloat({ min: 0, max: 24 }).withMessage('Ore: 0-24'),
  body('umore')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 5 }),
  handleValidation,
]

// ── Query validators (GET con filtri) ────────────────────────────
const validateReportQuery = [
  query('data_da')
    .optional()
    .isDate({ format: 'YYYY-MM-DD' }).withMessage('data_da non valida'),
  query('data_a')
    .optional()
    .isDate({ format: 'YYYY-MM-DD' }).withMessage('data_a non valida'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 200 }).withMessage('limit: 1-200'),
  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('offset: >= 0'),
  handleValidation,
]

// ── User settings validator ───────────────────────────────────────
const validateUserSettings = [
  body('ore_standard_giornaliere')
    .optional()
    .isFloat({ min: 1, max: 12 }).withMessage('Ore standard: 1-12'),
  body('giorni_lavorativi_sett')
    .optional()
    .isInt({ min: 1, max: 7 }).withMessage('Giorni/settimana: 1-7'),
  body('tolleranza_pct')
    .optional()
    .isFloat({ min: 0, max: 50 }).withMessage('Tolleranza: 0-50%'),
  body('notifiche_email')
    .optional()
    .isBoolean().withMessage('notifiche_email: true/false'),
  body('notifica_reminder_ora')
    .optional()
    .isInt({ min: 0, max: 23 }).withMessage('Ora reminder: 0-23'),
  handleValidation,
]

module.exports = {
  validateLogin,
  validateChangePassword,
  validateResetRequest,
  validateResetPassword,
  validateReport,
  validateReportUpdate,
  validateReportQuery,
  validateUserSettings,
}
