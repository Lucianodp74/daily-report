'use client'
// ================================================================
// components/QuickReportForm.tsx
// Inserimento report in < 30 secondi, mobile-first
// Features: template guidati, ore rapide, auto-save bozza, feedback
// ================================================================
import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { reportsApi, type ReportForm } from '@/lib/api'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

// Template report con placeholder sostituibili
const TEMPLATES = [
  { id: 'riunione',    emoji: '🗣️', label: 'Riunione / Call',
    testo: 'Partecipazione a call con [partecipanti] per [argomento]. Durata: [X]h. Esito: [risultato].' },
  { id: 'sviluppo',   emoji: '💻', label: 'Sviluppo',
    testo: 'Sviluppo [funzionalità] per [progetto]. Attività svolte: [dettaglio]. Avanzamento: [X]%.' },
  { id: 'analisi',    emoji: '🔍', label: 'Analisi',
    testo: 'Analisi [argomento] relativa a [contesto]. Principali evidenze: [punti]. Output: [deliverable].' },
  { id: 'sopralluogo',emoji: '🚗', label: 'Sopralluogo',
    testo: 'Sopralluogo presso [luogo] per [motivo]. Presenti: [nomi]. Rilievi: [dettaglio].' },
  { id: 'admin',      emoji: '📂', label: 'Attività Admin',
    testo: 'Gestione pratiche: [lista attività]. Documentazione: [dettaglio inviato/prodotto].' },
  { id: 'altro',      emoji: '✏️', label: 'Altro',
    testo: '' },
]

const ORE_RAPIDE = [4, 6, 7, 7.5, 8, 8.5, 9, 10]

const UMORE_OPTIONS = [
  { v: 1, emoji: '😓', label: 'Difficile' },
  { v: 2, emoji: '😐', label: 'Nella norma' },
  { v: 3, emoji: '🙂', label: 'Buona' },
  { v: 4, emoji: '😊', label: 'Ottima' },
  { v: 5, emoji: '🚀', label: 'Eccellente' },
]

const DRAFT_KEY = 'dr_report_draft'

interface Props {
  editId?: string
  defaultData?: Partial<ReportForm & { umore?: number }>
  onSuccess?: () => void
}

