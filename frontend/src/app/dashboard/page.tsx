'use client'
// ================================================================
// app/dashboard/page.tsx — Dashboard collaboratore
// ================================================================
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import StatCard from '@/components/ui/StatCard'
import ValutazioneBadge, { ProgressBar } from '@/components/ui/ValutazioneBadge'
import { reportsApi, authApi, type Report, type StatsMese, type Utente } from '@/lib/api'
import { format, isToday, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

function fmt(n: number | string) { const v = Number(n); return v % 1 === 0 ? `${v}h` : `${v.toFixed(1)}h` }

export default function DashboardPage() {
  const oggi   = new Date()
  const [utente,     setUtente]     = useState<Utente | null>(null)
  const [stats,      setStats]      = useState<StatsMese | null>(null)
  const [recenti,    setRecenti]    = useState<Report[]>([])
  const [reportOggi, setReportOggi] = useState<Report | null>(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    Promise.all([
      authApi.me(),
      reportsApi.stats(oggi.getFullYear(), oggi.getMonth() + 1),
      reportsApi.list({ limit: 7 }),
    ]).then(([me, st, rpts]) => {
      setUtente(me.data)
      setStats(st.data)
      setRecenti(rpts.data)
      setReportOggi(rpts.data.find(r => isToday(parseISO(r.data))) ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </AppShell>
  )

  const meseName = format(oggi, 'MMMM yyyy', { locale: it })
  // Compatibilità: media_ore_giorno (nuovo backend) o media_ore (vecchio)
  const mediaOre = stats ? ((stats as any).media_ore_giorno ?? (stats as any).media_ore ?? 0) : 0

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">
              Ciao, {utente?.nome.split(' ')[0]} 👋
            </h1>
            <p className="text-slate-500 text-sm mt-1 capitalize">
              {format(oggi, "EEEE d MMMM yyyy", { locale: it })}
            </p>
          </div>
          <Link href="/reports/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuovo Report
          </Link>
        </div>

        {/* Banner report oggi */}
        {!reportOggi ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3 animate-fade-in">
            <span className="text-2xl">📋</span>
            <div className="flex-1">
              <p className="font-medium text-amber-900 text-sm">Report di oggi non ancora inserito</p>
              <p className="text-amber-700 text-xs mt-0.5">Ricorda di inserire le attività svolte oggi.</p>
            </div>
            <Link href="/reports/new" className="btn-amber text-xs px-4 py-2">Inserisci ora</Link>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div className="flex-1">
              <p className="font-medium text-emerald-900 text-sm">Report di oggi inserito — {fmt(reportOggi.ore_lavorate)}</p>
              <p className="text-emerald-700 text-xs mt-0.5 line-clamp-2">{reportOggi.attivita}</p>
            </div>
            <Link href={`/reports/new?edit=${reportOggi.id}`} className="btn-secondary text-xs px-4 py-2">Modifica</Link>
          </div>
        )}

        {/* KPI mese */}
        {stats && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-slate-800 capitalize">{meseName}</h2>
              <ValutazioneBadge valutazione={stats.valutazione} />
            </div>

            {/* Alert KPI */}
            {stats.has_alerts && stats.alerts.some(a => a.gravita !== 'positivo') && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3 flex items-start gap-2">
                <span className="text-amber-500 text-sm shrink-0">⚠️</span>
                <div className="space-y-0.5">
                  {stats.alerts.filter(a => a.gravita !== 'positivo').map(a => (
                    <p key={a.tipo} className="text-xs text-amber-800">{a.messaggio}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
              <StatCard label="Ore Lavorate"    value={fmt(stats.ore_totali)}        sub={`su ${fmt(stats.ore_attese)} attese`}          color="navy"    className="animate-slide-up" />
              <StatCard label="Giorni Lavorati" value={`${stats.giorni_lavorati}gg`} sub={`mancanti: ${stats.giorni_mancanti}gg`}         color="amber"   className="animate-slide-up" />
              <StatCard label="Media/giorno"    value={fmt(mediaOre)}                sub="ore/giorno"                                      color="emerald" className="animate-slide-up" />
              <StatCard label="Completamento"   value={`${stats.percentuale_comp}%`} sub={`sotto std: ${stats.giorni_sotto_std}gg`}        color="slate"   className="animate-slide-up" />
            </div>

            <div className="mt-3 card p-4">
              <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
                <span>Avanzamento mensile</span>
                <span className="font-medium">{stats.percentuale_comp}%</span>
              </div>
              <ProgressBar percent={stats.percentuale_comp} valutazione={stats.valutazione} />
            </div>
          </div>
        )}

        {/* Ultimi report */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-slate-800">Ultimi report</h2>
            <Link href="/reports/history" className="text-sm text-navy-600 hover:text-navy-800 font-medium">
              Vedi tutti →
            </Link>
          </div>
          {recenti.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">
              <p className="text-3xl mb-2">📄</p>
              <p className="text-sm">Nessun report ancora inserito</p>
              <Link href="/reports/new" className="btn-primary mt-4 inline-flex">Inizia ora</Link>
            </div>
          ) : (
            <div className="space-y-2 stagger">
              {recenti.map(r => (
                <Link
                  key={r.id}
                  href={`/reports/new?edit=${r.id}`}
                  className="card-hover block p-4 hover:border-navy-200 group"
                >
                  <div className="flex items-start gap-4">
                    <div className="text-center shrink-0 w-10">
                      <div className="text-xs text-slate-400 uppercase leading-none">{format(parseISO(r.data), 'MMM', { locale: it })}</div>
                      <div className="font-display font-bold text-slate-900 text-xl leading-tight">{format(parseISO(r.data), 'd')}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 line-clamp-2 group-hover:text-slate-900">{r.attivita}</p>
                      {r.note && <p className="text-xs text-slate-400 mt-1 truncate">{r.note}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-sm font-semibold text-navy-700">{fmt(r.ore_lavorate)}</span>
                      {isToday(parseISO(r.data)) && <span className="ml-2 badge bg-navy-100 text-navy-700">oggi</span>}
                      {r.umore && <div className="text-base mt-0.5">{['','😓','😐','🙂','😊','🚀'][r.umore]}</div>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { href: '/monthly',         icon: '📊', label: 'Report Mensili',    desc: 'Storico e AI' },
            { href: '/reports/history', icon: '📁', label: 'Storico Completo',  desc: 'Tutti i report' },
            { href: '/settings',        icon: '⚙️', label: 'Impostazioni',      desc: 'Ore e notifiche' },
            { href: '/reports/new',     icon: '✏️', label: 'Inserisci ora',     desc: 'Report veloce' },
          ].map(({ href, icon, label, desc }) => (
            <Link key={href} href={href} className="card-hover p-4 text-center group block">
              <div className="text-3xl mb-1">{icon}</div>
              <p className="font-medium text-slate-700 text-sm group-hover:text-navy-700">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
