PRAGMA foreign_keys = ON;

ALTER TABLE activity_templates ADD COLUMN awaiting_activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS activity_notes (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_notes_activity ON activity_notes(activity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_materials (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_materials_activity ON activity_materials(activity_id, created_at DESC);

ALTER TABLE activity_evidence ADD COLUMN captured_at TEXT;
ALTER TABLE activity_evidence ADD COLUMN source TEXT NOT NULL DEFAULT 'upload';

CREATE TABLE IF NOT EXISTS activity_template_checklists (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES activity_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_template_checklist_items (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES activity_template_checklists(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE(checklist_id, position)
);
