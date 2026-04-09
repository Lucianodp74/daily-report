'use client'
import { Suspense } from 'react'
// ================================================================
// app/reset-password/page.tsx
// Gestisce sia il form "inserisci email" che "nuova password"
// ================================================================
import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { authApi } from '@/lib/api'

function ResetPasswordPage() {
  const search = useSearchParams()
  const router = useRouter()
  const token  = search.get('token')

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-navy-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
          </div>
          <span className="font-display font-semibold text-navy-800">Daily Report</span>
        </div>

        {token ? <NuovaPasswordForm token={token} router={router} /> : <RichiestaResetForm />}

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-navy-600 hover:text-navy-800">
            ← Torna al login
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Form 1: richiesta reset (inserisci email) ─────────────────────
function RichiestaResetForm() {
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<{ email: string }>()

  const onSubmit = async ({ email }: { email: string }) => {
    setError(null); setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally { setLoading(false) }
  }

  if (sent) return (
    <div className="card p-8 text-center animate-fade-in">
      <p className="text-4xl mb-3">📧</p>
      <h2 className="font-display font-bold text-slate-900 mb-2">Email inviata</h2>
      <p className="text-slate-500 text-sm leading-relaxed">
        Se l'indirizzo è registrato, riceverai un link per reimpostare la password.
        Controlla anche la cartella spam.
      </p>
    </div>
  )

  return (
    <div className="card p-8 animate-slide-up">
      <h2 className="font-display font-bold text-xl text-slate-900 mb-1">Password dimenticata?</h2>
      <p className="text-slate-500 text-sm mb-6">Inserisci la tua email per ricevere le istruzioni.</p>

      {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 mb-4">{error}</div>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input type="email" placeholder="nome@gruppovisconti.it" className="input"
            {...register('email', { required: 'Email obbligatoria' })} />
          {errors.email && <p className="form-error">{errors.email.message}</p>}
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Invio…' : 'Invia istruzioni'}
        </button>
      </form>
    </div>
  )
}

// ── Form 2: nuova password (con token) ───────────────────────────
function NuovaPasswordForm({ token, router }: { token: string; router: ReturnType<typeof useRouter> }) {
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{ password: string; conferma: string }>()

  const onSubmit = async ({ password }: { password: string }) => {
    setError(null); setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally { setLoading(false) }
  }

  if (done) return (
    <div className="card p-8 text-center animate-fade-in">
      <p className="text-4xl mb-3">✅</p>
      <h2 className="font-display font-bold text-slate-900 mb-2">Password reimpostata</h2>
      <p className="text-slate-500 text-sm">Redirect al login in corso…</p>
    </div>
  )

  return (
    <div className="card p-8 animate-slide-up">
      <h2 className="font-display font-bold text-xl text-slate-900 mb-1">Nuova password</h2>
      <p className="text-slate-500 text-sm mb-6">Scegli una password sicura (min 8 caratteri).</p>

      {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 mb-4">{error}</div>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Nuova password</label>
          <input type="password" className="input" placeholder="Min 8 caratteri"
            {...register('password', {
              required: 'Obbligatoria',
              minLength: { value: 8, message: 'Min 8 caratteri' },
              pattern: { value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: 'Deve contenere maiuscola, minuscola e numero' },
            })} />
          {errors.password && <p className="form-error">{errors.password.message}</p>}
        </div>
        <div>
          <label className="label">Conferma password</label>
          <input type="password" className="input" placeholder="Ripeti la password"
            {...register('conferma', {
              required: 'Obbligatoria',
              validate: v => v === watch('password') || 'Le password non coincidono',
            })} />
          {errors.conferma && <p className="form-error">{errors.conferma.message}</p>}
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Salvataggio…' : 'Salva nuova password'}
        </button>
      </form>
    </div>
  )
}


export default function ResetPasswordPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <ResetPasswordPage />
    </Suspense>
  )
}
