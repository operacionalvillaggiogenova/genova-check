PRAGMA foreign_keys = ON;
CREATE INDEX IF NOT EXISTS idx_ronda_sessions_vigilante ON ronda_sessions(vigilante);
CREATE INDEX IF NOT EXISTS idx_ronda_checkpoints_status ON ronda_checkpoints(session_id,status);
