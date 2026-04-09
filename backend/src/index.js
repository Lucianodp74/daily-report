// ================================================================
// src/index.js v2 — Entry point con logging, error handling, sicurezza
// npm install pino pino-pretty pino-http express-validator nodemailer
// ================================================================
require('dotenv').config()

const express   = require('express')
const cors      = require('cors')
const helmet    = require('helmet')
const pinoHttp  = require('pino-http')
const rateLimit = require('express-rate-limit')
const pool = require('./utils/db')
const logger    = require('./utils/logger')
const { errorHandler } = require('./middleware/errorHandler')
const { initCronJobs } = require('./jobs/cron')

const app  = express()
const PORT = process.env.PORT || 4000

// ── Sicurezza ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // gestito dal frontend Next.js
}))
app.set('trust proxy', 1)   // necessario per rate limit dietro Nginx/proxy

app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}))

// ── Logging HTTP ─────────────────────────────────────────────────
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health'   // non logga health check
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url:    req.url,
      userId: req.raw?.userId ?? null,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  }
}))

// ── Rate limiting ─────────────────────────────────────────────────
const globalLimit = rateLimit({
  windowMs:  15 * 60 * 1000,
  max:        200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:    { success: false, error: 'Troppe richieste. Riprova tra 15 minuti.', code: 'RATE_LIMIT' },
})

const loginLimit = rateLimit({
  windowMs:  15 * 60 * 1000,
  max:        10,
  skipSuccessfulRequests: true,   // conta solo i falliti
  message:    { success: false, error: 'Troppi tentativi di login.', code: 'LOGIN_RATE_LIMIT' },
})

app.use(globalLimit)
app.use('/api/auth/login',          loginLimit)
app.use('/api/auth/forgot-password', rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }))

// ── Body parsing ─────────────────────────────────────────────────
app.use(express.json({ limit: '500kb' }))
app.use(express.urlencoded({ extended: false }))

// ── Health check ─────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS ts, version() AS pg_version')
    return res.json({
      status:   'ok',
      db:       'connected',
      pg:       rows[0].pg_version.split(' ')[0],
      ts:       rows[0].ts,
      uptime:   Math.floor(process.uptime()),
      node:     process.version,
    })
  } catch (err) {
    return res.status(503).json({ status: 'error', db: 'disconnected', error: err.message })
  }
})

// ── Routes ───────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'))
app.use('/api/reports',  require('./routes/reports'))
app.use('/api/monthly',  require('./routes/monthly'))
app.use('/api/admin',    require('./routes/admin'))
app.use('/api/export',   require('./routes/export'))

// ── Admin endpoints per trigger manuale cron (solo admin) ────────
const { requireAuth, requireAdmin } = require('./middleware/auth')
let cronHandlers = null

app.post('/api/admin/cron/reminder',       requireAuth, requireAdmin, async (req, res) => {
  if (!cronHandlers) return res.status(503).json({ success: false, error: 'Cron non inizializzato' })
  cronHandlers.runReminderGiornaliero().catch(() => {})
  res.json({ success: true, message: 'Reminder giornaliero avviato' })
})
app.post('/api/admin/cron/report-mensili', requireAuth, requireAdmin, async (req, res) => {
  const { anno, mese } = req.body
  if (!anno || !mese) return res.status(400).json({ success: false, error: 'anno e mese obbligatori' })
  const { generaReportMensileTutti } = require('./services/monthlyReport')
  generaReportMensileTutti(Number(anno), Number(mese)).catch(() => {})
  res.json({ success: true, message: `Generazione ${mese}/${anno} avviata` })
})

// ── Templates per report guidato ─────────────────────────────────
app.get('/api/templates', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM templates_report WHERE attivo = true ORDER BY sort_order'
  )
  res.json({ success: true, data: rows })
})

// ── 404 ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `Endpoint ${req.method} ${req.path} non trovato`,
    code:    'NOT_FOUND',
  })
})

// ── Error handler centralizzato (DEVE stare alla fine) ───────────
app.use(errorHandler)

// ── Graceful shutdown ────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM ricevuto — shutdown graceful')
  await pool.end()
  process.exit(0)
})
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection')
})
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException — processo terminato')
  process.exit(1)
})

