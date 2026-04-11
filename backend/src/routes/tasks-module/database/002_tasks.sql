-- ================================================================
-- MIGRATION 002 — Sistema Task
-- Esegui su Railway: incolla nel Query editor del database
-- ================================================================

-- ── Tabella tasks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Chi ha creato la task (admin o collaboratore)
  creato_da     UUID         NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  -- A chi è assegnata
  assegnato_a   UUID         NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,

  titolo        VARCHAR(200) NOT NULL,
  descrizione   TEXT,

  -- Priorità: 1=bassa, 2=media, 3=alta, 4=urgente
  priorita      SMALLINT     NOT NULL DEFAULT 2
    CHECK (priorita BETWEEN 1 AND 4),

  -- Stato: todo, in_corso, in_revisione, completata, annullata
  stato         VARCHAR(20)  NOT NULL DEFAULT 'todo'
    CHECK (stato IN ('todo','in_corso','in_revisione','completata','annullata')),

  -- Avanzamento percentuale (0-100)
  avanzamento   SMALLINT     NOT NULL DEFAULT 0
    CHECK (avanzamento BETWEEN 0 AND 100),

  -- Progetto di riferimento (testo libero, es. "ASCOLI WIND")
  progetto      VARCHAR(100),

  scadenza      DATE,
  completata_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assegnato ON tasks(assegnato_a, stato);
CREATE INDEX IF NOT EXISTS idx_tasks_creato    ON tasks(creato_da);
CREATE INDEX IF NOT EXISTS idx_tasks_scadenza  ON tasks(scadenza) WHERE stato != 'completata';

-- ── Tabella commenti task ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_commenti (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  autore_id  UUID        NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  testo      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_commenti ON task_commenti(task_id, created_at DESC);

-- ── Trigger updated_at ────────────────────────────────────────────
CREATE TRIGGER trg_tasks_upd
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Vista tasks completa ──────────────────────────────────────────
CREATE OR REPLACE VIEW v_tasks AS
SELECT
  t.*,
  uc.nome  AS creato_da_nome,
  uc.avatar AS creato_da_avatar,
  ua.nome  AS assegnato_a_nome,
  ua.avatar AS assegnato_a_avatar,
  ua.email AS assegnato_a_email,
  -- Giorni alla scadenza (negativo = in ritardo)
  CASE WHEN t.scadenza IS NOT NULL
    THEN (t.scadenza - CURRENT_DATE)::int
    ELSE NULL
  END AS giorni_alla_scadenza,
  -- Conteggio commenti
  (SELECT COUNT(*) FROM task_commenti tc WHERE tc.task_id = t.id) AS n_commenti
FROM tasks t
JOIN utenti uc ON uc.id = t.creato_da
JOIN utenti ua ON ua.id = t.assegnato_a
ORDER BY
  CASE t.priorita WHEN 4 THEN 0 WHEN 3 THEN 1 WHEN 2 THEN 2 ELSE 3 END,
  t.scadenza ASC NULLS LAST,
  t.created_at DESC;

SELECT 'Migration 002 Tasks completata' AS stato;
