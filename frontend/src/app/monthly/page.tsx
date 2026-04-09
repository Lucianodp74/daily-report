'use client'
// ================================================================
// app/monthly/page.tsx — Report mensili + analisi AI
// ================================================================
import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import ValutazioneBadge, { ProgressBar } from '@/components/ui/ValutazioneBadge'
import StatCard from '@/components/ui/StatCard'
import { monthlyApi, exportUrl, type ReportMensile, type Report } from '@/lib/api'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

const MESI = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

export default function MonthlyPage() {
  const oggi  = new Date()
  const [lista,     setLista]     = useState<ReportMensile[]>([])
  const [selected,  setSelected]  = useState<ReportMensile | null>(null)
  const [giorni,    setGiorni]    = useState<Report[]>([])
  const [loading,   setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    monthlyApi.list()
      .then(res => { setLista(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const openDetail = async (rm: ReportMensile) => {
    setSelected(rm); setDetailLoading(true)
    try {
      const res = await monthlyApi.detail(rm.anno, rm.mese)
      setGiorni(res.data.giorni)
    } finally { setDetailLoading(false) }
  }

  const handleGenera = async (anno: number, mese: number) => {
    setGenerating(true)
    try {
      const res = await monthlyApi.genera(anno, mese)
      // Aggiorna o inserisce nella lista
      setLista(prev => {
        const idx = prev.findIndex(r => r.anno === anno && r.mese === mese)
        if (idx >= 0) { const n = [...prev]; n[idx] = res.data; return n }
        return [res.data, ...prev]
      })
      setSelected(res.data)
      // Ricarica giorni
      const d = await monthlyApi.detail(anno, mese)
      setGiorni(d.data.giorni)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Errore generazione')
    } finally { setGenerating(false) }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">Report Mensili</h1>
            <p className="text-slate-500 text-sm mt-1">Riepilogo ore, KPI e analisi AI</p>
          </div>
          <button
            onClick={() => handleGenera(oggi.getFullYear(), oggi.getMonth() + 1)}
            disabled={generating}
            className="btn-amber"
          >
            {generating ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generazione…</>
            ) : '⚡ Genera mese corrente'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : lista.length === 0 ? (
          <div className="card p-16 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-slate-600 font-medium">Nessun report mensile ancora generato</p>
            <p className="text-slate-400 text-sm mt-1">Clicca "Genera mese corrente" per iniziare</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Lista mesi */}
            <div className="space-y-3">
              {lista.map(rm => (
                <button
                  key={rm.id}
                  onClick={() => openDetail(rm)}
                  className={`w-full text-left card p-4 transition-all hover:border-navy-200 hover:shadow-md ${selected?.id === rm.id ? 'border-navy-400 ring-1 ring-navy-400' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-semibold text-slate-800">
                      {MESI[rm.mese]} {rm.anno}
                    </span>
                    <ValutazioneBadge valutazione={rm.valutazione} />
                  </div>
                  <ProgressBar percent={rm.percentuale_comp} valutazione={rm.valutazione} />
                  <div className="flex justify-between mt-2 text-xs text-slate-500">
                    <span>{rm.ore_totali}h / {rm.ore_attese}h</span>
                    <span>{rm.percentuale_comp}% — {rm.giorni_lavorati}/{rm.giorni_attesi}gg</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Dettaglio */}
            {selected && (
              <div className="card p-5 space-y-4 animate-fade-in">
                <div className="flex items-start justify-between">
                  <h2 className="font-display font-bold text-slate-900">
                    {MESI[selected.mese]} {selected.anno}
                  </h2>
                  <div className="flex gap-2">
                    <a
                      href={exportUrl.monthlyCsv(selected.anno, selected.mese)}
                      download
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      CSV
                    </a>
                    <button
                      onClick={() => handleGenera(selected.anno, selected.mese)}
                      disabled={generating}
                      className="btn-ghost text-xs px-3 py-1.5"
                    >
                      ↺ Rigenera
                    </button>
                  </div>
                </div>

                {/* KPI */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Ore totali',  value: `${selected.ore_totali}h` },
                    { label: 'Completamento', value: `${selected.percentuale_comp}%` },
                    { label: 'Giorni lavorati', value: `${selected.giorni_lavorati}/${selected.giorni_attesi}` },
                    { label: 'Media/giorno',  value: `${selected.media_ore_giorno}h` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="font-display font-bold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <ValutazioneBadge valutazione={selected.valutazione} />
                  {selected.giorni_sotto_std > 0 && (
                    <span className="badge bg-amber-50 text-amber-700">{selected.giorni_sotto_std}gg sotto 8h</span>
                  )}
                </div>

                {/* Commento AI */}
                {selected.commento_ai && (
                  <div className="bg-gradient-to-br from-navy-50 to-indigo-50 rounded-xl p-4 border border-navy-100">
                    <p className="text-xs font-semibold text-navy-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <span>✨</span> Analisi AI
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">{selected.commento_ai}</p>
                  </div>
                )}

                {/* Report giornalieri */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Dettaglio giorni ({detailLoading ? '…' : giorni.length})
                  </h3>
                  {detailLoading ? (
                    <div className="flex justify-center py-6">
                      <div className="w-5 h-5 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {giorni.map(g => (
                        <div key={g.id} className="flex gap-3 text-xs p-2 rounded-lg hover:bg-slate-50">
                          <span className="text-slate-400 shrink-0 font-mono w-11">
                            {format(parseISO(g.data), 'dd/MM')}
                          </span>
                          <span className="flex-1 text-slate-600 line-clamp-2">{g.attivita}</span>
                          <span className="shrink-0 font-semibold text-navy-700">{g.ore_lavorate}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