// ── Avvio ─────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV }, '🚀 Backend avviato')

 try {
    await pool.query('SELECT 1')
    logger.info('✅ Database connesso')

    // Auto-crea tabelle e utenti al primo avvio
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE IF NOT EXISTS utenti (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        ruolo VARCHAR(10) NOT NULL DEFAULT 'user',
        avatar VARCHAR(3),
        attivo BOOLEAN NOT NULL DEFAULT true,
        ore_standard DECIMAL(4,2) NOT NULL DEFAULT 8.0,
        ore_standard_giornaliere DECIMAL(4,2) NOT NULL DEFAULT 8.0,
        giorni_lavorativi_sett SMALLINT NOT NULL DEFAULT 5,
        tolleranza_pct DECIMAL(4,1) NOT NULL DEFAULT 10.0,
        notifiche_email BOOLEAN NOT NULL DEFAULT true,
        notifica_reminder_ora SMALLINT DEFAULT 17,
        login_attempts SMALLINT NOT NULL DEFAULT 0,
        login_locked_until TIMESTAMPTZ,
        refresh_token_hash VARCHAR(255),
        refresh_token_expires_at TIMESTAMPTZ,
        reset_token VARCHAR(128),
        reset_token_expires_at TIMESTAMPTZ,
        ultimo_accesso TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS report (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
        data DATE NOT NULL DEFAULT CURRENT_DATE,
        attivita TEXT NOT NULL,
        note TEXT,
        ore_lavorate DECIMAL(4,2) NOT NULL DEFAULT 0,
        umore SMALLINT DEFAULT NULL,
        template_id VARCHAR(50) DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT report_utente_data_uq UNIQUE (user_id, data)
      );
      CREATE TABLE IF NOT EXISTS report_mensili (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
        anno SMALLINT NOT NULL,
        mese SMALLINT NOT NULL,
        ore_totali DECIMAL(6,2) NOT NULL DEFAULT 0,
        ore_attese DECIMAL(6,2) NOT NULL DEFAULT 0,
        giorni_lavorati SMALLINT NOT NULL DEFAULT 0,
        giorni_attesi SMALLINT NOT NULL DEFAULT 0,
        giorni_sotto_std SMALLINT NOT NULL DEFAULT 0,
        media_ore_giorno DECIMAL(4,2) NOT NULL DEFAULT 0,
        percentuale_comp DECIMAL(5,2) NOT NULL DEFAULT 0,
        valutazione VARCHAR(20) NOT NULL DEFAULT 'INSUFFICIENTE',
        commento_ai TEXT,
        testo_aggregato TEXT,
        generato_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        generato_da VARCHAR(20) NOT NULL DEFAULT 'auto',
        CONSTRAINT report_mensili_uq UNIQUE (user_id, anno, mese)
      );
      CREATE TABLE IF NOT EXISTS statistiche_mensili (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        anno SMALLINT NOT NULL,
        mese SMALLINT NOT NULL,
        totale_collaboratori SMALLINT NOT NULL DEFAULT 0,
        n_ottimo SMALLINT DEFAULT 0,
        n_buono SMALLINT DEFAULT 0,
        n_sufficiente SMALLINT DEFAULT 0,
        n_insufficiente SMALLINT DEFAULT 0,
        calcolato_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT stats_mensili_uq UNIQUE (anno, mese)
      );
      CREATE TABLE IF NOT EXISTS alert_log (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL,
        canale VARCHAR(20) NOT NULL DEFAULT 'email',
        riferimento VARCHAR(20) NOT NULL,
        inviato_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        success BOOLEAN NOT NULL DEFAULT true,
        errore TEXT,
        CONSTRAINT alert_log_uq UNIQUE (user_id, tipo, riferimento)
      );
    `)
    logger.info('✅ Tabelle create/verificate')

    const { rows: check } = await pool.query('SELECT COUNT(*) FROM utenti')
    if (Number(check[0].count) === 0) {
      await pool.query(`
        INSERT INTO utenti (nome, email, password_hash, ruolo, avatar) VALUES
        ('Admin Sistema','admin@gruppovisconti.it','$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oJPGk6Kxy','admin','AD'),
        ('Vincenzo Mistretta','v.mistretta@gruppovisconti.it','$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oJPGk6Kxy','user','VM'),
        ('Dario Sinacori','d.sinacori@gruppovisconti.it','$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oJPGk6Kxy','user','DS'),
        ('Francesco Bellomo','f.bellomo@gruppovisconti.it','$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oJPGk6Kxy','user','FB'),
        ('Roberto Patane','r.patane@gruppovisconti.it','$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oJPGk6Kxy','user','RP'),
        ('Carmelo Raimondi','c.raimondi@gruppovisconti.it','$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oJPGk6Kxy','user','CR'),
        ('Federico Accetturo','f.accetturo@gruppovisconti.it','$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oJPGk6Kxy','user','FA'),
        ('Federica Santolupe','f.santolupe@gruppovisconti.it','$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oJPGk6Kxy','user','FS')
      `)
      logger.info('✅ Utenti inseriti')
    }

  } catch (err) {
    logger.fatal({ err: err.message }, '❌ Database non raggiungibile')
    process.exit(1)
  }

module.exports = app
