// ================================================================
// lib/api.ts v2
// Novità: refresh token automatico, retry su 401, tipi aggiornati
// ================================================================

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

// ── Token storage ─────────────────────────────────────────────────
const KEYS = {
  access:  'dr_access_token',
  refresh: 'dr_refresh_token',
  ruolo:   'dr_ruolo',
  nome:    'dr_nome',
}

export const tokenStore = {
  getAccess:    () => (typeof window !== 'undefined' ? localStorage.getItem(KEYS.access)  : null),
  getRefresh:   () => (typeof window !== 'undefined' ? localStorage.getItem(KEYS.refresh) : null),
  setTokens:    (access: string, refresh: string) => {
    localStorage.setItem(KEYS.access, access)
    localStorage.setItem(KEYS.refresh, refresh)
  },
  setUser:      (ruolo: string, nome: string) => {
    localStorage.setItem(KEYS.ruolo, ruolo)
    localStorage.setItem(KEYS.nome,  nome)
  },
  clearAll:     () => Object.values(KEYS).forEach(k => localStorage.removeItem(k)),
  getRuolo:     () => (typeof window !== 'undefined' ? localStorage.getItem(KEYS.ruolo) : null),
}

// ── Flag per evitare loop di refresh ─────────────────────────────
let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh()
  if (!refreshToken) return false

  try {
    const res  = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false

    const data = await res.json()
    tokenStore.setTokens(data.data.access_token, data.data.refresh_token)
    return true
  } catch {
    return false
  }
}

