PRAGMA foreign_keys = ON;
ALTER TABLE activities ADD COLUMN requires_observation INTEGER NOT NULL DEFAULT 0 CHECK(requires_observation IN (0,1));
ALTER TABLE activities ADD COLUMN cancelled_at TEXT;
ALTER TABLE activities ADD COLUMN cancelled_by_id TEXT REFERENCES users(id) ON DELETE SET NULL;
