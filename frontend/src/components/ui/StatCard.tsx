// ================================================================
// components/ui/StatCard.tsx
// ================================================================
import clsx from 'clsx'

interface StatCardProps {
  label:     string
  value:     string | number
  sub?:      string
  icon?:     React.ReactNode
  color?:    'navy' | 'amber' | 'emerald' | 'red' | 'slate'
  className?: string
}

const colorMap = {
  navy:    'bg-navy-50   text-navy-600   border-navy-100',
  amber:   'bg-amber-50  text-amber-600  border-amber-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  red:     'bg-red-50    text-red-600    border-red-100',
  slate:   'bg-slate-50  text-slate-500  border-slate-100',
}

export default function StatCard({ label, value, sub, icon, color = 'navy', className }: StatCardProps) {
  return (
    <div className={clsx('card p-5 flex items-start gap-4 animate-slide-up', className)}>
      {icon && (
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border', colorMap[color])}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-display font-bold text-slate-900 mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}
