PRAGMA foreign_keys = ON;

ALTER TABLE activities ADD COLUMN type TEXT NOT NULL DEFAULT 'one_off' CHECK(type IN ('one_off','recurring'));
ALTER TABLE activities ADD COLUMN template_id TEXT;

CREATE TABLE IF NOT EXISTS activity_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  team TEXT NOT NULL,
  assigned_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  location TEXT,
  recurrence_type TEXT NOT NULL CHECK(recurrence_type IN ('daily','weekly','monthly','custom')),
  interval_value INTEGER NOT NULL DEFAULT 1 CHECK(interval_value >= 1),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  next_run_at TEXT NOT NULL,
  requires_evidence INTEGER NOT NULL DEFAULT 0 CHECK(requires_evidence IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_occurrences (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES activity_templates(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  scheduled_for TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(template_id, scheduled_for),
  UNIQUE(activity_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_templates_due ON activity_templates(active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_activity_occurrences_template ON activity_occurrences(template_id, scheduled_for DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_template_due ON activities(template_id, due_date) WHERE template_id IS NOT NULL;
