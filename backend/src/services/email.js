// ================================================================
// services/email.js
// npm install nodemailer
// Configurazione: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env
// ================================================================
const nodemailer = require('nodemailer')
const logger     = require('../utils/logger')

// ── Configura trasporto ───────────────────────────────────────────
function createTransport() {
  if (!process.env.SMTP_HOST) {
    // Modalità sviluppo: stampa email in console
    return nodemailer.createTransport({ jsonTransport: true })
  }
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool:           true,
    maxConnections: 3,
    rateDelta:      1000,
    rateLimit:      5,
  })
}

const transport = createTransport()

const FROM     = process.env.EMAIL_FROM || 'Daily Report <noreply@gruppovisconti.it>'
const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// ── Template base HTML ────────────────────────────────────────────
function wrapTemplate(content, title = 'Daily Report') {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
  .container { max-width: 560px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #312e81, #1e1b4b); padding: 28px 32px; }
  .header h1 { color: white; font-size: 20px; margin: 0; font-weight: 600; }
  .header p  { color: #a5b4fc; font-size: 13px; margin: 4px 0 0; }
  .body { padding: 32px; }
  .body p  { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 16px; }
  .body h2 { font-size: 18px; color: #1e293b; margin: 0 0 8px; }
  .btn { display: inline-block; background: #312e81; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; margin: 8px 0 16px; }
  .btn:hover { background: #1e1b4b; }
  .kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 16px 0; }
  .kpi-item { background: #f8fafc; border-radius: 10px; padding: 12px; text-align: center; }
  .kpi-val  { font-size: 22px; font-weight: 700; color: #312e81; }
  .kpi-lbl  { font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-top: 2px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; }
  .badge-ottimo  { background: #dcfce7; color: #166534; }
  .badge-buono   { background: #dbeafe; color: #1e40af; }
  .badge-suff    { background: #fef9c3; color: #854d0e; }
  .badge-insuff  { background: #fee2e2; color: #991b1b; }
  .footer { background: #f8fafc; padding: 20px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  .divider { height: 1px; background: #e2e8f0; margin: 20px 0; }
  .alert-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 16px; margin: 16px 0; }
  .alert-box p { margin: 0; color: #92400e; font-size: 14px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📋 Daily Report</h1>
    <p>Gruppo Visconti — Sistema report collaboratori</p>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    Questo messaggio è generato automaticamente. Non rispondere.<br>
    <a href="${BASE_URL}" style="color: #6366f1;">Accedi all'applicazione</a>
  </div>
</div>
</body>
</html>`
}

// ── Invio email con logging ───────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  try {
    const info = await transport.sendMail({ from: FROM, to, subject, html })

    if (process.env.SMTP_HOST) {
      logger.info({ to, subject, messageId: info.messageId }, 'Email inviata')
    } else {
      // Dev: stampa in console
      logger.debug({ to, subject, preview: JSON.parse(info.message).text?.slice(0, 200) }, '[DEV] Email simulata')
      console.log(`\n📧 [DEV EMAIL] To: ${to} | Subject: ${subject}\n`)
    }

    return true
  } catch (err) {
    logger.error({ err: err.message, to, subject }, 'Errore invio email')
    return false
  }
}

// ── Template email ────────────────────────────────────────────────

/** Reminder giornaliero: report mancante */
async function sendReminderReportMancante(email, nome) {
  const oraNow = new Date().toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' })
  const oggi   = new Date().toLocaleDateString('it', { weekday: 'long', day: 'numeric', month: 'long' })

  const html = wrapTemplate(`
    <h2>Ciao ${nome.split(' ')[0]}! 👋</h2>
    <p>Sono le <strong>${oraNow}</strong> e oggi (<strong>${oggi}</strong>) non hai ancora inserito il tuo report giornaliero.</p>
    <p>Ricorda di registrare le attività svolte per mantenere aggiornato il tuo storico mensile.</p>
    <a href="${BASE_URL}/reports/new" class="btn">📝 Inserisci report ora</a>
    <div class="divider"></div>
    <p style="font-size:13px; color:#94a3b8;">Puoi disattivare questi reminder nelle impostazioni del tuo profilo.</p>
  `, 'Reminder: report giornaliero mancante')

  return sendEmail({
    to:      email,
    subject: `📋 Reminder: inserisci il report di oggi`,
    html,
  })
}

/** Report mensile pronto */
async function sendReportMensileGenerato(email, nome, anno, mese, kpi) {
  const meseName = new Date(anno, mese - 1).toLocaleString('it', { month: 'long' })
  const badgeClass = {
    OTTIMO:        'badge-ottimo',
    BUONO:         'badge-buono',
    SUFFICIENTE:   'badge-suff',
    INSUFFICIENTE: 'badge-insuff',
  }[kpi.valutazione] ?? 'badge-insuff'
  const emoji = { OTTIMO:'🏆', BUONO:'✅', SUFFICIENTE:'⚠️', INSUFFICIENTE:'❌' }[kpi.valutazione]

  const html = wrapTemplate(`
    <h2>Report mensile pronto 📊</h2>
    <p>Ciao <strong>${nome.split(' ')[0]}</strong>, il tuo report di <strong>${meseName} ${anno}</strong> è stato generato.</p>

    <div class="kpi-grid">
      <div class="kpi-item"><div class="kpi-val">${kpi.ore_totali}h</div><div class="kpi-lbl">Ore lavorate</div></div>
      <div class="kpi-item"><div class="kpi-val">${kpi.percentuale_comp}%</div><div class="kpi-lbl">Completamento</div></div>
      <div class="kpi-item"><div class="kpi-val">${kpi.giorni_lavorati}/${kpi.giorni_attesi}</div><div class="kpi-lbl">Giorni presenti</div></div>
      <div class="kpi-item"><div class="kpi-val">${kpi.media_ore_giorno}h</div><div class="kpi-lbl">Media/giorno</div></div>
    </div>

    <p>Valutazione: <span class="badge ${badgeClass}">${emoji} ${kpi.valutazione}</span></p>

    ${kpi.has_alerts ? `
    <div class="alert-box">
      <p>⚠️ ${kpi.alerts.filter(a => a.gravita !== 'positivo').map(a => a.messaggio).join(' · ')}</p>
    </div>` : ''}

    <a href="${BASE_URL}/monthly" class="btn">📊 Visualizza dettaglio completo</a>
  `, `Report ${meseName} ${anno}`)

  return sendEmail({
    to:      email,
    subject: `📊 Report ${meseName} ${anno} — Valutazione: ${kpi.valutazione}`,
    html,
  })
}

/** Reset password */
async function sendPasswordResetEmail(email, nome, token) {
  const resetUrl = `${BASE_URL}/reset-password?token=${token}`

  const html = wrapTemplate(`
    <h2>Reset password</h2>
    <p>Ciao <strong>${nome.split(' ')[0]}</strong>, abbiamo ricevuto una richiesta di reset della password per il tuo account.</p>
    <p>Clicca il pulsante per impostare una nuova password. Il link è valido per <strong>1 ora</strong>.</p>
    <a href="${resetUrl}" class="btn">🔑 Reimposta password</a>
    <div class="divider"></div>
    <p style="font-size:13px; color:#94a3b8;">
      Se non hai richiesto il reset, ignora questa email. La tua password rimane invariata.
    </p>
  `, 'Reset password')

  return sendEmail({
    to:      email,
    subject: '🔑 Reset password — Daily Report',
    html,
  })
}

/** Alert admin: collaboratori mancanti */
async function sendAlertAdminMancanti(adminEmail, mancanti, data) {
  const dataStr  = new Date(data).toLocaleDateString('it', { weekday: 'long', day: 'numeric', month: 'long' })
  const listaHtml = mancanti.map(u =>
    `<li style="padding: 4px 0; color: #475569;">${u.nome} &lt;${u.email}&gt;</li>`
  ).join('')

  const html = wrapTemplate(`
    <h2>⚠️ Alert: report mancanti</h2>
    <p>I seguenti collaboratori non hanno inserito il report per <strong>${dataStr}</strong>:</p>
    <ul style="margin: 12px 0; padding-left: 20px;">${listaHtml}</ul>
    <a href="${BASE_URL}/admin" class="btn">👥 Vai alla dashboard admin</a>
  `, 'Alert: report mancanti')

  return sendEmail({
    to:      adminEmail,
    subject: `⚠️ ${mancanti.length} report mancanti — ${dataStr}`,
    html,
  })
}


/** Email di benvenuto per nuovo utente */
async function sendWelcomeEmail(email, nome) {
  const html = wrapTemplate(`
    <h2>Benvenuto, ${nome.split(' ')[0]}! 👋</h2>
    <p>Il tuo account sul sistema <strong>Daily Report</strong> di Gruppo Visconti è stato creato.</p>
    <p>Puoi accedere con la tua email e la password temporanea che ti è stata comunicata.</p>
    <p>Ti consigliamo di cambiare la password al primo accesso nelle impostazioni del profilo.</p>
    <a href="${BASE_URL}/login" class="btn">🚀 Accedi ora</a>
  `, 'Benvenuto su Daily Report')

  return sendEmail({
    to:      email,
    subject: '🎉 Benvenuto su Daily Report — Gruppo Visconti',
    html,
  })
}

module.exports = {
  sendWelcomeEmail,
  sendReminderReportMancante,
  sendReportMensileGenerato,
  sendPasswordResetEmail,
  sendAlertAdminMancanti,
}
