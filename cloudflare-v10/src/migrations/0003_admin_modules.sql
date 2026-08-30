PRAGMA foreign_keys = ON;

-- Estrutura base para a migração dos módulos operacionais para D1.
CREATE TABLE IF NOT EXISTS ronda_sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  vigilante TEXT,
  notes TEXT,
  source_local_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ronda_sessions_started ON ronda_sessions(started_at);

CREATE TABLE IF NOT EXISTS ronda_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  point_order INTEGER NOT NULL,
  point_name TEXT NOT NULL,
  checked_at TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  occurrence TEXT,
  evidence_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id, point_order),
  FOREIGN KEY(session_id) REFERENCES ronda_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ronda_checkpoints_session ON ronda_checkpoints(session_id, point_order);

CREATE TABLE IF NOT EXISTS fiscalizacao_reports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL DEFAULT 'Fiscalização de Unidades',
  name TEXT,
  report_date TEXT NOT NULL,
  inspector TEXT,
  notes TEXT,
  source_local_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fiscalizacao_reports_date ON fiscalizacao_reports(report_date);

CREATE TABLE IF NOT EXISTS fiscalizacao_items (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  block TEXT,
  unit TEXT,
  category TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(report_id) REFERENCES fiscalizacao_reports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fiscalizacao_items_report ON fiscalizacao_items(report_id);
CREATE INDEX IF NOT EXISTS idx_fiscalizacao_items_location ON fiscalizacao_items(block, unit);

CREATE TABLE IF NOT EXISTS diario_reports (
  id TEXT PRIMARY KEY,
  employee TEXT,
  started_at TEXT,
  ended_at TEXT,
  general_notes TEXT,
  source_local_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diario_reports_started ON diario_reports(started_at);

CREATE TABLE IF NOT EXISTS diario_services (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  title TEXT,
  location TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(report_id) REFERENCES diario_reports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_diario_services_report ON diario_services(report_id);

CREATE TABLE IF NOT EXISTS diario_materials (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  name TEXT,
  qty TEXT,
  unit TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(service_id) REFERENCES diario_services(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_diario_materials_service ON diario_materials(service_id);
