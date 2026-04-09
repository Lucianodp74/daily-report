-- ================================================================
-- MIGRATION 001 — Upgrade schema critico
-- Esegui su DB esistente: psql $DATABASE_URL -f 001_upgrade.sql
-- ================================================================

-- ── Aggiunte a tabella utenti ────────────────────────────────────
ALTER TABLE utenti
  -- Ore giornaliere personalizzate (default 8, configurabile per utente)
  ADD COLUMN IF NOT EXISTS ore_standard_giornaliere  DECIMAL(4,2) NOT NULL DEFAULT 8.0,
  -- Giorni lavorativi settimanali (default 5, può essere 4 per part-time)
  ADD COLUMN IF NOT EXISTS giorni_lavorativi_sett     SMALLINT     NOT NULL DEFAULT 5
    CHECK (giorni_lavorativi_sett BETWEEN 1 AND 7),
  -- Tolleranza KPI: % sotto la quale scatta warning (default 10%)
  ADD COLUMN IF NOT EXISTS tolleranza_pct             DECIMAL(4,1) NOT NULL DEFAULT 10.0
    CHECK (tolleranza_pct BETWEEN 0 AND 50),
  -- Token per reset password
  ADD COLUMN IF NOT EXISTS reset_token               VARCHAR(128),
  ADD COLUMN IF NOT EXISTS reset_token_expires_at    TIMESTAMPTZ,
  -- Refresh token (hashed)
  ADD COLUMN IF NOT EXISTS refresh_token_hash        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at  TIMESTAMPTZ,
  -- Contatore fallimenti login (rate limit soft)
  ADD COLUMN IF NOT EXISTS login_attempts            SMALLINT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_locked_until        TIMESTAMPTZ,
  -- Notifiche
  ADD COLUMN IF NOT EXISTS notifiche_email           BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notifica_reminder_ora     SMALLINT     DEFAULT 17
    CHECK (notifica_reminder_ora BETWEEN 0 AND 23);

-- Migra dati ore_standard → ore_standard_giornaliere se colonna già esiste
UPDATE utenti SET ore_standard_giornaliere = ore_standard WHERE ore_standard_giornaliere = 8.0;

-- ── Aggiunte a tabella report ────────────────────────────────────
ALTER TABLE report
  -- Umore/stato del lavoro (opzionale, utile per analisi AI)
  ADD COLUMN IF NOT EXISTS umore        SMALLINT DEFAULT NULL
    CHECK (umore BETWEEN 1 AND 5),
  -- Template usato (per UI guided entry)
  ADD COLUMN IF NOT EXISTS template_id  VARCHAR(50) DEFAULT NULL,
  -- Flag: inserito da reminder automatico
  ADD COLUMN IF NOT EXISTS da_reminder  BOOLEAN NOT NULL DEFAULT false;

