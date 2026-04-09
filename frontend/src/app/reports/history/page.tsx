'use client'
// ================================================================
// app/reports/history/page.tsx — Storico report personali
// ================================================================
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import { reportsApi, exportUrl, type Report } from '@/lib/api'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

function formatOre(n: number) {
  const v = Number(n); return v % 1 === 0 ? `${v}h` : `${v.toFixed(1)}h`
}

function oreColor(h: number) {
  if (h >= 8)   return 'text-emerald-600'
  if (h >= 6)   return 'text-amber-600'
  return 'text-red-600'
}

export default function HistoryPage() {
  const [reports,  setReports]  = useState<Report[]>([])
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filters,  setFilters]  = useState({ data_da: '', data_a: '' })

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (filters.data_da) params.data_da = filters.data_da
    if (filters.data_a)  params.data_a  = filters.data_a
    reportsApi.list({ ...params, limit: 100 })
      .then(res => { setReports(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo report?')) return
    setDeleting(id)
    try {
      await reportsApi.delete(id)
      setReports(prev => prev.filter(r => r.id !== id))
    } catch { alert('Errore eliminazione') }
    finally { setDeleting(null) }
  }

  const csvUrl = exportUrl.csv(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  )

  // Raggruppa per mese
  const grouped = reports.reduce<Record<string, Report[]>>((acc, r) => {
    const k = format(parseISO(r.data), 'yyyy-MM')
    if (!acc[k]) acc[k] = []
    acc[k].push(r)
    return acc
  }, {})

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">Storico report</h1>
            <p className="text-slate-500 text-sm mt-1">{reports.length} report trovati</p>
          </div>
          <div className="flex gap-2">
            <a href={csvUrl} download className="btn-secondary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              CSV
            </a>
            <Link href="/reports/new" className="btn-primary text-sm">+ Nuovo</Link>
          </div>
        </div>

        {/* Filtri */}
        <div className="card p-4 flex flex-wrap gap-3 items-end">
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
          <button onClick={() => setFilters({ data_da: '', data_a: '' })} className="btn-ghost text-sm">
            Azzera
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="card p-16 text-center">
            <p className="text-4xl mb-3">📄</p>
            <p className="text-slate-500">Nessun report trovato</p>
            <Link href="/reports/new" className="btn-primary mt-4 inline-flex">Crea il primo</Link>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([month, rpts]) => (
              <div key={month}>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-display font-semibold text-slate-700 capitalize text-sm">
                    {format(parseISO(month + '-01'), 'MMMM yyyy', { locale: it })}
                  </h3>
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400">
                    {rpts.reduce((s, r) => s + Number(r.ore_lavorate), 0).toFixed(1)}h totali
                  </span>
                </div>
                <div className="space-y-2">
                  {rpts.map(r => (
                    <div key={r.id} className="card p-4 flex items-start gap-4 hover:border-slate-200 transition-colors group">
                      {/* Data */}
                      <div className="shrink-0 w-12 text-center">
                        <div className="text-xs text-slate-400 uppercase">{format(parseISO(r.data), 'EEE', { locale: it })}</div>
                        <div className="font-display font-bold text-slate-900 text-lg leading-none">{format(parseISO(r.data), 'd')}</div>
                      </div>
                      {/* Testo */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 line-clamp-2">{r.attivita}</p>
                        {r.note && (
                          <p className="text-xs text-slate-400 mt-1 truncate">
                            <span className="font-medium">Note:</span> {r.note}
                          </p>
                        )}
                      </div>
                      {/* Ore + azioni */}
                      <div className="shrink-0 flex items-center gap-2">
                        <span className={`font-semibold text-sm ${oreColor(r.ore_lavorate)}`}>
                          {formatOre(r.ore_lavorate)}
                        </span>
                        <div className="hidden group-hover:flex items-center gap-1">
                          <Link
                            href={`/reports/new?edit=${r.id}`}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                          </Link>
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={deleting === r.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                          >
                            {deleting === r.id ? (
                              <span className="w-4 h-4 border border-red-300 border-t-red-600 rounded-full animate-spin block" />
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