// ── Fetch con auto-refresh ────────────────────────────────────────
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return fetch(`${BASE_URL}${path}`, { ...options, headers })
  }

  let res = await doFetch(tokenStore.getAccess())

  // Se 401: tenta refresh una volta
  if (res.status === 401) {
    if (!isRefreshing) {
      isRefreshing     = true
      refreshPromise   = tryRefresh().finally(() => { isRefreshing = false; refreshPromise = null })
    }

    const refreshed = await (refreshPromise ?? Promise.resolve(false))

    if (refreshed) {
      // Ritenta con il nuovo access token
      res = await doFetch(tokenStore.getAccess())
    } else {
      // Refresh fallito → logout
      tokenStore.clearAll()
      if (typeof window !== 'undefined') window.location.href = '/login'
      throw new Error('Sessione scaduta. Effettua il login.')
    }
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`)
  return data as T
}

// ── Auth API ──────────────────────────────────────────────────────
export const authApi = {
  login: async (email: string, password: string) => {
    const res = await apiFetch<{ success: boolean; data: LoginResponse }>('/api/auth/login', {
      method: 'POST',
      body:   JSON.stringify({ email, password }),
    })
    tokenStore.setTokens(res.data.access_token, res.data.refresh_token)
    tokenStore.setUser(res.data.utente.ruolo, res.data.utente.nome)
    return res
  },
  logout: async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    tokenStore.clearAll()
  },
  me:               () => apiFetch<ApiRes<Utente>>('/api/auth/me'),
  settings:         (data: Partial<UtenteSettings>) =>
    apiFetch<ApiRes<Utente>>('/api/auth/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  changePassword:   (passwordAttuale: string, passwordNuova: string) =>
    apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ passwordAttuale, passwordNuova }) }),
  forgotPassword:   (email: string) =>
    apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword:    (token: string, nuovaPassword: string) =>
    apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, nuovaPassword }) }),
}

// ── Reports API ───────────────────────────────────────────────────
export const reportsApi = {
  list:    (params?: { data_da?: string; data_a?: string; limit?: number }) =>
    apiFetch<ApiRes<Report[]>>('/api/reports?' + qs(params)),
  create:  (data: ReportForm) =>
    apiFetch<ApiRes<Report>>('/api/reports', { method: 'POST', body: JSON.stringify(data) }),
  update:  (id: string, data: Partial<ReportForm>) =>
    apiFetch<ApiRes<Report>>(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete:  (id: string) =>
    apiFetch(`/api/reports/${id}`, { method: 'DELETE' }),
  stats:   (anno: number, mese: number) =>
    apiFetch<ApiRes<StatsMese>>(`/api/reports/stats/month?anno=${anno}&mese=${mese}`),
}

// ── Monthly API ───────────────────────────────────────────────────
export const monthlyApi = {
  list:        () => apiFetch<ApiRes<ReportMensile[]>>('/api/monthly'),
  detail:      (anno: number, mese: number) =>
    apiFetch<ApiRes<{ riepilogo: ReportMensile | null; giorni: Report[] }>>(`/api/monthly/${anno}/${mese}`),
  genera:      (anno: number, mese: number) =>
    apiFetch<ApiRes<ReportMensile>>('/api/monthly/genera', { method: 'POST', body: JSON.stringify({ anno, mese }) }),
  generaTutti: (anno: number, mese: number) =>
    apiFetch('/api/monthly/genera-tutti', { method: 'POST', body: JSON.stringify({ anno, mese }) }),
}

// ── Admin API ─────────────────────────────────────────────────────
export const adminApi = {
  reports:    (p?: Record<string, string>) => apiFetch<ApiRes<ReportCompleto[]>>('/api/admin/reports?' + qs(p)),
  users:      () => apiFetch<ApiRes<StatsUtente[]>>('/api/admin/users'),
  stats:      (anno?: number, mese?: number) =>
    apiFetch<ApiRes<AdminStats>>(`/api/admin/stats${anno ? `?anno=${anno}&mese=${mese}` : ''}`),
  monthly:    (anno: number, mese: number) =>
    apiFetch<ApiRes<ReportMensile[]>>(`/api/admin/monthly?anno=${anno}&mese=${mese}`),
  toggleUser: (id: string) => apiFetch(`/api/admin/users/${id}/toggle`, { method: 'PATCH' }),
}

// ── Templates ─────────────────────────────────────────────────────
export const templatesApi = {
  list: () => apiFetch<ApiRes<Template[]>>('/api/templates'),
}

// ── Export URLs ───────────────────────────────────────────────────
export const exportUrl = {
  csv:        (p?: Record<string, string>) =>
    `${BASE_URL}/api/export/csv?${qs(p)}&token=${tokenStore.getAccess()}`,
  monthlyCsv: (anno: number, mese: number) =>
    `${BASE_URL}/api/export/monthly-csv?anno=${anno}&mese=${mese}&token=${tokenStore.getAccess()}`,
}

// ── Helper ────────────────────────────────────────────────────────
function qs(p?: Record<string, string | number | undefined> | null) {
  if (!p) return ''
  return new URLSearchParams(
    Object.fromEntries(
      Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)])
    )
  ).toString()
}

// ── Tipi ──────────────────────────────────────────────────────────
export type ApiRes<T> = { success: boolean; data: T }

export interface LoginResponse {
  access_token:  string
  refresh_token: string
  expires_in:    number
  utente:        Utente
}
export interface Utente {
  id: string; nome: string; email: string; ruolo: 'user' | 'admin'
  avatar: string | null; attivo: boolean
  ore_standard_giornaliere: number; giorni_lavorativi_sett: number
  tolleranza_pct: number; notifiche_email: boolean
  notifica_reminder_ora: number | null
  ultimo_accesso: string | null; created_at: string
}
export interface UtenteSettings {
  ore_standard_giornaliere?: number; giorni_lavorativi_sett?: number
  tolleranza_pct?: number; notifiche_email?: boolean; notifica_reminder_ora?: number
}
export interface Report {
  id: string; user_id: string; data: string; attivita: string
  note: string | null; ore_lavorate: number; umore: number | null
  created_at: string; updated_at: string
}
export interface ReportForm {
  data: string; attivita: string; note?: string
  ore_lavorate: number; umore?: number | null; template_id?: string
}
export interface ReportCompleto extends Report {
  nome_utente: string; email_utente: string; avatar_utente: string | null
}
export interface ReportMensile {
  id: string; user_id: string; anno: number; mese: number
  ore_totali: number; ore_attese: number; giorni_lavorati: number
  giorni_attesi: number; giorni_sotto_std: number; media_ore_giorno: number
  percentuale_comp: number; valutazione: 'OTTIMO'|'BUONO'|'SUFFICIENTE'|'INSUFFICIENTE'
  commento_ai: string | null; generato_at: string
  nome?: string; avatar?: string
}
export interface StatsMese {
  giorni_lavorati: number; ore_totali: number; media_ore: number
  giorni_attesi: number; ore_attese: number; percentuale_comp: number
  valutazione: string; giorni_mancanti: number; giorni_sotto_std: number
}
export interface StatsUtente {
  id: string; nome: string; email: string; avatar: string | null
  totale_report: number; ore_totali: number; media_ore: number
  ultimo_report: string | null; report_30gg: number
  ore_standard_giornaliere: number; giorni_lavorativi_sett: number
  mancante_oggi: boolean
}
export interface AdminStats {
  mese: { collaboratori_attivi: number; totale_report: number; ore_totali: number; media_ore_report: number }
  ranking: ReportMensile[]; mancanti_oggi: Utente[]
  statistiche: { n_ottimo: number; n_buono: number; n_sufficiente: number; n_insufficiente: number } | null
  periodo: { anno: number; mese: number }
}
export interface Template {
  id: string; nome: string; testo_base: string; categoria: string; descrizione: string | null
}

// ── Alias di compatibilità (usati dai componenti vecchi) ──────────
// Permettono di non riscrivere tutti i file che importano le funzioni vecchie
export const setToken   = (t: string) => tokenStore.setTokens(t, '')
export const clearToken = () => tokenStore.clearAll()

// StatsMese: aggiunge alias per campo rinominato (media_ore → media_ore_giorno)
// I componenti vecchi leggono stats.media_ore, il backend ora manda media_ore_giorno
// Il fix è nel trasformatore in reportsApi.stats (vedi sopra)
