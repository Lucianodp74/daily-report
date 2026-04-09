// ================================================================
// components/ui/ValutazioneBadge.tsx
// ================================================================
import clsx from 'clsx'

type Valutazione = 'OTTIMO' | 'BUONO' | 'SUFFICIENTE' | 'INSUFFICIENTE'

const cfg: Record<Valutazione, { cls: string; emoji: string; label: string }> = {
  OTTIMO:        { cls: 'badge-ottimo', emoji: '🏆', label: 'Ottimo'        },
  BUONO:         { cls: 'badge-buono',  emoji: '✅', label: 'Buono'         },
  SUFFICIENTE:   { cls: 'badge-suff',   emoji: '⚠️', label: 'Sufficiente'   },
  INSUFFICIENTE: { cls: 'badge-insuff', emoji: '❌', label: 'Insufficiente' },
}

export default function ValutazioneBadge({
  valutazione,
  showEmoji = true,
}: {
  valutazione: Valutazione | string
  showEmoji?: boolean
}) {
  const v   = (valutazione as Valutazione) in cfg ? (valutazione as Valutazione) : 'INSUFFICIENTE'
  const { cls, emoji, label } = cfg[v]
  return (
    <span className={clsx('badge', cls)}>
      {showEmoji && <span className="mr-1">{emoji}</span>}
      {label}
    </span>
  )
}

// Barra progresso percentuale
export function ProgressBar({
  percent,
  valutazione,
}: {
  percent: number
  valutazione: string
}) {
  const barColor = {
    OTTIMO:        'bg-emerald-500',
    BUONO:         'bg-blue-500',
    SUFFICIENTE:   'bg-amber-500',
    INSUFFICIENTE: 'bg-red-500',
  }[valutazione as Valutazione] ?? 'bg-slate-400'

  return (
    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
      <div
        className={clsx('h-2 rounded-full transition-all duration-700', barColor)}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  )
}
