'use client'
// ================================================================
// app/settings/page.tsx — Impostazioni account e preferenze
// ================================================================
import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { authApi, type Utente, type UtenteSettings } from '@/lib/api'
import { useForm } from 'react-hook-form'

type TabId = 'preferenze' | 'password' | 'notifiche'

export default function SettingsPage() {
  const [utente,  setUtente]  = useState<Utente | null>(null)
  const [tab,     setTab]     = useState<TabId>('preferenze')

  useEffect(() => {
    authApi.me().then(r => setUtente(r.data)).catch(() => {})
  }, [])

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900">Impostazioni</h1>
          <p className="text-slate-500 text-sm mt-1">Gestisci il tuo account e le preferenze</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {([
            { id: 'preferenze', label: '⚙️ Preferenze' },
            { id: 'password',   label: '🔑 Password'   },
            { id: 'notifiche',  label: '🔔 Notifiche'  },
          ] as { id: TabId; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${
                tab === t.id ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {utente && (
          <>
            {tab === 'preferenze' && <PreferenzeTab utente={utente} onUpdate={setUtente} />}
            {tab === 'password'   && <PasswordTab />}
            {tab === 'notifiche'  && <NotificheTab utente={utente} onUpdate={setUtente} />}
          </>
        )}
      </div>
    </AppShell>
  )
}

// ── Tab Preferenze (ore standard, giorni/settimana, tolleranza) ───
function PreferenzeTab({ utente, onUpdate }: { utente: Utente; onUpdate: (u: Utente) => void }) {
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const { register, handleSubmit } = useForm<UtenteSettings>({
    defaultValues: {
      ore_standard_giornaliere: utente.ore_standard_giornaliere,
      giorni_lavorativi_sett:   utente.giorni_lavorativi_sett,
      tolleranza_pct:           utente.tolleranza_pct,
    }
  })

  const onSubmit = async (data: UtenteSettings) => {
    setMsg(null); setSaving(true)
    try {
      const res = await authApi.settings(data)
      onUpdate({ ...utente, ...res.data })
      setMsg({ type: 'ok', text: 'Preferenze salvate' })
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Errore' })
    } finally { setSaving(false) }
  }

  return (
    <div className="card p-6 animate-fade-in space-y-6">
      <div>
        <h3 className="font-semibold text-slate-800 mb-1">Configurazione ore di lavoro</h3>
        <p className="text-sm text-slate-500">Queste impostazioni influenzano il calcolo dei KPI mensili.</p>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {msg.type === 'ok' ? '✅' : '⚠️'} {msg.text}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Ore standard / giorno</label>
            <input type="number" step="0.5" min="1" max="12" className="input"
              {...register('ore_standard_giornaliere', { valueAsNumber: true })} />
            <p className="form-hint">Default: 8h. Per part-time usa 4 o 6h.</p>
          </div>
          <div>
            <label className="label">Giorni / settimana</label>
            <select className="input" {...register('giorni_lavorativi_sett', { valueAsNumber: true })}>
              <option value={4}>4 giorni (lun-gio)</option>
              <option value={5}>5 giorni (lun-ven)</option>
              <option value={6}>6 giorni (lun-sab)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Tolleranza KPI (%)</label>
          <input type="number" step="1" min="0" max="30" className="input w-40"
            {...register('tolleranza_pct', { valueAsNumber: true })} />
          <p className="form-hint">
            Abbassa le soglie di valutazione. Con tolleranza 10%: Ottimo ≥90%, Buono ≥72%, Sufficiente ≥55%.
          </p>
        </div>

        {/* Preview valutazione */}
        <div className="bg-slate-50 rounded-xl p-4 text-sm">
          <p className="font-medium text-slate-700 mb-2">📊 Anteprima soglie con la tua configurazione</p>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {[
              { label: '🏆 Ottimo',       color: 'text-emerald-700', soglia: `≥${Math.round(100 - (utente.tolleranza_pct ?? 10) * 0.05)}%` },
              { label: '✅ Buono',        color: 'text-blue-700',    soglia: `≥${Math.round(80  - (utente.tolleranza_pct ?? 10) * 0.5)}%` },
              { label: '⚠️ Sufficiente', color: 'text-amber-700',   soglia: `≥${Math.round(60  - (utente.tolleranza_pct ?? 10) * 0.5)}%` },
              { label: '❌ Insufficiente',color: 'text-red-700',     soglia: 'sotto soglia' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-lg py-2">
                <p className={`font-semibold ${s.color}`}>{s.soglia}</p>
                <p className="text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvataggio…' : 'Salva preferenze'}
        </button>
      </form>
    </div>
  )
}

// ── Tab Password ──────────────────────────────────────────────────
function PasswordTab() {
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<{
    passwordAttuale: string; passwordNuova: string; conferma: string
  }>()

  const onSubmit = async ({ passwordAttuale, passwordNuova }: { passwordAttuale: string; passwordNuova: string; conferma: string }) => {
    setMsg(null); setSaving(true)
    try {
      await authApi.changePassword(passwordAttuale, passwordNuova)
      setMsg({ type: 'ok', text: 'Password aggiornata. Verrà richiesto di fare login di nuovo.' })
      reset()
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Errore' })
    } finally { setSaving(false) }
  }

  return (
    <div className="card p-6 animate-fade-in space-y-5">
      <div>
        <h3 className="font-semibold text-slate-800 mb-1">Cambia password</h3>
        <p className="text-sm text-slate-500">Usa una password con almeno 8 caratteri, maiuscola, minuscola e numero.</p>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {msg.type === 'ok' ? '✅' : '⚠️'} {msg.text}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Password attuale</label>
          <input type="password" className="input" {...register('passwordAttuale', { required: 'Obbligatoria' })} />
          {errors.passwordAttuale && <p className="form-error">{errors.passwordAttuale.message}</p>}
        </div>
        <div>
          <label className="label">Nuova password</label>
          <input type="password" className="input"
            {...register('passwordNuova', {
              required: 'Obbligatoria',
              minLength: { value: 8, message: 'Min 8 caratteri' },
              pattern: { value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: 'Maiuscola, minuscola e numero' },
            })} />
          {errors.passwordNuova && <p className="form-error">{errors.passwordNuova.message}</p>}
        </div>
        <div>
          <label className="label">Conferma nuova password</label>
          <input type="password" className="input"
            {...register('conferma', {
              required: 'Obbligatoria',
              validate: v => v === watch('passwordNuova') || 'Le password non coincidono',
            })} />
          {errors.conferma && <p className="form-error">{errors.conferma.message}</p>}
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Aggiornamento…' : 'Aggiorna password'}
        </button>
      </form>
    </div>
  )
}

// ── Tab Notifiche ─────────────────────────────────────────────────
function NotificheTab({ utente, onUpdate }: { utente: Utente; onUpdate: (u: Utente) => void }) {
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState<string | null>(null)
  const [emailOn, setEmailOn] = useState(utente.notifiche_email)
  const [ora,     setOra]    = useState(utente.notifica_reminder_ora ?? 17)

  const save = async () => {
    setMsg(null); setSaving(true)
    try {
      const res = await authApi.settings({ notifiche_email: emailOn, notifica_reminder_ora: ora })
      onUpdate({ ...utente, ...res.data })
      setMsg('✅ Preferenze notifiche salvate')
    } catch { setMsg('⚠️ Errore salvataggio') }
    finally { setSaving(false) }
  }

  return (
    <div className="card p-6 animate-fade-in space-y-6">
      <div>
        <h3 className="font-semibold text-slate-800 mb-1">Notifiche email</h3>
        <p className="text-sm text-slate-500">Configura i reminder automatici per il report giornaliero.</p>
      </div>

      {msg && <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-4 py-3">{msg}</p>}

      <div className="space-y-4">
        {/* Toggle notifiche */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
          <div>
            <p className="font-medium text-slate-800 text-sm">📧 Reminder report mancante</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Ricevi un'email se non hai inserito il report entro l'orario configurato
            </p>
          </div>
          <button
            onClick={() => setEmailOn(v => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors ${emailOn ? 'bg-navy-700' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${emailOn ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Orario reminder */}
        {emailOn && (
          <div className="animate-fade-in">
            <label className="label">Orario reminder (ore locali)</label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="12" max="20" step="1"
                value={ora} onChange={e => setOra(Number(e.target.value))}
                className="flex-1 accent-navy-700"
              />
              <span className="w-16 text-center font-display font-bold text-navy-800 text-lg">
                {ora}:00
              </span>
            </div>
            <p className="form-hint">Il reminder viene inviato solo se non hai ancora inserito il report</p>
          </div>
        )}
      </div>

      <button onClick={save} disabled={saving} className="btn-primary">
        {saving ? 'Salvataggio…' : 'Salva notifiche'}
      </button>
    </div>
  )
}