export default function QuickReportForm({ editId, defaultData, onSuccess }: Props) {
  const router    = useRouter()
  const today     = format(new Date(), 'yyyy-MM-dd')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [selectedTemplate, setTemplate] = useState<string | null>(null)
  const [umore,     setUmore]     = useState<number | null>(defaultData?.umore ?? null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)
  const [charCount, setCharCount] = useState(0)

  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm<ReportForm>({
    defaultValues: {
      data:         defaultData?.data ?? today,
      attivita:     defaultData?.attivita ?? '',
      note:         defaultData?.note ?? '',
      ore_lavorate: defaultData?.ore_lavorate ?? 8,
    }
  })

  const attivita = watch('attivita', '')

  // ── Auto-save bozza ──────────────────────────────────────────────
  useEffect(() => {
    const sub = watch((values) => {
      if (!editId && values.attivita && values.attivita.length > 10) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...values, umore, ts: Date.now() }))
      }
    })
    return () => sub.unsubscribe()
  }, [watch, umore, editId])

  // Ripristina bozza
  useEffect(() => {
    if (editId) return
    const draft = localStorage.getItem(DRAFT_KEY)
    if (!draft) return
    try {
      const d = JSON.parse(draft)
      const age = (Date.now() - d.ts) / 3600000  // ore
      if (age < 12 && d.attivita) {
        if (confirm('Hai una bozza non salvata. Ripristinarla?')) {
          reset({ data: d.data ?? today, attivita: d.attivita, note: d.note, ore_lavorate: d.ore_lavorate })
          if (d.umore) setUmore(d.umore)
        } else {
          localStorage.removeItem(DRAFT_KEY)
        }
      }
    } catch { localStorage.removeItem(DRAFT_KEY) }
  }, [editId, reset, today])

  // ── Template selection ───────────────────────────────────────────
  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setTemplate(t.id)
    if (t.testo) {
      setValue('attivita', t.testo)
      setCharCount(t.testo.length)
      // Focus textarea e seleziona il primo placeholder
      setTimeout(() => {
        const ta = textareaRef.current
        if (!ta) return
        ta.focus()
        const start = ta.value.indexOf('[')
        const end   = ta.value.indexOf(']') + 1
        if (start >= 0) ta.setSelectionRange(start, end)
      }, 50)
    } else {
      setValue('attivita', '')
      setCharCount(0)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  // ── Submit ──────────────────────────────────────────────────────
  const onSubmit = async (data: ReportForm) => {
    setError(null); setSaving(true)
    try {
      const payload = { ...data, ...(umore !== null && { umore }) }
      if (editId) {
        await reportsApi.update(editId, payload)
      } else {
        await reportsApi.create(payload)
      }
      localStorage.removeItem(DRAFT_KEY)
      setSuccess(true)
      onSuccess?.()
      setTimeout(() => router.push('/dashboard'), 1000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio')
    } finally { setSaving(false) }
  }

  const oggi = format(new Date(), 'EEEE d MMMM', { locale: it })

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      {!editId && (
        <div className="text-center py-2">
          <p className="text-slate-500 text-sm capitalize">{oggi}</p>
          <h2 className="font-display font-bold text-xl text-slate-900 mt-1">
            Come è andata oggi?
          </h2>
        </div>
      )}

      {/* Feedback stati */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center animate-fade-in">
          <p className="text-3xl mb-1">✅</p>
          <p className="font-semibold text-emerald-800">Report salvato!</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 animate-fade-in">
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* ── Selezione template rapido ─────────────────────── */}
        {!editId && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Tipo di attività
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className={clsx(
                    'flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all',
                    selectedTemplate === t.id
                      ? 'bg-navy-700 text-white border-navy-700 scale-95'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-navy-300 hover:bg-navy-50'
                  )}
                >
                  <span className="text-xl">{t.emoji}</span>
                  <span className="leading-tight text-center">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Data + Ore ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Data</label>
            <input type="date" className="input"
              {...register('data', { required: true })} />
          </div>
          <div>
            <label className="label">Ore lavorate</label>
            <input
              type="number" step="0.25" min="0" max="24"
              className={clsx('input text-center font-display font-bold text-lg',
                errors.ore_lavorate && 'border-red-300')}
              {...register('ore_lavorate', {
                required: true,
                min: 0, max: 24,
                valueAsNumber: true,
              })}
            />
          </div>
        </div>

        {/* Ore rapide */}
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-xs text-slate-400 self-center">Quick:</span>
          {ORE_RAPIDE.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setValue('ore_lavorate', h)}
              className={clsx(
                'px-2.5 py-1 text-xs rounded-lg border font-medium transition-all',
                watch('ore_lavorate') === h
                  ? 'bg-navy-700 text-white border-navy-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-navy-300'
              )}
            >
              {h}h
            </button>
          ))}
        </div>

        {/* ── Attività ───────────────────────────────────────── */}
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="label mb-0">Attività svolta *</label>
            <span className={clsx('text-xs', charCount > 2000 ? 'text-red-500' : 'text-slate-400')}>
              {charCount}/2000
            </span>
          </div>
          <textarea
            ref={textareaRef}
            rows={5}
            placeholder="Descrivi le attività principali svolte oggi…

Suggerimento: sii specifico — aiuta l'analisi AI del report mensile."
            className={clsx('textarea', errors.attivita && 'border-red-300')}
            maxLength={2000}
            {...register('attivita', {
              required:  'Descrizione obbligatoria',
              minLength: { value: 10, message: 'Minimo 10 caratteri' },
              maxLength: { value: 2000, message: 'Massimo 2000 caratteri' },
              onChange:  (e) => setCharCount(e.target.value.length),
            })}
          />
          {errors.attivita && <p className="form-error">{errors.attivita.message}</p>}
        </div>

        {/* ── Note ───────────────────────────────────────────── */}
        <div>
          <label className="label">Note (opzionali)</label>
          <textarea
            rows={2}
            placeholder="Problemi riscontrati, prossimi passi, riunioni da preparare…"
            className="textarea"
            {...register('note')}
          />
        </div>

        {/* ── Umore (opzionale, aiuta AI) ────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Come è stata la giornata? <span className="text-slate-400 normal-case font-normal">(opzionale)</span>
          </p>
          <div className="flex gap-2">
            {UMORE_OPTIONS.map(u => (
              <button
                key={u.v}
                type="button"
                onClick={() => setUmore(umore === u.v ? null : u.v)}
                className={clsx(
                  'flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-xs transition-all',
                  umore === u.v
                    ? 'bg-amber-50 border-amber-300 text-amber-800 scale-95'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-amber-200'
                )}
              >
                <span className="text-xl">{u.emoji}</span>
                <span className="hidden sm:block">{u.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Submit ─────────────────────────────────────────── */}
        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={saving || success}
            className="btn-primary flex-1 py-3 text-base"
          >
            {saving ? (
              <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvataggio…</>
            ) : success ? (
              '✅ Salvato!'
            ) : (
              editId ? '💾 Aggiorna' : '✅ Salva report'
            )}
          </button>
          {!editId && (
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-ghost px-4"
            >
              Annulla
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
