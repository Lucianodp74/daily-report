'use client'
// ================================================================
// app/login/page.tsx
// ================================================================
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { authApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Form { email: string; password: string }

export default function LoginPage() {
  const router    = useRouter()
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<Form>()

  const onSubmit = async ({ email, password }: Form) => {
    setError(null); setLoading(true)
    try {
      // authApi.login gestisce già il salvataggio token via tokenStore
      const res = await authApi.login(email, password)
      router.push(res.data.utente.ruolo === 'admin' ? '/admin' : '/dashboard')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore di accesso')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex">
      {/* Pannello sinistro — brand */}
      <div className="hidden lg:flex lg:w-[42%] bg-navy-gradient flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <span className="text-white font-display font-semibold text-lg">Daily Report</span>
        </div>
        <div className="space-y-6">
          <h1 className="font-display text-4xl font-bold text-white leading-tight">
            Gestione Report<br/>
            <span className="text-amber-400">Collaboratori</span>
          </h1>
          <p className="text-slate-300 leading-relaxed max-w-xs">
            Traccia le attività, monitora le ore e genera report mensili con analisi AI automatica.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: '7', l: 'Collaboratori' },
              { v: 'KPI', l: 'Automatici'  },
              { v: 'AI',  l: 'Analisi testo'},
              { v: 'CSV', l: 'Export dati' },
            ].map(({ v, l }) => (
              <div key={l} className="bg-white/10 rounded-xl p-3">
                <div className="text-amber-400 font-display font-bold text-xl">{v}</div>
                <div className="text-slate-300 text-xs mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-slate-500 text-xs">© {new Date().getFullYear()} Gruppo Visconti — Accesso riservato</p>
      </div>

      {/* Pannello destro — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm animate-slide-up">
          {/* Logo mobile */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-navy-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <span className="font-display font-semibold text-navy-800">Daily Report</span>
          </div>

          <h2 className="font-display font-bold text-2xl text-slate-900 mb-1">Accedi</h2>
          <p className="text-slate-500 text-sm mb-8">Inserisci le tue credenziali per continuare</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-2 animate-fade-in">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <input
                type="email" placeholder="nome@gruppovisconti.it"
                className={`input ${errors.email ? 'border-red-300' : ''}`}
                {...register('email', {
                  required: 'Email obbligatoria',
                  pattern:  { value: /\S+@\S+\.\S+/, message: 'Email non valida' },
                })}
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Password</label>
                <Link href="/reset-password" className="text-xs text-navy-600 hover:text-navy-800 hover:underline">
                  Password dimenticata?
                </Link>
              </div>
              <input
                type="password" placeholder="••••••••"
                className={`input ${errors.password ? 'border-red-300' : ''}`}
                {...register('password', {
                  required:  'Password obbligatoria',
                  minLength: { value: 6, message: 'Minimo 6 caratteri' },
                })}
              />
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Accesso…</>
                : 'Accedi'
              }
            </button>
          </form>

          {/* Credenziali demo */}
          <div className="mt-8 p-4 bg-white rounded-xl border border-slate-100">
            <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wide">Credenziali demo</p>
            <p className="text-xs text-slate-600 font-mono">admin@gruppovisconti.it</p>
            <p className="text-xs text-slate-400 font-mono">Admin2024!</p>
          </div>
        </div>
      </div>
    </div>
  )
}
