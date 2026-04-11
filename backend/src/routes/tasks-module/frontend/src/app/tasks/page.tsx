'use client'
// ================================================================
// app/tasks/page.tsx — Le mie Task (vista collaboratore)
// ================================================================
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import { tasksApi, PRIORITA_CONFIG, STATO_CONFIG, type Task, type TaskStats } from '@/lib/api'
import { format, parseISO, isToday, isPast } from 'date-fns'
import { it } from 'date-fns/locale'
import clsx from 'clsx'

function avatarColor(s: string) {
  const c = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-emerald-500','bg-rose-500','bg-amber-500']
  let n = 0; for (const ch of s) n += ch.charCodeAt(0)
  return c[n % c.length]
}

export default function TasksPage() {
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [stats,   setStats]   = useState<TaskStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtro,  setFiltro]  = useState<string>('attive')
  const [selected, setSelected] = useState<Task | null>(null)
  const [commento, setCommento] = useState('')
  const [sending,  setSending]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filtro === 'attive')     params.stato = 'todo,in_corso,in_revisione'
      if (filtro === 'completate') params.stato = 'completata'
      if (filtro === 'urgenti')    params.priorita = '4'

      const [t, s] = await Promise.all([tasksApi.list(params), tasksApi.stats()])
      setTasks(t.data)
      setStats(s.data)
    } finally { setLoading(false) }
  }, [filtro])

  useEffect(() => { load() }, [load])

  // Aggiorna stato task
  const aggiornaStato = async (id: string, stato: string) => {
    try {
      const res = await tasksApi.update(id, { stato: stato as Task['stato'] })
      setTasks(prev => prev.map(t => t.id === id ? res.data : t))
      if (selected?.id === id) setSelected(res.data)
    } catch { alert('Errore aggiornamento') }
  }

  // Aggiorna avanzamento
  const aggiornaAvanzamento = async (id: string, avanzamento: number) => {
    try {
      const res = await tasksApi.update(id, { avanzamento })
      setTasks(prev => prev.map(t => t.id === id ? res.data : t))
      if (selected?.id === id) setSelected(res.data)
    } catch { }
  }

  // Invia commento
  const inviaCommento = async () => {
    if (!selected || !commento.trim()) return
    setSending(true)
    try {
      const res = await tasksApi.addComment(selected.id, commento)
      const taskAggiornata = await tasksApi.get(selected.id)
      setSelected(taskAggiornata.data)
      setTasks(prev => prev.map(t => t.id === selected.id ? taskAggiornata.data : t))
      setCommento('')
    } catch { alert('Errore invio commento') }
    finally { setSending(false) }
  }

  const tasksAttive = tasks.filter(t => !['completata','annullata'].includes(t.stato))

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">Le mie Task</h1>
            <p className="text-slate-500 text-sm mt-1">
              Attività assegnate a te o create da te
            </p>
          </div>
          <Link href="/tasks/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuova Task
          </Link>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { label: 'Totale',     value: stats.totale,     color: 'bg-slate-50  text-slate-700' },
              { label: 'Da fare',    value: stats.todo,       color: 'bg-blue-50   text-blue-700'  },
              { label: 'In corso',   value: stats.in_corso,   color: 'bg-indigo-50 text-indigo-700'},
              { label: 'Completate', value: stats.completate, color: 'bg-emerald-50 text-emerald-700'},
              { label: 'Scadute',    value: stats.scadute,    color: stats.scadute > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500' },
              { label: 'Urgenti',    value: stats.urgenti,    color: stats.urgenti > 0 ? 'bg-orange-50 text-orange-700' : 'bg-slate-50 text-slate-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`${color} rounded-xl p-3 text-center`}>
                <p className="text-xl font-display font-bold">{value}</p>
                <p className="text-xs mt-0.5 opacity-80">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filtri */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {[
            { id: 'attive',     label: 'Attive' },
            { id: 'completate', label: 'Completate' },
            { id: 'urgenti',    label: '🔴 Urgenti' },
            { id: 'tutte',      label: 'Tutte' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-all ${
                filtro === f.id ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className={clsx('grid gap-4', selected ? 'lg:grid-cols-2' : 'grid-cols-1')}>
          {/* Lista task */}
          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-slate-500">Nessuna task trovata</p>
              </div>
            ) : (
              tasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => setSelected(selected?.id === task.id ? null : task)}
                  className={clsx(
                    'card p-4 cursor-pointer transition-all hover:shadow-md',
                    selected?.id === task.id && 'ring-2 ring-navy-400 border-navy-300',
                    task.stato === 'completata' && 'opacity-60'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Priorità */}
                    <span className="text-lg shrink-0 mt-0.5">
                      {PRIORITA_CONFIG[task.priorita]?.emoji}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className={clsx('font-medium text-sm', task.stato === 'completata' && 'line-through text-slate-400')}>
                          {task.titolo}
                        </p>
                        {task.progetto && (
                          <span className="badge bg-navy-100 text-navy-700 text-xs">{task.progetto}</span>
                        )}
                      </div>

                      {task.descrizione && (
                        <p className="text-xs text-slate-500 line-clamp-2 mb-2">{task.descrizione}</p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Stato */}
                        <span className={clsx('badge text-xs', STATO_CONFIG[task.stato]?.color)}>
                          {STATO_CONFIG[task.stato]?.label}
                        </span>

                        {/* Scadenza */}
                        {task.scadenza && (
                          <span className={clsx('text-xs flex items-center gap-1',
                            task.giorni_alla_scadenza !== null && task.giorni_alla_scadenza < 0 && task.stato !== 'completata'
                              ? 'text-red-600 font-semibold'
                              : task.giorni_alla_scadenza !== null && task.giorni_alla_scadenza <= 2
                              ? 'text-orange-600'
                              : 'text-slate-400'
                          )}>
                            📅 {format(parseISO(task.scadenza), 'd MMM', { locale: it })}
                            {task.giorni_alla_scadenza !== null && task.giorni_alla_scadenza < 0 && task.stato !== 'completata' && (
                              <span className="font-bold"> (SCADUTA)</span>
                            )}
                          </span>
                        )}

                        {/* Assegnata da */}
                        <span className="text-xs text-slate-400">
                          da {task.creato_da_nome.split(' ')[0]}
                        </span>

                        {/* Commenti */}
                        {task.n_commenti > 0 && (
                          <span className="text-xs text-slate-400">💬 {task.n_commenti}</span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {task.stato !== 'completata' && task.avanzamento > 0 && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>Avanzamento</span>
                            <span>{task.avanzamento}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div
                              className="bg-navy-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${task.avanzamento}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Azioni rapide */}
                    {task.stato !== 'completata' && task.stato !== 'annullata' && (
                      <button
                        onClick={e => { e.stopPropagation(); aggiornaStato(task.id, 'completata') }}
                        className="shrink-0 w-6 h-6 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 transition-all"
                        title="Segna come completata"
                      />
                    )}
                    {task.stato === 'completata' && (
                      <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pannello dettaglio */}
          {selected && (
            <div className="card p-5 space-y-4 animate-fade-in sticky top-4 self-start">
              <div className="flex items-start justify-between">
                <h3 className="font-display font-semibold text-slate-900 flex-1 pr-2">
                  {selected.titolo}
                </h3>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl shrink-0">×</button>
              </div>

              {selected.descrizione && (
                <p className="text-sm text-slate-600 leading-relaxed">{selected.descrizione}</p>
              )}

              {/* Info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Priorità</p>
                  <p>{PRIORITA_CONFIG[selected.priorita]?.emoji} {PRIORITA_CONFIG[selected.priorita]?.label}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-xs text-slate-400">Stato</p>
                  <p>{STATO_CONFIG[selected.stato]?.label}</p>
                </div>
                {selected.scadenza && (
                  <div className="bg-slate-50 rounded-lg p-2">
                    <p className="text-xs text-slate-400">Scadenza</p>
                    <p>{format(parseISO(selected.scadenza), 'd MMMM yyyy', { locale: it })}</p>
                  </div>
                )}
                {selected.progetto && (
                  <div className="bg-slate-50 rounded-lg p-2">
                    <p className="text-xs text-slate-400">Progetto</p>
                    <p>{selected.progetto}</p>
                  </div>
                )}
              </div>

              {/* Avanzamento slider */}
              {selected.stato !== 'completata' && selected.stato !== 'annullata' && (
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Avanzamento</span>
                    <span className="font-semibold">{selected.avanzamento}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" step="5"
                    value={selected.avanzamento}
                    onChange={e => aggiornaAvanzamento(selected.id, Number(e.target.value))}
                    className="w-full accent-navy-700"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                    <span>0%</span><span>50%</span><span>100%</span>
                  </div>
                </div>
              )}

              {/* Cambia stato */}
              {selected.stato !== 'completata' && selected.stato !== 'annullata' && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Cambia stato</p>
                  <div className="flex gap-1 flex-wrap">
                    {(['todo','in_corso','in_revisione','completata'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => aggiornaStato(selected.id, s)}
                        className={clsx(
                          'text-xs px-2 py-1 rounded-lg border transition-all',
                          selected.stato === s
                            ? 'border-navy-400 bg-navy-50 text-navy-700 font-medium'
                            : 'border-slate-200 text-slate-500 hover:border-navy-300'
                        )}
                      >
                        {STATO_CONFIG[s]?.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Commenti */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Commenti ({selected.commenti?.length ?? selected.n_commenti})
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                  {selected.commenti?.map(c => (
                    <div key={c.id} className="flex gap-2">
                      <div className={`avatar-sm text-white text-xs shrink-0 ${avatarColor(c.autore_nome)}`}>
                        {c.autore_avatar ?? c.autore_nome.slice(0,2)}
                      </div>
                      <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2">
                        <p className="text-xs font-medium text-slate-700">{c.autore_nome.split(' ')[0]}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{c.testo}</p>
                      </div>
                    </div>
                  ))}
                  {(!selected.commenti || selected.commenti.length === 0) && (
                    <p className="text-xs text-slate-400 italic">Nessun commento ancora</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={commento}
                    onChange={e => setCommento(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && inviaCommento()}
                    placeholder="Scrivi un commento…"
                    className="input text-sm flex-1 py-2"
                  />
                  <button
                    onClick={inviaCommento}
                    disabled={!commento.trim() || sending}
                    className="btn-primary px-3 py-2"
                  >
                    {sending ? '…' : '↑'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
