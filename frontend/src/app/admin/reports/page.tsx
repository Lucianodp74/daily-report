'use client'
// ================================================================
// app/admin/reports/page.tsx
// ================================================================
import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import { adminApi, exportUrl, type ReportCompleto, type StatsUtente } from '@/lib/api'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

function oreColor(h: number) {
  if (h >= 8) return 'text-emerald-600'
  if (h >= 6) return 'text-amber-600'
  return 'text-red-600'
}

function avatarColor(s: string) {
  const c = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-teal-500']
  let n = 0; for (const ch of s) n += ch.charCodeAt(0)
  return c[n % c.length]
}

export default function AdminReportsPage() {
  const [selected, setSelected] = useState<any>(null)
  const [reports, setReports] = useState<ReportCompleto[]>([])
  const [users,   setUsers]   = useState<StatsUtente[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ user_id: '', data_da: '', data_a: '' })

  const load = useCallback(() => {
    setLoading(true)
    const p: Record<string, string> = {}
    if (filters.user_id) p.user_id = filters.user_id
    if (filters.data_da) p.data_da = filters.data_da
    if (filters.data_a)  p.data_a  = filters.data_a

    Promise.all([adminApi.reports(p), adminApi.users()])
      .then(([r, u]) => { setReports(r.data); setUsers(u.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])

  const oreTotal = reports.reduce((s, r) => s + r.ore_lavorate, 0)

  return (
    <AppShell requireAdmin>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">Report — Vista Admin</h1>
            <p className="text-slate-500 text-sm mt-1">
              {reports.length} report · {Number(oreTotal).toFixed(1)}h totali
            </p>
          </div>
          <a
            href={exportUrl.csv(Object.fromEntries(Object.entries(filters).filter(([,v]) => v)))}
            download
            className="btn-secondary"
          >
            📥 Export CSV
          </a>
        </div>

        {/* Filtri */}
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label text-xs">Collaboratore</label>
            <select className="input text-sm py-2 w-44"
              value={filters.user_id}
              onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}
            >
              <option value="">Tutti</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Dal</label>
            <input type="date" className="input text-sm py-2" value={filters.data_da}
              onChange={e => setFilters(f => ({ ...f, data_da: e.target.value }))} />
          </div>
          <div>
            <label className="label text-xs">Al</label>
            <input type="date" className="input text-sm py-2" value={filters.data_a}
              onChange={e => setFilters(f => ({ ...f, data_a: e.target.value }))} />
          </div>
          <button onClick={() => setFilters({ user_id: '', data_da: '', data_a: '' })}
            className="btn-ghost text-sm">Azzera</button>
        </div>

        {/* Tabella */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Collaboratore</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Attività</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Note</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ore</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {reports.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-400">Nessun report trovato</td>
                    </tr>
                  ) : (
                    reports.map(r => (
                      <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(r)} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`avatar-sm text-white text-xs ${avatarColor(r.nome_utente)}`}>
                              {r.avatar_utente ?? r.nome_utente.slice(0,2)}
                            </div>
                            <span className="font-medium text-slate-700 whitespace-nowrap">{r.nome_utente}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {format(parseISO(r.data), 'EEE d MMM yyyy', { locale: it })}
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-xs">
                          <p className="line-clamp-2">{r.attivita}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-400 max-w-xs">
                          <p className="truncate">{r.note ?? '—'}</p>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${oreColor(r.ore_lavorate)}`}>
                          {r.ore_lavorate}h
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    
      {/* Modal dettaglio report */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="avatar-sm bg-navy-600 text-white">{selected.avatar_utente || selected.nome_utente?.slice(0,2).toUpperCase()}</div>
                <div>
                  <p className="font-display font-semibold text-slate-900">{selected.nome_utente}</p>
                  <p className="text-xs text-slate-500">{new Date(selected.data).toLocaleDateString('it', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase mb-1">Attivit\u00e0 svolte</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{selected.attivita}</p>
              </div>
              {selected.note && (
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase mb-1">Note</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{selected.note}</p>
                </div>
              )}
              <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
                <div><span className="text-xs text-slate-400">Ore:</span> <span className="font-semibold text-navy-700">{Number(selected.ore_lavorate).toFixed(1)}h</span></div>
                {selected.umore && <div><span className="text-xs text-slate-400">Umore:</span> <span className="text-lg">{["","\ud83d\ude13","\ud83d\ude10","\ud83d\ude42","\ud83d\ude0a","\ud83d\ude80"][selected.umore]}</span></div>}
              </div>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  )
}
