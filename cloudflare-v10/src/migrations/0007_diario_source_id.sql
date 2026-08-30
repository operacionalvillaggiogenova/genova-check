PRAGMA foreign_keys = ON;
ALTER TABLE diario_services ADD COLUMN source_local_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_diario_services_source ON diario_services(report_id, source_local_id);
