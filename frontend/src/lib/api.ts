// ================================================================
// lib/api.ts — versione finale completa con Tasks
// ================================================================

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const KEYS = {
  access:  'dr_access_token',
  refresh: 'dr_refresh_token',
  ruolo:   'dr_ruolo',
  nome:    'dr_nome',
}

export const tokenStore = {
  getAccess:  () => (typeof window !== 'undefined' ? localStorage.getItem(KEYS.access)  : null),
  getRefresh: () => (typeof window !== 'undefined' ? localStorage.getItem(KEYS.refresh) : null),
  setTokens:  (access: string, refresh: string) => {
    localStorage.setItem(KEYS.access, access)
    localStorage.setItem(KEYS.refresh, refresh)
  },
  setUser:    (ruolo: string, nome: string) => {
    localStorage.setItem(KEYS.ruolo, ruolo)
    localStorage.setItem(KEYS.nome,  nome)
  },
  clearAll:   () => Object.values(KEYS).forEach(k => localStorage.removeItem(k)),
  getRuolo:   () => (typeof window !== 'undefined' ? localStorage.getItem(KEYS.ruolo) : null),
}

let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh()
  if (!refreshToken) return false
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json()
    tokenStore.setTokens(data.data.access_token, data.data.refresh_token)
    return true
  } catch {
    return false
  }
}

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

  if (res.status === 401) {
    if (!isRefreshing) {
      isRefreshing   = true
      refreshPromise = tryRefresh().finally(() => { isRefreshing = false; refreshPromise = null })
    }
    const refreshed = await (refreshPromise ?? Promise.resolve(false))
    if (refreshed) {
      res = await doFetch(tokenStore.getAccess())
    } else {
      tokenStore.clearAll()
      if (typeof window !== 'undefined') window.location.href = '/login'
      throw new Error('Sessione scaduta. Effettua il login.')
    }
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`)
  return data as T
}

function qs(p?: Record<string, string | number | undefined> | null) {
  if (!p) return ''
  return new URLSearchParams(
    Object.fromEntries(
      Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)])
    )
  ).toString()
}

// ── Auth ──────────────────────────────────────────────────────────
export const authApi = {
  login: async (email: string, password: string) => {
    const res = await apiFetch<{ success: boolean; data: LoginResponse }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    })
    tokenStore.setTokens(res.data.access_token, res.data.refresh_token)
    tokenStore.setUser(res.data.utente.ruolo, res.data.utente.nome)
    return res
  },
  logout: async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    tokenStore.clearAll()
  },
  me:             () => apiFetch<ApiRes<Utente>>('/api/auth/me'),
  settings:       (data: Partial<UtenteSettings>) =>
    apiFetch<ApiRes<Utente>>('/api/auth/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  changePassword: (passwordAttuale: string, passwordNuova: string) =>
    apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ passwordAttuale, passwordNuova }) }),
  forgotPassword: (email: string) =>
    apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword:  (token: string, nuovaPassword: string) =>
    apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, nuovaPassword }) }),
}

// ── Reports ───────────────────────────────────────────────────────
export const reportsApi = {
  list:   (params?: { data_da?: string; data_a?: string; limit?: number }) =>
    apiFetch<ApiRes<Report[]>>('/api/reports?' + qs(params)),
  create: (data: ReportForm) =>
    apiFetch<ApiRes<Report>>('/api/reports', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ReportForm>) =>
    apiFetch<ApiRes<Report>>(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/reports/${id}`, { method: 'DELETE' }),
  stats:  (anno: number, mese: number) =>
    apiFetch<ApiRes<StatsMese>>(`/api/reports/stats/month?anno=${anno}&mese=${mese}`),
}

// ── Monthly ───────────────────────────────────────────────────────
export const monthlyApi = {
  list:        () => apiFetch<ApiRes<ReportMensile[]>>('/api/monthly'),
  detail:      (anno: number, mese: number) =>
    apiFetch<ApiRes<{ riepilogo: ReportMensile | null; giorni: Report[] }>>(`/api/monthly/${anno}/${mese}`),
  genera:      (anno: number, mese: number) =>
    apiFetch<ApiRes<ReportMensile>>('/api/monthly/genera', { method: 'POST', body: JSON.stringify({ anno, mese }) }),
  generaTutti: (anno: number, mese: number) =>
    apiFetch('/api/monthly/genera-tutti', { method: 'POST', body: JSON.stringify({ anno, mese }) }),
}

