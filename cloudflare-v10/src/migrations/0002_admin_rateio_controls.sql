PRAGMA foreign_keys = ON;

ALTER TABLE readings ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_readings_cycle_excluded ON readings(cycle_id, excluded);
