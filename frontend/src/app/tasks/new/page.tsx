'use client'
import { Suspense } from 'react'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import AppShell from '@/components/layout/AppShell'
import { tasksApi, adminApi, authApi, PRIORITA_CONFIG, type TaskForm, type StatsUtente, type Utente } from '@/lib/api'
import clsx from 'clsx'

function NuovaTaskForm() {
  const router  = useRouter()
  const search  = useSearchParams()
  const preUser = search.get('user_id')

  const [utenti,  setUtenti]  = useState<StatsUtente[]>([])
  const [meInfo,  setMeInfo]  = useState<Utente | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<TaskForm>({
    defaultValues: { priorita: 2, assegnato_a: preUser ?? '' }
  })

  const prioritaSelezionata = watch('priorita')

  useEffect(() => {
    Promise.all([authApi.me(), adminApi.users()]).then(([me, u]) => {
      setMeInfo(me.data)
      setUtenti(u.data)
      if (me.data.ruolo !== 'admin' && !preUser) {
        setValue('assegnato_a', me.data.id)
      }
    }).catch(() => {})
  }, [preUser, setValue])

  const onSubmit = async (data: TaskForm) => {
    setError(null); setSaving(true)
    try {
      await tasksApi.create(data)
      router.push('/tasks')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore creazione task')
    } finally { setSaving(false) }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
            Indietro
          </button>
          <h1 className="font-display font-bold text-2xl text-slate-900">Nuova Task</h1>
          <p className="text-slate-500 text-sm mt-1">Crea e assegna un'attività a un collaboratore</p>
        </div>

        <div className="card p-6 animate-slide-up">
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-5 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Titolo *</label>
              <input
                type="text"
                placeholder="Es: Preparare documentazione VIA per GENZANO 1"
                className={clsx('input', errors.titolo && 'border-red-300')}
                {...register('titolo', {
                  required: 'Titolo obbligatorio',
                  minLength: { value: 5, message: 'Min 5 caratteri' }
                })}
              />
              {errors.titolo && <p className="form-error">{errors.titolo.message}</p>}
            </div>

            <div>
              <label className="label">Assegna a *</label>
              <select
                className={clsx('input', errors.assegnato_a && 'border-red-300')}
                {...register('assegnato_a', { required: 'Seleziona un destinatario' })}
              >
                <option value="">Seleziona collaboratore…</option>
                {utenti.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nome}{u.id === meInfo?.id ? ' (io)' : ''}
                  </option>
                ))}
              </select>
              {errors.assegnato_a && <p className="form-error">{errors.assegnato_a.message}</p>}
            </div>

            <div>
              <label className="label">Priorità</label>
              <div className="grid grid-cols-4 gap-2">
                {([1, 2, 3, 4] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setValue('priorita', p)}
                    className={clsx(
                      'py-2.5 rounded-xl border text-sm font-medium transition-all',
                      Number(prioritaSelezionata) === p
                        ? 'border-navy-400 bg-navy-50 text-navy-700 scale-95'
                        : 'border-slate-200 text-slate-500 hover:border-navy-300'
                    )}
                  >
                    {PRIORITA_CONFIG[p].emoji} {PRIORITA_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Descrizione</label>
              <textarea
                rows={4}
                placeholder="Descrivi cosa deve fare il collaboratore, con dettagli e contesto…"
                className="textarea"
                {...register('descrizione')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Progetto (opzionale)</label>
                <input
                  type="text"
                  placeholder="Es: ASCOLI WIND"
                  className="input"
                  {...register('progetto')}
                />
              </div>
              <div>
                <label className="label">Scadenza (opzionale)</label>
                <input
                  type="date"
                  className="input"
                  {...register('scadenza')}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 py-3">
                {saving ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creazione…</>
                ) : '✅ Crea task'}
              </button>
              <button type="button" onClick={() => router.back()} className="btn-secondary">
                Annulla
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  )
}

export default function NuovaTaskPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <NuovaTaskForm />
    </Suspense>
  )
}
