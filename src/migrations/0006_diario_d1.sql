PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS diario_evidences (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  taken_at TEXT,
  time_verified INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(service_id) REFERENCES diario_services(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_diario_evidences_service ON diario_evidences(service_id);
CREATE INDEX IF NOT EXISTS idx_diario_reports_employee ON diario_reports(employee);
CREATE INDEX IF NOT EXISTS idx_diario_services_location ON diario_services(location);