// ── Admin ─────────────────────────────────────────────────────────
export const adminApi = {
  reports:    (p?: Record<string, string>) =>
    apiFetch<ApiRes<ReportCompleto[]>>('/api/admin/reports?' + qs(p)),
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

// ── Tasks ─────────────────────────────────────────────────────────
export const tasksApi = {
  list:    (params?: { stato?: string; priorita?: string }) =>
    apiFetch<ApiRes<Task[]>>('/api/tasks?' + qs(params)),
  stats:   () => apiFetch<ApiRes<TaskStats>>('/api/tasks/stats'),
  get:     (id: string) => apiFetch<ApiRes<Task>>(`/api/tasks/${id}`),
  create:  (data: TaskForm) =>
    apiFetch<ApiRes<Task>>('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update:  (id: string, data: Partial<Task & { avanzamento: number }>) =>
    apiFetch<ApiRes<Task>>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete:  (id: string) => apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }),
  addComment: (taskId: string, testo: string) =>
    apiFetch<ApiRes<TaskCommento>>(`/api/tasks/${taskId}/commenti`, {
      method: 'POST', body: JSON.stringify({ testo })
    }),
  utenti: () => apiFetch<ApiRes<{ id: string; nome: string; avatar: string | null }[]>>('/api/tasks/utenti'),
}

// ── Export ────────────────────────────────────────────────────────
export const exportUrl = {
  csv:        (p?: Record<string, string>) =>
    `${BASE_URL}/api/export/csv?${qs(p)}&token=${tokenStore.getAccess()}`,
  monthlyCsv: (anno: number, mese: number) =>
    `${BASE_URL}/api/export/monthly-csv?anno=${anno}&mese=${mese}&token=${tokenStore.getAccess()}`,
}

// ── Tipi base ─────────────────────────────────────────────────────
export type ApiRes<T> = { success: boolean; data: T }