-- ── Aggiunte a tabella report_mensili ────────────────────────────
ALTER TABLE report_mensili
  -- Score qualità AI (0-100, generato dall'analisi del testo)
  ADD COLUMN IF NOT EXISTS qualita_score      SMALLINT DEFAULT NULL
    CHECK (qualita_score BETWEEN 0 AND 100),
  -- Ore attese calcolate con configurazione utente reale
  ADD COLUMN IF NOT EXISTS ore_attese_reali   DECIMAL(6,2) DEFAULT NULL,
  -- Versione del calcolo (per invalidazione cache)
  ADD COLUMN IF NOT EXISTS calc_version       SMALLINT NOT NULL DEFAULT 1;

-- ── Nuova tabella: alert_log ──────────────────────────────────────
-- Traccia tutti gli alert inviati per evitare duplicati
CREATE TABLE IF NOT EXISTS alert_log (
  id          UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  tipo        VARCHAR(50)  NOT NULL,  -- 'reminder_report', 'ore_basse', 'report_mancante'
  canale      VARCHAR(20)  NOT NULL DEFAULT 'email',
  riferimento VARCHAR(20)  NOT NULL,   -- data a cui si riferisce l'alert
  inviato_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  success     BOOLEAN      NOT NULL DEFAULT true,
  errore      TEXT,

  -- Previene duplicati: un alert per utente/tipo/data/giorno
  CONSTRAINT alert_log_uq UNIQUE (user_id, tipo, riferimento)
);
CREATE INDEX idx_alert_log_user ON alert_log(user_id, inviato_at DESC);

-- ── Nuova tabella: templates_report ──────────────────────────────
CREATE TABLE IF NOT EXISTS templates_report (
  id          VARCHAR(50)  PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  descrizione TEXT,
  testo_base  TEXT         NOT NULL,  -- testo precompilato con placeholder
  categoria   VARCHAR(50),
  attivo      BOOLEAN      NOT NULL DEFAULT true,
  sort_order  SMALLINT     NOT NULL DEFAULT 0
);

INSERT INTO templates_report (id, nome, testo_base, categoria, sort_order) VALUES
('riunione',   'Riunione / Call',
 'Partecipazione a riunione/call con [partecipanti] per [argomento].\nDurata: [X]h. Esito: [risultato/decisioni prese].',
 'comunicazione', 1),
('sviluppo',   'Sviluppo / Coding',
 'Sviluppo [funzionalità/modulo] per [progetto].\nAttività svolte: [dettaglio]. Stato avanzamento: [X]%.',
 'tecnico', 2),
('analisi',    'Analisi / Studio',
 'Analisi [argomento/documento] relativa a [contesto].\nPrincipali evidenze: [punti chiave]. Output: [deliverable].',
 'tecnico', 3),
('sopralluogo','Sopralluogo / Trasferta',
 'Sopralluogo presso [luogo] per [motivo].\nPresenti: [nomi]. Note e rilievi: [dettaglio].',
 'operativo', 4),
('admin',      'Attività Amministrative',
 'Gestione pratiche amministrative: [lista attività].\nDocumentazione elaborata/inviata: [dettaglio].',
 'amministrativo', 5),
('report',     'Redazione Report',
 'Redazione [tipo report] relativo a [argomento/periodo].\nContenuto: [punti principali]. Destinatari: [a chi].',
 'comunicazione', 6)
ON CONFLICT (id) DO NOTHING;

-- ── Indici aggiuntivi per performance ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_report_data_user
  ON report(data DESC, user_id);

CREATE INDEX IF NOT EXISTS idx_report_mensili_perc
  ON report_mensili(percentuale_comp DESC);

CREATE INDEX IF NOT EXISTS idx_utenti_reset_token
  ON utenti(reset_token) WHERE reset_token IS NOT NULL;

-- ── Funzione aggiornata: giorni lavorativi con configurazione utente ──
CREATE OR REPLACE FUNCTION giorni_lavorativi_utente(
  p_anno     INT,
  p_mese     INT,
  p_giorni_sett SMALLINT DEFAULT 5
)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  primo  DATE := make_date(p_anno, p_mese, 1);
  ultimo DATE;
  cnt    INT  := 0;
  d      DATE;
  -- Per p_giorni_sett=5: lun-ven (DOW 1-5)
  -- Per p_giorni_sett=4: lun-gio (DOW 1-4) — ipotesi più comune
  max_dow INT;
BEGIN
  ultimo  := (primo + INTERVAL '1 month - 1 day')::DATE;
  max_dow := CASE
    WHEN p_giorni_sett >= 6 THEN 6
    WHEN p_giorni_sett = 4  THEN 4
    ELSE 5
  END;
  d := primo;
  WHILE d <= ultimo LOOP
    IF EXTRACT(DOW FROM d) BETWEEN 1 AND max_dow THEN
      cnt := cnt + 1;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

-- ── Vista aggiornata stats utenti ────────────────────────────────
CREATE OR REPLACE VIEW v_stats_utenti AS
SELECT
  u.id,
  u.nome,
  u.email,
  u.avatar,
  u.ore_standard_giornaliere,
  u.giorni_lavorativi_sett,
  u.tolleranza_pct,
  u.notifiche_email,
  COUNT(r.id)                         AS totale_report,
  COALESCE(SUM(r.ore_lavorate), 0)    AS ore_totali,
  COALESCE(AVG(r.ore_lavorate), 0)    AS media_ore,
  MAX(r.data)                         AS ultimo_report,
  COUNT(CASE WHEN r.data >= CURRENT_DATE - 30 THEN 1 END) AS report_30gg,
  -- Report mancante oggi?
  CASE WHEN EXISTS(
    SELECT 1 FROM report r2
    WHERE r2.user_id = u.id AND r2.data = CURRENT_DATE
  ) THEN false ELSE true END          AS mancante_oggi
FROM utenti u
LEFT JOIN report r ON r.user_id = u.id
WHERE u.ruolo = 'user' AND u.attivo = true
GROUP BY u.id, u.nome, u.email, u.avatar,
         u.ore_standard_giornaliere, u.giorni_lavorativi_sett,
         u.tolleranza_pct, u.notifiche_email
ORDER BY u.nome;

DO $$ BEGIN RAISE NOTICE 'Migration 001 completata con successo'; END $$;
