'use client'
// ================================================================
// app/reports/new/page.tsx — Inserimento / modifica report
// ================================================================
import { useState, Suspense, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { reportsApi, type ReportForm } from '@/lib/api'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

function NewReportPage() {
  const router = useRouter()
  const search = useSearchParams()
  const editId = search.get('edit')   // se presente → modalità modifica

  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ReportForm>({
    defaultValues: { data: today, attivita: '', note: '', ore_lavorate: 8 }
  })

  const attivita = watch('attivita', '')

  // Se modifica: carica dati esistenti
  useEffect(() => {
    if (!editId) return
    reportsApi.list().then(res => {
      const r = res.data.find(x => x.id === editId)
      if (r) {
        setValue('data',          r.data)
        setValue('attivita',      r.attivita)
        setValue('note',          r.note ?? '')
        setValue('ore_lavorate',  r.ore_lavorate)
      }
    }).catch(() => {})
  }, [editId, setValue])

  const onSubmit = async (data: ReportForm) => {
    setError(null); setSaving(true)
    try {
      if (editId) {
        await reportsApi.update(editId, data)
      } else {
        await reportsApi.create(data)
      }
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 1200)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio')
    } finally { setSaving(false) }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
            Indietro
          </button>
          <h1 className="font-display font-bold text-2xl text-slate-900">
            {editId ? 'Modifica report' : 'Nuovo report'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {editId ? 'Aggiorna le attività inserite' : 'Descrivi le attività svolte oggi'}
          </p>
        </div>

        <div className="card p-6 animate-slide-up">
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center gap-3 animate-fade-in">
              <span className="text-2xl">✅</span>
              <p className="text-emerald-800 font-medium text-sm">Report salvato con successo!</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6 animate-fade-in">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Data + Ore */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Data *</label>
                <input type="date" className={`input ${errors.data ? 'border-red-300' : ''}`}
                  {...register('data', { required: 'Data obbligatoria' })} />
                {errors.data && <p className="form-error">{errors.data.message}</p>}
              </div>
              <div>
                <label className="label">Ore lavorate *</label>
                <input
                  type="number" step="0.5" min="0" max="24"
                  placeholder="8"
                  className={`input ${errors.ore_lavorate ? 'border-red-300' : ''}`}
                  {...register('ore_lavorate', {
                    required: 'Ore obbligatorie',
                    min: { value: 0,  message: 'Min 0' },
                    max: { value: 24, message: 'Max 24' },
                    valueAsNumber: true,
                  })}
                />
                {errors.ore_lavorate && <p className="form-error">{errors.ore_lavorate.message}</p>}
              </div>
            </div>

            {/* Attività */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Descrizione attività *</label>
                <span className="text-xs text-slate-400">{attivita.length}/2000</span>
              </div>
              <textarea
                rows={6}
                placeholder="Descrivi le attività svolte oggi in modo chiaro e dettagliato…"
                className={`textarea ${errors.attivita ? 'border-red-300' : ''}`}
                maxLength={2000}
                {...register('attivita', {
                  required:  'Descrizione obbligatoria',
                  minLength: { value: 10, message: 'Minimo 10 caratteri' },
                  maxLength: { value: 2000, message: 'Massimo 2000 caratteri' },
                })}
              />
              {errors.attivita && <p className="form-error">{errors.attivita.message}</p>}
              <p className="form-hint">Descrizione dettagliata → analisi AI più precisa nel report mensile</p>
            </div>

            {/* Note */}
            <div>
              <label className="label">Note (opzionali)</label>
              <textarea
                rows={3}
                placeholder="Eventuali note, problemi, prossimi passi…"
                className="textarea"
                maxLength={500}
                {...register('note')}
              />
            </div>

            {/* Suggerimenti ore */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs text-slate-500 self-center">Ore rapide:</span>
              {[4, 6, 7, 7.5, 8, 8.5, 9, 10].map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setValue('ore_lavorate', h)}
                  className="px-3 py-1 text-xs rounded-lg border border-slate-200 hover:bg-navy-50 hover:border-navy-300 hover:text-navy-700 transition-all"
                >
                  {h}h
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={saving || success} className="btn-primary flex-1">
                {saving ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvataggio…</>
                ) : (
                  editId ? 'Aggiorna report' : 'Salva report'
                )}
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


export default function NewReportPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <NewReportPage />
    </Suspense>
  )
}
