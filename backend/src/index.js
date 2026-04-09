require('dotenv').config()

const express   = require('express')
const cors      = require('cors')
const helmet    = require('helmet')
const rateLimit = require('express-rate-limit')
const { pool }  = require('./utils/db')
const { initCronJobs } = require('./jobs/cron')

const app  = express()
const PORT = process.env.PORT || 4000

app.use(helmet())
app.set('trust proxy', 1)
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}))

app.use(rateLimit({ windowMs: 15*60*1000, max: 200 }))
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, max: 10, skipSuccessfulRequests: true }))

app.use(express.json({ limit: '500kb' }))
app.use(express.urlencoded({ extended: false }))

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected', uptime: Math.floor(process.uptime()) })
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' })
  }
})

app.use('/api/auth',    require('./routes/auth'))
app.use('/api/reports', require('./routes/reports'))
app.use('/api/monthly', require('./routes/monthly'))
app.use('/api/admin',   require('./routes/admin'))
app.use('/api/export',  require('./routes/export'))

const { requireAuth } = require('./middleware/auth')
app.get('/api/templates', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM templates_report WHERE attivo = true ORDER BY sort_order')
    res.json({ success: true, data: rows })
  } catch {
    res.json({ success: true, data: [] })
  }
})

app.use((req, res) => {
  res.status(404).json({ success: false, error: `${req.method} ${req.path} non trovato` })
})

app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message)
  res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Errore interno' })
})

process.on('SIGTERM', async () => { await pool.end(); process.exit(0) })
process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r))
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e.message); process.exit(1) })

async function initDB() {
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
  console.log('✅ Tabelle create/verificate')

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
    console.log('✅ Utenti inseriti')
  }
}

app.listen(PORT, async () => {
  console.log(`🚀 Backend avviato su porta ${PORT}`)
  try {
    await pool.query('SELECT 1')
    console.log('✅ Database connesso')
    await initDB()
  } catch (err) {
    console.error('❌ Database non raggiungibile:', err.message)
    process.exit(1)
  }
  if (process.env.ENABLE_CRON !== 'false') initCronJobs()
})

module.exports = app
