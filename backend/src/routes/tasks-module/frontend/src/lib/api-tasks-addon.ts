// ================================================================
// Aggiungi questi tipi e funzioni al file src/lib/api.ts esistente
// Incolla in fondo al file, prima della riga finale
// ================================================================

// ── Tipi Task ─────────────────────────────────────────────────────
export interface Task {
  id: string
  creato_da: string
  assegnato_a: string
  titolo: string
  descrizione: string | null
  priorita: 1 | 2 | 3 | 4
  stato: 'todo' | 'in_corso' | 'in_revisione' | 'completata' | 'annullata'
  avanzamento: number
  progetto: string | null
  scadenza: string | null
  completata_at: string | null
  created_at: string
  updated_at: string
  // Dalla vista v_tasks
  creato_da_nome: string
  creato_da_avatar: string | null
  assegnato_a_nome: string
  assegnato_a_avatar: string | null
  assegnato_a_email: string
  giorni_alla_scadenza: number | null
  n_commenti: number
  commenti?: TaskCommento[]
}

export interface TaskCommento {
  id: string
  task_id: string
  autore_id: string
  autore_nome: string
  autore_avatar: string | null
  testo: string
  created_at: string
}

export interface TaskStats {
  totale: number
  todo: number
  in_corso: number
  completate: number
  scadute: number
  urgenti: number
}

export interface TaskForm {
  titolo: string
  descrizione?: string
  assegnato_a: string
  priorita: number
  scadenza?: string
  progetto?: string
}

// ── API Tasks ─────────────────────────────────────────────────────
export const tasksApi = {
  list:    (params?: { stato?: string; priorita?: string }) =>
    apiFetch<{ success: boolean; data: Task[] }>('/api/tasks?' + qs(params)),

  stats:   () =>
    apiFetch<{ success: boolean; data: TaskStats }>('/api/tasks/stats'),

  get:     (id: string) =>
    apiFetch<{ success: boolean; data: Task }>(`/api/tasks/${id}`),

  create:  (data: TaskForm) =>
    apiFetch<{ success: boolean; data: Task }>('/api/tasks', {
      method: 'POST', body: JSON.stringify(data)
    }),

  update:  (id: string, data: Partial<Task & { avanzamento: number }>) =>
    apiFetch<{ success: boolean; data: Task }>(`/api/tasks/${id}`, {
      method: 'PATCH', body: JSON.stringify(data)
    }),

  delete:  (id: string) =>
    apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }),

  addComment: (taskId: string, testo: string) =>
    apiFetch<{ success: boolean; data: TaskCommento }>(`/api/tasks/${taskId}/commenti`, {
      method: 'POST', body: JSON.stringify({ testo })
    }),
}

// ── Costanti Task ─────────────────────────────────────────────────
export const PRIORITA_CONFIG = {
  1: { label: 'Bassa',    emoji: '🟢', color: 'bg-emerald-100 text-emerald-700' },
  2: { label: 'Media',    emoji: '🟡', color: 'bg-yellow-100  text-yellow-700'  },
  3: { label: 'Alta',     emoji: '🟠', color: 'bg-orange-100  text-orange-700'  },
  4: { label: 'Urgente',  emoji: '🔴', color: 'bg-red-100     text-red-700'     },
} as const

export const STATO_CONFIG = {
  todo:         { label: 'Da fare',      color: 'bg-slate-100  text-slate-600'   },
  in_corso:     { label: 'In corso',     color: 'bg-blue-100   text-blue-700'    },
  in_revisione: { label: 'In revisione', color: 'bg-purple-100 text-purple-700'  },
  completata:   { label: 'Completata',   color: 'bg-emerald-100 text-emerald-700'},
  annullata:    { label: 'Annullata',    color: 'bg-slate-100  text-slate-400'   },
} as const
