'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { tokenStore } from '@/lib/api'

export default function HomePage() {
  const router = useRouter()
  useEffect(() => {
    const token = tokenStore.getAccess()
    const ruolo = tokenStore.getRuolo()
    if (token) {
      router.replace(ruolo === 'admin' ? '/admin' : '/dashboard')
    } else {
      router.replace('/login')
    }
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
