'use client'
// ================================================================
// app/admin/monthly/page.tsx — Report mensili tutti i collaboratori
// ================================================================
import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import ValutazioneBadge, { ProgressBar } from '@/components/ui/ValutazioneBadge'
import { adminApi, monthlyApi, exportUrl, type ReportMensile } from '@/lib/api'

const MESI = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function avatarColor(s: string) {
  const c = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-teal-500']
  let n = 0; for (const ch of s) n += ch.charCodeAt(0)
  return c[n % c.length]
}

export default function AdminMonthlyPage() {
  const oggi = new Date()
  const [reports,    setReports]    = useState<ReportMensile[]>([])
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [anno, setAnno] = useState(oggi.getFullYear())
  const [mese, setMese] = useState(oggi.getMonth() + 1)
  const [selected,  setSelected]  = useState<ReportMensile | null>(null)
  const [conferma,  setConferma]  = useState(false)
  const [esito,     setEsito]     = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    adminApi.monthly(anno, mese)
      .then(res => { setReports(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [anno, mese])

  useEffect(() => { load() }, [load])

  const generaTutti = async () => {
    setConferma(false)
    setEsito(null)
    setGenerating(true)
    try {
      await monthlyApi.generaTutti(anno, mese)
      load()
      setEsito({ ok: true, msg: `Report ${MESI[mese]} ${anno} generati con successo!` })
    } catch (e: unknown) {
      setEsito({ ok: false, msg: e instanceof Error ? e.message : 'Errore generazione' })
    } finally { setGenerating(false) }
  }

  return (
    <AppShell requireAdmin>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">Report Mensili — Admin</h1>
            <p className="text-slate-500 text-sm mt-1">Visualizza e genera report per tutti i collaboratori</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select className="input text-sm py-2 w-28"
              value={mese} onChange={e => { setMese(Number(e.target.value)); setEsito(null) }}>
              {MESI.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select className="input text-sm py-2 w-24"
              value={anno} onChange={e => { setAnno(Number(e.target.value)); setEsito(null) }}>
              {[oggi.getFullYear()-1, oggi.getFullYear()].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <a href={exportUrl.monthlyCsv(anno, mese)} download className="btn-secondary text-sm">📥 CSV</a>
            <button
              onClick={() => setConferma(true)}
              disabled={generating}
              className="btn-amber text-sm"
            >
              {generating ? '⏳ Generazione…' : '⚡ Genera tutti'}
            </button>
          </div>
        </div>

        {/* Esito operazione */}
        {esito && (
          <div className={`rounded-2xl px-5 py-4 text-sm font-medium animate-fade-in ${
            esito.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                     : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {esito.ok ? '✅ ' : '❌ '}{esito.msg}
          </div>
        )}

        {/* Dialogo conferma inline */}
        {conferma && (
          <div className="card border-amber-300 bg-amber-50 p-5 animate-fade-in">
            <p className="font-semibold text-slate-800 mb-1">
              ⚡ Generare i report per <span className="text-amber-700">{MESI[mese]} {anno}</span>?
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Verranno calcolati KPI e commento AI per tutti i collaboratori attivi.
              Se i report esistono già verranno aggiornati.
            </p>
            <div className="flex gap-3">
              <button onClick={generaTutti} className="btn-amber">
                ✓ Sì, genera
              </button>
              <button onClick={() => setConferma(false)} className="btn-secondary">
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Lista report */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="card p-16 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-slate-600 font-medium mb-1">Nessun report per {MESI[mese]} {anno}</p>
            <p className="text-slate-400 text-sm mb-4">Clicca il pulsante per generarli adesso</p>
            <button onClick={() => setConferma(true)} className="btn-amber">⚡ Genera ora</button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-4">
            {reports.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(selected?.id === r.id ? null : r)}
                className={`text-left card p-5 transition-all hover:shadow-md hover:border-navy-200 ${
                  selected?.id === r.id ? 'ring-2 ring-navy-400 border-navy-300' : ''
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`avatar-md text-white ${avatarColor(r.nome ?? '')}`}>
                    {r.avatar ?? (r.nome ?? '?').slice(0,2)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{r.nome}</p>
                    <ValutazioneBadge valutazione={r.valutazione} />
                  </div>
                </div>

                <ProgressBar percent={r.percentuale_comp} valutazione={r.valutazione} />
                <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span>{r.ore_totali}h / {r.ore_attese}h</span>
                  <span className="font-semibold">{r.percentuale_comp}%</span>
                </div>

                <div className="grid grid-cols-3 gap-1 mt-3 text-center">
                  {[
                    { v: `${r.giorni_lavorati}/${r.giorni_attesi}`, l: 'giorni' },
                    { v: `${r.media_ore_giorno}h`, l: 'media' },
                    { v: `${r.giorni_sotto_std}gg`, l: 'sotto 8h' },
                  ].map(({ v, l }) => (
                    <div key={l} className="bg-slate-50 rounded-lg py-1.5">
                      <div className="text-xs font-bold text-slate-700">{v}</div>
                      <div className="text-xs text-slate-400">{l}</div>
                    </div>
                  ))}
                </div>

                {r.commento_ai && (
                  <div className="mt-3 bg-navy-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-navy-700 mb-1">✨ AI</p>
                    <p className="text-xs text-slate-600 line-clamp-3">{r.commento_ai}</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Dettaglio AI espanso */}
        {selected?.commento_ai && (
          <div className="card p-6 border-navy-200 bg-gradient-to-br from-white to-navy-50 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-slate-900 flex items-center gap-2">
                ✨ Analisi AI — {selected.nome}
              </h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <p className="text-slate-700 leading-relaxed">{selected.commento_ai}</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
