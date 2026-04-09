'use client'
// ================================================================
// hooks/useAuth.ts — Stato autenticazione lato client
// ================================================================
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authApi, tokenStore, type Utente } from '@/lib/api'

interface AuthState {
  utente:  Utente | null
  loading: boolean
  error:   string | null
}

export function useAuth() {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({ utente: null, loading: true, error: null })

  useEffect(() => {
    const token = tokenStore.getAccess()
    if (!token) {
      setState({ utente: null, loading: false, error: null })
      return
    }
    authApi.me()
      .then(res => setState({ utente: res.data, loading: false, error: null }))
      .catch(() => {
        tokenStore.clearAll()
        setState({ utente: null, loading: false, error: null })
      })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await authApi.login(email, password)
      setState({ utente: res.data.utente, loading: false, error: null })
      router.push(res.data.utente.ruolo === 'admin' ? '/admin' : '/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore login'
      setState(s => ({ ...s, loading: false, error: msg }))
    }
  }, [router])

  const logout = useCallback(async () => {
    await authApi.logout()
    setState({ utente: null, loading: false, error: null })
    router.push('/login')
  }, [router])

  return { ...state, login, logout }
}