export interface LoginResponse {
  access_token: string; refresh_token: string; expires_in: number; utente: Utente
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
  percentuale_comp: number; valutazione: 'OTTIMO' | 'BUONO' | 'SUFFICIENTE' | 'INSUFFICIENTE'
  commento_ai: string | null; generato_at: string
  nome?: string; avatar?: string
}
export interface StatsMese {
  giorni_lavorati: number; ore_totali: number
  media_ore: number; media_ore_giorno: number
  giorni_attesi: number; ore_attese: number; percentuale_comp: number
  valutazione: string; giorni_mancanti: number; giorni_sotto_std: number
  has_alerts: boolean
  alerts: { tipo: string; messaggio: string; gravita: string }[]
}
export interface StatsUtente {
  id: string; nome: string; email: string; avatar: string | null
  totale_report: number; ore_totali: number; media_ore: number
  attivo?: boolean; ultimo_report: string | null; report_30gg: number
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

// ── Tipi Task ─────────────────────────────────────────────────────
export interface Task {
  id: string; creato_da: string; assegnato_a: string
  titolo: string; descrizione: string | null
  priorita: 1 | 2 | 3 | 4
  stato: 'todo' | 'in_corso' | 'in_revisione' | 'completata' | 'annullata'
  avanzamento: number; progetto: string | null
  scadenza: string | null; completata_at: string | null
  created_at: string; updated_at: string
  creato_da_nome: string; creato_da_avatar: string | null
  assegnato_a_nome: string; assegnato_a_avatar: string | null
  assegnato_a_email: string
  giorni_alla_scadenza: number | null; n_commenti: number
  commenti?: TaskCommento[]
}
export interface TaskCommento {
  id: string; task_id: string; autore_id: string
  autore_nome: string; autore_avatar: string | null
  testo: string; created_at: string
}
export interface TaskStats {
  totale: number; todo: number; in_corso: number
  completate: number; scadute: number; urgenti: number
}
export interface TaskForm {
  titolo: string; descrizione?: string; assegnato_a: string
  priorita: number; scadenza?: string; progetto?: string
}

// ── Costanti Task ─────────────────────────────────────────────────
export const PRIORITA_CONFIG = {
  1: { label: 'Bassa',   emoji: '🟢', color: 'bg-emerald-100 text-emerald-700' },
  2: { label: 'Media',   emoji: '🟡', color: 'bg-yellow-100  text-yellow-700'  },
  3: { label: 'Alta',    emoji: '🟠', color: 'bg-orange-100  text-orange-700'  },
  4: { label: 'Urgente', emoji: '🔴', color: 'bg-red-100     text-red-700'     },
} as const

export const STATO_CONFIG = {
  todo:         { label: 'Da fare',      color: 'bg-slate-100   text-slate-600'   },
  in_corso:     { label: 'In corso',     color: 'bg-blue-100    text-blue-700'    },
  in_revisione: { label: 'In revisione', color: 'bg-purple-100  text-purple-700'  },
  completata:   { label: 'Completata',   color: 'bg-emerald-100 text-emerald-700' },
  annullata:    { label: 'Annullata',    color: 'bg-slate-100   text-slate-400'   },
} as const

// ── Alias compatibilità ───────────────────────────────────────────
export const setToken   = (t: string) => tokenStore.setTokens(t, '')
export const clearToken = () => tokenStore.clearAll()
// ================================================================
// Aggiungi questo in fondo a frontend/src/lib/api.ts
// ================================================================

export type TipoEvento = 'checkin_mattina' | 'checkout_mattina' | 'checkin_pomeriggio' | 'checkout_pomeriggio'

export interface PresenzaV4 {
  id: string; user_id: string; data: string
  checkin_mattina_at: string | null;    checkin_mattina_ind: string | null
  checkin_mattina_ok: boolean | null;   distanza_checkin_mat: number | null
  checkout_mattina_at: string | null;   checkout_mattina_ind: string | null
  checkout_mattina_ok: boolean | null;  distanza_checkout_mat: number | null
  checkin_pomeriggio_at: string | null; checkin_pomeriggio_ind: string | null
  checkin_pomeriggio_ok: boolean | null; distanza_checkin_pom: number | null
  checkout_pomeriggio_at: string | null; checkout_pomeriggio_ind: string | null
  checkout_pomeriggio_ok: boolean | null; distanza_checkout_pom: number | null
  created_at: string
}

export interface PresenzaOggiV4 extends PresenzaV4 {
  user_id: string; nome: string; avatar: string | null; email: string
  presenza_id: string | null
  sede_lat: number | null; sede_lon: number | null
  sede_nome: string | null; sede_raggio: number | null
  stato: 'assente' | 'in_mattina' | 'pausa_pranzo' | 'in_pomeriggio' | 'completo'
  alert_fuori_sede: boolean
  minuti_mattina: number | null; minuti_pomeriggio: number | null
}

export interface StatoCheckinV4 {
  presenza: PresenzaV4 | null
  evento_attivo: string
  eventi_fatti: Record<TipoEvento, boolean>
  orari: {
    checkin_mattina: string; checkout_mattina: string
    checkin_pomeriggio: string; checkout_pomeriggio: string
    tolleranza: string
  }
  sede_configurata: boolean
}

export const presenzeApi = {
  stato: () =>
    apiFetch<ApiRes<StatoCheckinV4>>('/api/presenze/stato'),

  evento: (lat: number, lon: number, tipo: TipoEvento) =>
    apiFetch<ApiRes<PresenzaV4> & { meta: { in_sede: boolean | null; distanza_metri: number | null } }>(
      '/api/presenze/evento', {
        method: 'POST',
        body:   JSON.stringify({ lat, lon, tipo }),
      }
    ),

  storico: (limit?: number) =>
    apiFetch<ApiRes<PresenzaV4[]>>(`/api/presenze/storico${limit ? `?limit=${limit}` : ''}`),

  adminOggi: () =>
    apiFetch<ApiRes<PresenzaOggiV4[]>>('/api/presenze/admin/oggi'),

  adminStorico: (params?: { data_da?: string; data_a?: string; user_id?: string }) =>
    apiFetch<ApiRes<(PresenzaV4 & { nome: string; avatar: string | null })[]>>(
      '/api/presenze/admin/storico?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>
      ).toString()
    ),

  configuraSede: (userId: string, sede_lat: number, sede_lon: number, sede_nome: string, sede_raggio?: number) =>
    apiFetch<ApiRes<Utente>>(`/api/presenze/admin/sede/${userId}`, {
      method: 'PATCH',
      body:   JSON.stringify({ sede_lat, sede_lon, sede_nome, sede_raggio: sede_raggio ?? 200 }),
    }),
}

