PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS fiscalizacao_evidences (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(item_id) REFERENCES fiscalizacao_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fiscalizacao_evidences_item ON fiscalizacao_evidences(item_id);
CREATE INDEX IF NOT EXISTS idx_fiscalizacao_reports_inspector ON fiscalizacao_reports(inspector);
CREATE INDEX IF NOT EXISTS idx_fiscalizacao_items_category ON fiscalizacao_items(category);
ALTER TABLE fiscalizacao_items ADD COLUMN source_local_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscalizacao_items_source ON fiscalizacao_items(report_id, source_local_id);
