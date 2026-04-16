'use client'
// ================================================================
// app/checkin/page.tsx v4
// 4 eventi: check-in 9:00 | check-out 13:00 | check-in 14:30 | check-out 18:30
// Solo da PC — bloccato su mobile
// Posizione NON mostrata al collaboratore (solo admin la vede)
// ================================================================
import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import { presenzeApi, type StatoCheckinV4 } from '@/lib/api'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

function isMobile(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768
}

const EVENTI_CONFIG = {
  checkin_mattina:     { label: 'Check-in Mattina',     emoji: '▶️', orario: '9:00',  tipo: 'entrata' },
  checkout_mattina:    { label: 'Check-out Mattina',    emoji: '⏹️', orario: '13:00', tipo: 'uscita'  },
  checkin_pomeriggio:  { label: 'Check-in Pomeriggio',  emoji: '▶️', orario: '14:30', tipo: 'entrata' },
  checkout_pomeriggio: { label: 'Check-out Pomeriggio', emoji: '⏹️', orario: '18:30', tipo: 'uscita'  },
} as const

type TipoEvento = keyof typeof EVENTI_CONFIG

const ORDINE: TipoEvento[] = ['checkin_mattina', 'checkout_mattina', 'checkin_pomeriggio', 'checkout_pomeriggio']

const MSG_FUORI: Record<string, string> = {
  troppo_presto:       '⏰ Check-in mattina disponibile dalle 8:30',
  attesa_checkout_mat: '⏳ Check-out mattina disponibile dalle 12:30',
  pausa_pranzo:        '🍽️ Pausa pranzo — check-in pomeriggio dalle 14:00',
  attesa_checkout_pom: '⏳ Check-out pomeriggio disponibile dalle 18:00',
  giornata_finita:     '🌙 Giornata lavorativa conclusa',
  fuori_orario:        '⏰ Nessun evento disponibile in questo momento',
}

export default function CheckinPage() {
  const [stato,   setStato]   = useState<StatoCheckinV4 | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<TipoEvento | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mobile,  setMobile]  = useState(false)

  useEffect(() => { setMobile(isMobile()) }, [])

  const loadStato = useCallback(async () => {
    try {
      const res = await presenzeApi.stato()
      setStato(res.data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStato() }, [loadStato])

  const doEvento = (tipo: TipoEvento) => {
    setError(null); setSuccess(null)
    if (!navigator.geolocation) {
      setError('Il tuo browser non supporta il GPS. Usa Chrome o Edge.')
      return
    }
    setWorking(tipo)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await presenzeApi.evento(pos.coords.latitude, pos.coords.longitude, tipo)
          const cfg = EVENTI_CONFIG[tipo]
          setSuccess(`✅ ${cfg.label} registrato correttamente`)
          await loadStato()
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Errore registrazione')
        } finally { setWorking(null) }
      },
      (err) => {
        setWorking(null)
        if (err.code === 1) setError('Permesso GPS negato. Abilitalo nelle impostazioni del browser.')
        else setError('Impossibile rilevare la posizione GPS.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  // ── Blocco mobile ─────────────────────────────────────────────
  if (mobile) return (
    <AppShell>
      <div className="max-w-md mx-auto mt-8">
        <div className="card p-10 text-center space-y-4">
          <p className="text-6xl">🖥️</p>
          <h2 className="font-display font-bold text-xl text-slate-900">Solo da PC</h2>
          <p className="text-slate-500">Il check-in è disponibile solo dal computer. Accedi dall'app su PC o laptop.</p>
        </div>
      </div>
    </AppShell>
  )

  const oggi        = format(new Date(), "EEEE d MMMM yyyy", { locale: it })
  const eventoAttivo = stato?.evento_attivo
  const eventiFatti  = stato?.eventi_fatti ?? {} as Record<TipoEvento, boolean>

  return (
    <AppShell>
      <div className="max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900">Presenza</h1>
          <p className="text-slate-500 text-sm mt-1 capitalize">{oggi}</p>
        </div>

        {/* Feedback */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700 animate-fade-in">
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-800 animate-fade-in">
            {success}
          </div>
        )}

        {/* Messaggio fuori finestra */}
        {eventoAttivo && !EVENTI_CONFIG[eventoAttivo as TipoEvento] && MSG_FUORI[eventoAttivo] && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-600">
            {MSG_FUORI[eventoAttivo]}
          </div>
        )}

        {/* 4 card eventi */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {ORDINE.map((tipo) => {
              const cfg       = EVENTI_CONFIG[tipo]
              const fatto     = !!eventiFatti[tipo]
              const attivo    = eventoAttivo === tipo
              const isCheckin = tipo.startsWith('checkin')

              return (
                <div key={tipo} className={`card p-5 space-y-3 transition-all ${
                  fatto ? 'opacity-75' : attivo ? 'ring-2 ring-navy-300' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-semibold text-slate-900">
                        {cfg.emoji} {cfg.label}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Orario: {cfg.orario} (±30 minuti)
                      </p>
                    </div>
                    {fatto ? (
                      <span className="text-emerald-600 font-bold text-xl">✓</span>
                    ) : attivo ? (
                      <span className="badge bg-navy-100 text-navy-700 text-xs animate-pulse">● Attivo ora</span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-400 text-xs">In attesa</span>
                    )}
                  </div>

                  {/* Bottone */}
                  {!fatto && (
                    <button
                      onClick={() => doEvento(tipo)}
                      disabled={!!working || !attivo}
                      className={`w-full py-3 rounded-xl font-medium text-sm transition-all ${
                        attivo
                          ? isCheckin
                            ? 'bg-navy-700 hover:bg-navy-800 text-white'
                            : 'bg-slate-700 hover:bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {working === tipo ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Rilevamento GPS…
                        </span>
                      ) : attivo ? `${cfg.emoji} Registra ${cfg.label}` : '🔒 Non disponibile adesso'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Riepilogo giornata */}
        {stato && (
          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Riepilogo oggi</p>
            <div className="grid grid-cols-4 gap-2">
              {ORDINE.map(tipo => {
                const cfg   = EVENTI_CONFIG[tipo]
                const fatto = !!eventiFatti[tipo]
                return (
                  <div key={tipo} className="text-center">
                    <div className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center text-sm ${
                      fatto ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {fatto ? '✓' : '○'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{cfg.orario}</p>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1 px-1">
              {ORDINE.map(tipo => (
                <span key={tipo} className="text-center" style={{ width: '25%' }}>
                  {EVENTI_CONFIG[tipo].tipo === 'entrata' ? 'In' : 'Out'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Privacy */}
        <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-400">
          <p className="font-medium text-slate-500 mb-1">🔒 Informativa</p>
          <p>La posizione GPS viene rilevata una sola volta a ogni evento per verificare la sede di lavoro prevista dal contratto di telelavoro.</p>
        </div>
      </div>
    </AppShell>
  )
}
