PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  team_id TEXT NOT NULL,
  assigned_to TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  location TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
  source TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('MANUAL','RECURRENCE','REQUEST','DIARY','SYSTEM')),
  source_id TEXT,
  tool_code TEXT,
  requires_evidence INTEGER NOT NULL DEFAULT 0,
  requires_note INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  started_at TEXT,
  started_by TEXT,
  completed_at TEXT,
  completed_by TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  FOREIGN KEY(team_id) REFERENCES teams(id),
  FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(started_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(completed_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(tool_code) REFERENCES module_catalog(code) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_status_due ON activities(status,due_at);
CREATE INDEX IF NOT EXISTS idx_activities_team_status ON activities(team_id,status,due_at);
CREATE INDEX IF NOT EXISTS idx_activities_assignee ON activities(assigned_to,status,due_at);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_activities_source ON activities(source,source_id);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  note TEXT,
  details_json TEXT,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_events_activity
  ON activity_events(activity_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_actor
  ON activity_events(actor_user_id,occurred_at);

CREATE TABLE IF NOT EXISTS activity_evidence (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  event_id TEXT,
  evidence_type TEXT NOT NULL DEFAULT 'PHOTO',
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  checksum TEXT,
  description TEXT,
  captured_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  FOREIGN KEY(event_id) REFERENCES activity_events(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_evidence_activity
  ON activity_evidence(activity_id,created_at);

CREATE TABLE IF NOT EXISTS recurrence_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  team_id TEXT NOT NULL,
  assigned_to TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  location TEXT,
  tool_code TEXT,
  requires_evidence INTEGER NOT NULL DEFAULT 0,
  requires_note INTEGER NOT NULL DEFAULT 0,
  schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('DAILY','WEEKLY','MONTHLY')),
  schedule_interval INTEGER NOT NULL DEFAULT 1,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  next_run_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(team_id) REFERENCES teams(id),
  FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(tool_code) REFERENCES module_catalog(code) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recurrence_due
  ON recurrence_templates(active,next_run_at);

CREATE TABLE IF NOT EXISTS activity_occurrences (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  occurrence_key TEXT NOT NULL UNIQUE,
  activity_id TEXT NOT NULL UNIQUE,
  scheduled_for TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(template_id) REFERENCES recurrence_templates(id) ON DELETE CASCADE,
  FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_occurrences_template
  ON activity_occurrences(template_id,scheduled_for);

CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY,
  protocol TEXT NOT NULL UNIQUE,
  category_code TEXT NOT NULL,
  team_id TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  contact_name TEXT,
  contact_value TEXT,
  status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED','TRIAGE','CONVERTED','REJECTED','COMPLETED')),
  activity_id TEXT UNIQUE,
  photo_key TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(team_id) REFERENCES teams(id),
  FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_team_status
  ON service_requests(team_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_requests_ip_created
  ON service_requests(ip_hash,created_at);

-- Registro idempotente das operações originadas offline.
CREATE TABLE IF NOT EXISTS sync_operations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  entity_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_operations_user
  ON sync_operations(user_id,processed_at);

