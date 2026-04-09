'use client'
// ================================================================
// app/admin/page.tsx — Dashboard admin globale
// ================================================================
import { useState, useEffect } from 'react'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import StatCard from '@/components/ui/StatCard'
import ValutazioneBadge, { ProgressBar } from '@/components/ui/ValutazioneBadge'
import { adminApi, type AdminStats } from '@/lib/api'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

const MESI = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function avatarColor(s: string) {
  const colors = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-teal-500']
  let n = 0; for (const c of s) n += c.charCodeAt(0)
  return colors[n % colors.length]
}

export default function AdminPage() {
  const oggi = new Date()
  const [stats,    setStats]    = useState<AdminStats | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [anno,     setAnno]     = useState(oggi.getFullYear())
  const [mese,     setMese]     = useState(oggi.getMonth() + 1)

  useEffect(() => {
    setLoading(true)
    adminApi.stats(anno, mese)
      .then(res => { setStats(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [anno, mese])

  if (loading || !stats) return (
    <AppShell requireAdmin>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </AppShell>
  )

  const { mese: st, ranking, mancanti_oggi, statistiche } = stats

  return (
    <AppShell requireAdmin>
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">Dashboard Admin</h1>
            <p className="text-slate-500 text-sm mt-1">{format(oggi, "EEEE d MMMM yyyy", { locale: it })}</p>
          </div>
          <div className="flex items-center gap-2">
            <select className="input text-sm py-2 w-28"
              value={mese} onChange={e => setMese(Number(e.target.value))}>
              {MESI.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select className="input text-sm py-2 w-24"
              value={anno} onChange={e => setAnno(Number(e.target.value))}>
              {[oggi.getFullYear() - 1, oggi.getFullYear()].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* KPI globali mese */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <StatCard label="Collaboratori attivi" value={st.collaboratori_attivi}  color="navy"    className="animate-slide-up" />
          <StatCard label="Report nel mese"       value={st.totale_report}         color="amber"   className="animate-slide-up" />
          <StatCard label="Ore totali team"        value={`${Number(st.ore_totali).toFixed(0)}h`} color="emerald" className="animate-slide-up" />
          <StatCard label="Media ore/report"       value={`${Number(st.media_ore_report).toFixed(1)}h`} color="slate" className="animate-slide-up" />
        </div>

        {/* Distribuzione valutazioni */}
        {statistiche && (
          <div className="card p-5">
            <h2 className="font-display font-semibold text-slate-800 mb-4">
              Distribuzione valutazioni — {MESI[mese]} {anno}
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: '🏆 Ottimo',       n: statistiche.n_ottimo,        bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
                { label: '✅ Buono',        n: statistiche.n_buono,         bg: 'bg-blue-50',    text: 'text-blue-700',    bar: 'bg-blue-500' },
                { label: '⚠️ Sufficiente', n: statistiche.n_sufficiente,   bg: 'bg-amber-50',   text: 'text-amber-700',   bar: 'bg-amber-500' },
                { label: '❌ Insufficiente',n: statistiche.n_insufficiente, bg: 'bg-red-50',     text: 'text-red-700',     bar: 'bg-red-500' },
              ].map(({ label, n, bg, text, bar }) => (
                <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
                  <p className={`text-2xl font-display font-bold ${text}`}>{n}</p>
                  <p className="text-xs text-slate-500 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Ranking collaboratori */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-slate-800">Ranking {MESI[mese]}</h2>
              <Link href="/admin/monthly" className="text-xs text-navy-600 hover:text-navy-800">
                Dettaglio →
              </Link>
            </div>
            {ranking.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Nessun report mensile generato</p>
            ) : (
              <div className="space-y-3">
                {ranking.map((r, i) => (
                  <div key={r.user_id} className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {i + 1}
                    </div>
                    <div className={`avatar-sm text-white shrink-0 ${avatarColor(r.nome ?? '')}`}>
                      {r.avatar ?? (r.nome ?? '?').slice(0,2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-1">
                        <p className="text-sm font-medium text-slate-700 truncate">{r.nome}</p>
                        <span className="text-xs font-semibold text-slate-500">{r.percentuale_comp}%</span>
                      </div>
                      <ProgressBar percent={r.percentuale_comp} valutazione={r.valutazione} />
                    </div>
                    <ValutazioneBadge valutazione={r.valutazione} showEmoji={false} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alert: mancanti oggi */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-slate-800">Report mancanti oggi</h2>
              <span className={`badge ${mancanti_oggi.length === 0 ? 'badge-success' : 'bg-red-100 text-red-700'}`}>
                {mancanti_oggi.length === 0 ? '✅ Tutti presenti' : `${mancanti_oggi.length} mancanti`}
              </span>
            </div>
            {mancanti_oggi.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-4xl mb-2">🎉</p>
                <p className="text-sm text-slate-500">Tutti i collaboratori hanno inserito il report</p>
              </div>
            ) : (
              <div className="space-y-2">
                {mancanti_oggi.map(u => (
                  <div key={u.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
                    <div className={`avatar-sm text-white ${avatarColor(u.nome)}`}>
                      {u.avatar ?? u.nome.slice(0,2)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{u.nome}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </div>
                    <span className="text-xs text-red-600 font-medium">⚠️ Mancante</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick links admin */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { href: '/admin/reports', icon: '📋', label: 'Tutti i Report' },
            { href: '/admin/monthly', icon: '📊', label: 'Report Mensili' },
            { href: '/admin/users',   icon: '👥', label: 'Collaboratori' },
            { href: `/api/export/csv?token=${typeof window !== 'undefined' ? localStorage.getItem('dr_token') : ''}`, icon: '📥', label: 'Export CSV', external: true },
          ].map(({ href, icon, label, external }) => (
            external ? (
              <a key={label} href={href} download className="card-hover p-4 text-center group block">
                <div className="text-3xl mb-1">{icon}</div>
                <p className="text-sm font-medium text-slate-700 group-hover:text-navy-700">{label}</p>
              </a>
            ) : (
              <Link key={label} href={href} className="card-hover p-4 text-center group">
                <div className="text-3xl mb-1">{icon}</div>
                <p className="text-sm font-medium text-slate-700 group-hover:text-navy-700">{label}</p>
              </Link>
            )
          ))}
        </div>
      </div>
    </AppShell>
  )
}
