PRAGMA foreign_keys = ON;

-- Liga cada resultado de campo à atividade que originou sua execução.
ALTER TABLE collection_reports ADD COLUMN activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL;
ALTER TABLE collection_reports ADD COLUMN submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ronda_sessions ADD COLUMN activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL;
ALTER TABLE ronda_sessions ADD COLUMN submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE fiscalizacao_reports ADD COLUMN activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL;
ALTER TABLE fiscalizacao_reports ADD COLUMN submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE diario_reports ADD COLUMN activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL;
ALTER TABLE diario_reports ADD COLUMN submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_collection_reports_activity ON collection_reports(activity_id);
CREATE INDEX IF NOT EXISTS idx_ronda_sessions_activity ON ronda_sessions(activity_id);
CREATE INDEX IF NOT EXISTS idx_fiscalizacao_reports_activity ON fiscalizacao_reports(activity_id);
CREATE INDEX IF NOT EXISTS idx_diario_reports_activity ON diario_reports(activity_id);

-- Envios produzidos pelo Rateio de campo e recebidos pelo Adm-Rateio.
CREATE TABLE IF NOT EXISTS rateio_submissions (
  id TEXT PRIMARY KEY,
  source_local_id TEXT NOT NULL,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('tags','mudancas','ressarcimentos')),
  title TEXT NOT NULL,
  report_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED','IN_REVIEW','PROCESSED','CANCELLED')),
  activity_id TEXT,
  submitted_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_local_id, submitted_by),
  FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE SET NULL,
  FOREIGN KEY(submitted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rateio_submissions_date
  ON rateio_submissions(report_date,updated_at);
CREATE INDEX IF NOT EXISTS idx_rateio_submissions_activity
  ON rateio_submissions(activity_id);

CREATE TABLE IF NOT EXISTS rateio_submission_evidence (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(submission_id) REFERENCES rateio_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rateio_submission_evidence_submission
  ON rateio_submission_evidence(submission_id,created_at);
