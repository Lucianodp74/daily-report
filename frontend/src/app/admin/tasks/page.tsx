'use client'
// ================================================================
// app/admin/tasks/page.tsx — Vista admin: tutte le task
// ================================================================
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import { tasksApi, adminApi, PRIORITA_CONFIG, STATO_CONFIG, type Task, type TaskStats, type StatsUtente } from '@/lib/api'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import clsx from 'clsx'

function avatarColor(s: string) {
  const c = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-emerald-500','bg-rose-500','bg-amber-500']
  let n = 0; for (const ch of s) n += ch.charCodeAt(0)
  return c[n % c.length]
}

export default function AdminTasksPage() {
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [stats,    setStats]    = useState<TaskStats | null>(null)
  const [utenti,   setUtenti]   = useState<StatsUtente[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filtroUtente, setFiltroUtente] = useState('')
  const [filtroStato,  setFiltroStato]  = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filtroStato) params.stato = filtroStato
      const [t, s, u] = await Promise.all([
        tasksApi.list(params),
        tasksApi.stats(),
        adminApi.users(),
      ])
      let filtered = t.data
      if (filtroUtente) filtered = filtered.filter(task => task.assegnato_a === filtroUtente)
      setTasks(filtered)
      setStats(s.data)
      setUtenti(u.data)
    } finally { setLoading(false) }
  }, [filtroUtente, filtroStato])

  useEffect(() => { load() }, [load])

  const eliminaTask = async (id: string) => {
    if (!confirm('Eliminare questa task?')) return
    try {
      await tasksApi.delete(id)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch { alert('Errore eliminazione') }
  }

  return (
    <AppShell requireAdmin>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">Gestione Task</h1>
            <p className="text-slate-500 text-sm mt-1">Tutte le task assegnate ai collaboratori</p>
          </div>
          <Link href="/tasks/new" className="btn-primary">
            + Nuova Task
          </Link>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { label: 'Totale',     value: stats.totale,     color: 'bg-slate-50 text-slate-700' },
              { label: 'Da fare',    value: stats.todo,       color: 'bg-blue-50 text-blue-700'  },
              { label: 'In corso',   value: stats.in_corso,   color: 'bg-indigo-50 text-indigo-700'},
              { label: 'Completate', value: stats.completate, color: 'bg-emerald-50 text-emerald-700'},
              { label: '⚠️ Scadute', value: stats.scadute,    color: stats.scadute > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-400' },
              { label: '🔴 Urgenti', value: stats.urgenti,    color: stats.urgenti > 0 ? 'bg-orange-50 text-orange-700' : 'bg-slate-50 text-slate-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`${color} rounded-xl p-3 text-center`}>
                <p className="text-2xl font-display font-bold">{value}</p>
                <p className="text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filtri */}
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label text-xs">Collaboratore</label>
            <select className="input text-sm py-2 w-44"
              value={filtroUtente} onChange={e => setFiltroUtente(e.target.value)}>
              <option value="">Tutti</option>
              {utenti.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Stato</label>
            <select className="input text-sm py-2 w-36"
              value={filtroStato} onChange={e => setFiltroStato(e.target.value)}>
              <option value="">Tutti</option>
              <option value="todo">Da fare</option>
              <option value="in_corso">In corso</option>
              <option value="in_revisione">In revisione</option>
              <option value="completata">Completate</option>
              <option value="annullata">Annullate</option>
            </select>
          </div>
          <button onClick={() => { setFiltroUtente(''); setFiltroStato('') }}
            className="btn-ghost text-sm">Azzera</button>
        </div>

        {/* Tabella task */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-4xl mb-2">📋</p>
            <p className="text-slate-500">Nessuna task trovata</p>
            <Link href="/tasks/new" className="btn-primary mt-4 inline-flex">Crea la prima</Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Task</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assegnata a</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priorità</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stato</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avanz.</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Scadenza</th>
                    <th className="text-right px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tasks.map(task => (
                    <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <p className={clsx('font-medium text-slate-800', task.stato === 'completata' && 'line-through text-slate-400')}>
                          {task.titolo}
                        </p>
                        {task.progetto && (
                          <span className="badge bg-navy-100 text-navy-700 text-xs mt-0.5">{task.progetto}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`avatar-sm text-white text-xs ${avatarColor(task.assegnato_a_nome)}`}>
                            {task.assegnato_a_avatar ?? task.assegnato_a_nome.slice(0,2)}
                          </div>
                          <span className="text-slate-700 whitespace-nowrap">{task.assegnato_a_nome.split(' ')[0]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span>{PRIORITA_CONFIG[task.priorita]?.emoji} {PRIORITA_CONFIG[task.priorita]?.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('badge text-xs', STATO_CONFIG[task.stato]?.color)}>
                          {STATO_CONFIG[task.stato]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5">
                            <div className="bg-navy-600 h-1.5 rounded-full" style={{ width: `${task.avanzamento}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{task.avanzamento}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {task.scadenza ? (
                          <span className={clsx('text-xs',
                            task.giorni_alla_scadenza !== null && task.giorni_alla_scadenza < 0 && task.stato !== 'completata'
                              ? 'text-red-600 font-semibold' : 'text-slate-500'
                          )}>
                            {format(parseISO(task.scadenza), 'd MMM', { locale: it })}
                            {task.giorni_alla_scadenza !== null && task.giorni_alla_scadenza < 0 && task.stato !== 'completata' && ' ⚠️'}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => eliminaTask(task.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          title="Elimina task"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
