'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import type { Utente } from '@/lib/api'

interface SidebarProps {
  utente: Utente
  onLogout: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

// ── Icone (dichiarate PRIMA dell'uso) ────────────────────────────
const ic = (d: string) => ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

const HomeIcon   = ic('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6')
const PlusIcon   = ic('M12 4v16m8-8H4')
const ListIcon   = ic('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2')
const CalIcon    = ic('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z')
const ChartIcon  = ic('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z')
const UsersIcon  = ic('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z')
const CogIcon    = ic('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z')
const LogoutIcon = ic('M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1')

const NAV_USER = [
  { href: '/dashboard
cat > frontend/src/components/layout/Sidebar.tsx << 'SIDEBAREOF'
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import type { Utente } from '@/lib/api'

interface SidebarProps {
  utente: Utente
  onLogout: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

// ── Icone (dichiarate PRIMA dell'uso) ────────────────────────────
const ic = (d: string) => ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

const HomeIcon   = ic('M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6')
const PlusIcon   = ic('M12 4v16m8-8H4')
const ListIcon   = ic('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2')
const CalIcon    = ic('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z')
const ChartIcon  = ic('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z')
const UsersIcon  = ic('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z')
const CogIcon    = ic('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z')
const LogoutIcon = ic('M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1')

const NAV_USER = [
  { href: '/dashboard',       icon: HomeIcon,    label: 'Dashboard'       },
  { href: '/reports/new',     icon: PlusIcon,    label: 'Nuovo Report'    },
  { href: '/reports/history', icon: ListIcon,    label: 'Storico'         },
  { href: '/monthly',         icon: CalIcon,     label: 'Report Mensili'  },
  { href: '/settings',        icon: CogIcon,     label: 'Impostazioni'    },
]

const NAV_ADMIN = [
  { href: '/admin',           icon: ChartIcon,   label: 'Dashboard Admin' },
  { href: '/admin/reports',   icon: ListIcon,    label: 'Tutti i Report'  },
  { href: '/admin/monthly',   icon: CalIcon,     label: 'Report Mensili'  },
  { href: '/admin/users',     icon: UsersIcon,   label: 'Collaboratori'   },
  { href: '/settings',        icon: CogIcon,     label: 'Impostazioni'    },
]

function avatarColor(s: string) {
  const colors = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-teal-500']
  let n = 0; for (const c of s) n += c.charCodeAt(0)
  return colors[n % colors.length]
}

export default function Sidebar({ utente, onLogout, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const nav = utente.ruolo === 'admin' ? NAV_ADMIN : NAV_USER

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-8 pb-6 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div>
          <p className="text-white font-display font-semibold text-sm leading-tight">Daily Report</p>
          <p className="text-slate-400 text-xs">Gruppo Visconti</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-0.5">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href ||
            (href !== '/dashboard' && href !== '/admin' && href !== '/settings' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={onMobileClose}
              className={clsx(active ? 'nav-link-active' : 'nav-link')}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 pb-6">
        <div className="rounded-xl bg-white/10 p-3 flex items-center gap-3">
          <div className={clsx('avatar-sm text-white shrink-0', avatarColor(utente.nome))}>
            {utente.avatar ?? utente.nome.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{utente.nome}</p>
            <p className="text-slate-400 text-xs truncate">{utente.email}</p>
          </div>
          <button onClick={onLogout} title="Logout" className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
            <LogoutIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 bg-navy-gradient flex-col z-30">
        <SidebarContent />
      </aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className="relative w-60 bg-navy-gradient flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  )
}
