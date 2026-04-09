'use client'
// ================================================================
// components/layout/AppShell.tsx
// ================================================================
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import { authApi, tokenStore, type Utente } from '@/lib/api'

interface AppShellProps {
  children: React.ReactNode
  requireAdmin?: boolean
}

export default function AppShell({ children, requireAdmin = false }: AppShellProps) {
  const router = useRouter()
  const [utente, setUtente]   = useState<Utente | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileNav, setMobile] = useState(false)

  useEffect(() => {
    const token = tokenStore.getAccess()
    if (!token) { router.replace('/login'); return }

    authApi.me()
      .then(res => {
        const u = res.data
        if (requireAdmin && u.ruolo !== 'admin') {
          router.replace('/dashboard')
          return
        }
        setUtente(u)
        setLoading(false)
      })
      .catch(() => {
        tokenStore.clearAll()
        router.replace('/login')
      })
  }, [router, requireAdmin])

  const logout = async () => {
    await authApi.logout()
    router.push('/login')
  }

  if (loading || !utente) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-navy-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500">Caricamento…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar
        utente={utente}
        onLogout={logout}
        mobileOpen={mobileNav}
        onMobileClose={() => setMobile(false)}
      />
      <main className="flex-1 lg:ml-60 min-h-screen flex flex-col">
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setMobile(true)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <span className="font-display font-semibold text-navy-800 text-sm">Daily Report</span>
          <div className="ml-auto text-xs text-slate-500">{utente.nome.split(' ')[0]}</div>
        </header>
        <div className="flex-1 p-4 lg:p-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
