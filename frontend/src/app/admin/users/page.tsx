'use client'
// ================================================================
// app/admin/users/page.tsx
// ================================================================
import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { adminApi, type StatsUtente } from '@/lib/api'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import clsx from 'clsx'

function avatarColor(s: string) {
  const c = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-teal-500']
  let n = 0; for (const ch of s) n += ch.charCodeAt(0)
  return c[n % c.length]
}

export default function AdminUsersPage() {
  const [users,   setUsers]   = useState<StatsUtente[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    adminApi.users()
      .then(res => { setUsers(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleToggle = async (id: string, nome: string) => {
    if (!confirm(`Modificare stato account di ${nome}?`)) return
    setToggling(id)
    try {
      await adminApi.toggleUser(id)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, attivo: !u.attivo } : u))
    } catch { alert('Errore') }
    finally { setToggling(null) }
  }

  return (
    <AppShell requireAdmin>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900">Collaboratori</h1>
          <p className="text-slate-500 text-sm mt-1">{users.length} collaboratori registrati</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin"/>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {users.map(u => (
              <div key={u.id} className={clsx('card p-5 animate-slide-up', !u.attivo && 'opacity-60')}>
                <div className="flex items-start gap-3 mb-4">
                  <div className={`avatar-lg text-white shrink-0 ${avatarColor(u.nome)}`}>
                    {u.avatar ?? u.nome.slice(0,2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{u.nome}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                    <span className={clsx('badge mt-1', u.attivo ? 'badge-success' : 'bg-red-100 text-red-700')}>
                      {u.attivo ? 'Attivo' : 'Disabilitato'}
                    </span>
                  </div>
                </div>

                {/* Statistiche */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { v: u.totale_report,               l: 'Report' },
                    { v: `${Number(u.ore_totali).toFixed(0)}h`, l: 'Ore tot.' },
                    { v: u.report_30gg,                  l: '30 giorni' },
                  ].map(({ v, l }) => (
                    <div key={l} className="bg-slate-50 rounded-xl p-2 text-center">
                      <p className="font-display font-bold text-slate-900 text-sm">{v}</p>
                      <p className="text-xs text-slate-400">{l}</p>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-400 mb-3">
                  {u.ultimo_report
                    ? `Ultimo report: ${format(parseISO(u.ultimo_report), 'd MMM yyyy', { locale: it })}`
                    : 'Nessun report inserito'}
                </p>

                <button
                  onClick={() => handleToggle(u.id, u.nome)}
                  disabled={toggling === u.id}
                  className={clsx('w-full btn text-xs py-2', u.attivo ? 'btn-secondary' : 'btn-primary')}
                >
                  {toggling === u.id ? '…' : u.attivo ? 'Disabilita account' : 'Riabilita account'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
