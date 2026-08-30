PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  contact TEXT,
  photo_key TEXT,
  team TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','converted','closed')),
  activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  converted_at TEXT,
  converted_by_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_status_created ON requests(status, created_at DESC);
CREATE TABLE IF NOT EXISTS activity_checklists (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_checklist_items (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES activity_checklists(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  checked_at TEXT,
  checked_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(checklist_id, position)
);
CREATE INDEX IF NOT EXISTS idx_activity_checklists_activity ON activity_checklists(activity_id);
