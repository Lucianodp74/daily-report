'use client'
// ================================================================
// app/admin/presenze/page.tsx v4 — 4 eventi GPS per giorno
// ================================================================
import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import { presenzeApi, type PresenzaOggiV4 } from '@/lib/api'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import clsx from 'clsx'

function avatarColor(s: string) {
  const c = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-emerald-500','bg-rose-500','bg-amber-500']
  let n = 0; for (const ch of s) n += ch.charCodeAt(0)
  return c[n % c.length]
}

function OraCell({ at, ok, distanza, ind }: {
  at?: string | null; ok?: boolean | null; distanza?: number | null; ind?: string | null
}) {
  if (!at) return <span className="text-slate-300 text-xs">—</span>
  return (
    <div className="space-y-0.5">
      <p className="font-mono text-slate-700 text-xs font-medium">
        {format(parseISO(at), 'HH:mm')}
      </p>
      {ok === false ? (
        <span className="badge bg-red-100 text-red-700 text-xs">❌ {distanza}m</span>
      ) : ok === true ? (
        <span className="badge bg-emerald-100 text-emerald-700 text-xs">✅</span>
      ) : null}
      {ind && <p className="text-xs text-slate-400 truncate max-w-[120px]">{ind}</p>}
    </div>
  )
}

function oreMinuti(min: number | null) {
  if (!min) return '—'
  return `${Math.floor(min/60)}h ${min%60}m`
}

export default function AdminPresenzeOggiPage() {
  const [presenze,   setPresenze]   = useState<PresenzaOggiV4[]>([])
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const load = useCallback(async () => {
    try {
      const res = await presenzeApi.adminOggi()
      setPresenze(res.data)
      setLastUpdate(new Date())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 120000)
    return () => clearInterval(interval)
  }, [load])

  const oggi = format(new Date(), "EEEE d MMMM yyyy", { locale: it })

  const completi  = presenze.filter(p => p.stato === 'completo')
  const parziali  = presenze.filter(p => ['in_mattina','pausa_pranzo','in_pomeriggio'].includes(p.stato))
  const assenti   = presenze.filter(p => p.stato === 'assente')
  const fuoriSede = presenze.filter(p => p.alert_fuori_sede)

  return (
    <AppShell requireAdmin>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">Presenze oggi</h1>
            <p className="text-slate-500 text-sm mt-1 capitalize">{oggi}</p>
          </div>
          <button onClick={load} className="btn-secondary text-sm">↻ Aggiorna</button>
        </div>

        {/* Contatori */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '✅ Giornata completa', value: completi.length,  color: 'bg-emerald-50 text-emerald-700' },
            { label: '⏳ In corso',          value: parziali.length,  color: 'bg-blue-50 text-blue-700'      },
            { label: '⚫ Non pervenuto',     value: assenti.length,   color: 'bg-slate-50 text-slate-500'    },
            { label: '⚠️ Fuori sede',        value: fuoriSede.length, color: fuoriSede.length > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`${color} rounded-2xl p-4 text-center`}>
              <p className="text-3xl font-display font-bold">{value}</p>
              <p className="text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Alert fuori sede */}
        {fuoriSede.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 animate-fade-in">
            <p className="font-semibold text-red-800 text-sm mb-1">⚠️ Collaboratori fuori sede</p>
            {fuoriSede.map(p => (
              <p key={p.user_id} className="text-sm text-red-700 mt-0.5">
                • <strong>{p.nome}</strong>
                {p.checkin_mattina_ok === false  && ` · check-in mattina fuori sede (${p.distanza_checkin_mat}m)`}
                {p.checkout_mattina_ok === false && ` · check-out mattina fuori sede (${p.distanza_checkout_mat}m)`}
                {p.checkin_pomeriggio_ok === false  && ` · check-in pom. fuori sede (${p.distanza_checkin_pom}m)`}
                {p.checkout_pomeriggio_ok === false && ` · check-out pom. fuori sede (${p.distanza_checkout_pom}m)`}
              </p>
            ))}
          </div>
        )}

        {/* Tabella */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Collaboratore</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">▶️ 9:00 In</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">⏹️ 13:00 Out</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">▶️ 14:30 In</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">⏹️ 18:30 Out</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Ore mat.</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Ore pom.</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {presenze.map(p => (
                    <tr key={p.user_id} className={clsx(
                      'hover:bg-slate-50 transition-colors',
                      p.alert_fuori_sede && 'bg-red-50/30'
                    )}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className={clsx('avatar-sm text-white text-xs', avatarColor(p.nome))}>
                            {p.avatar ?? p.nome.slice(0,2)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{p.nome}</p>
                            {p.sede_nome && <p className="text-xs text-slate-400">{p.sede_nome}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <OraCell at={p.checkin_mattina_at} ok={p.checkin_mattina_ok}
                          distanza={p.distanza_checkin_mat} ind={p.checkin_mattina_ind} />
                      </td>
                      <td className="px-4 py-4">
                        <OraCell at={p.checkout_mattina_at} ok={p.checkout_mattina_ok}
                          distanza={p.distanza_checkout_mat} ind={p.checkout_mattina_ind} />
                      </td>
                      <td className="px-4 py-4">
                        <OraCell at={p.checkin_pomeriggio_at} ok={p.checkin_pomeriggio_ok}
                          distanza={p.distanza_checkin_pom} ind={p.checkin_pomeriggio_ind} />
                      </td>
                      <td className="px-4 py-4">
                        <OraCell at={p.checkout_pomeriggio_at} ok={p.checkout_pomeriggio_ok}
                          distanza={p.distanza_checkout_pom} ind={p.checkout_pomeriggio_ind} />
                      </td>
                      <td className="px-4 py-4 text-slate-600 text-xs font-medium">
                        {oreMinuti(p.minuti_mattina)}
                      </td>
                      <td className="px-4 py-4 text-slate-600 text-xs font-medium">
                        {oreMinuti(p.minuti_pomeriggio)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {p.stato === 'completo'     && <span className="badge bg-emerald-100 text-emerald-700">✅ Completo</span>}
                        {p.stato === 'in_pomeriggio'&& <span className="badge bg-blue-100    text-blue-700">🔵 Pom.</span>}
                        {p.stato === 'pausa_pranzo' && <span className="badge bg-amber-100   text-amber-700">🍽️ Pausa</span>}
                        {p.stato === 'in_mattina'   && <span className="badge bg-indigo-100  text-indigo-700">🟢 Mat.</span>}
                        {p.stato === 'assente'      && <span className="badge bg-slate-100   text-slate-500">⚫ Assente</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 text-right">
          Aggiornato alle {format(lastUpdate, 'HH:mm:ss')} · si aggiorna ogni 2 minuti
        </p>
      </div>
    </AppShell>
  )
}
