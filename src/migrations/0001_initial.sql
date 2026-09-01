PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS collection_reports (
  id TEXT PRIMARY KEY,
  source_report_id TEXT NOT NULL UNIQUE,
  name TEXT,
  condominium TEXT,
  location TEXT,
  service TEXT,
  technician TEXT,
  report_date TEXT,
  notes TEXT,
  pdf_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  utility TEXT NOT NULL CHECK (utility IN ('water','gas')),
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  invoice_consumption REAL,
  total_value REAL NOT NULL DEFAULT 0,
  conversion_factor REAL NOT NULL DEFAULT 1,
  units_per_block INTEGER NOT NULL DEFAULT 16,
  condo_consumption REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  UNIQUE(report_id, utility),
  FOREIGN KEY(report_id) REFERENCES collection_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  block_code TEXT NOT NULL,
  previous_value REAL,
  current_value REAL,
  measured_value REAL,
  corrected INTEGER NOT NULL DEFAULT 0,
  correction_reason TEXT,
  source_group_id TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(cycle_id, block_code),
  FOREIGN KEY(cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cost_items (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  description TEXT NOT NULL,
  invoice_number TEXT,
  due_date TEXT,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidences (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  cycle_id TEXT,
  reading_id TEXT,
  utility TEXT,
  meter TEXT,
  r2_key TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(report_id) REFERENCES collection_reports(id) ON DELETE CASCADE,
  FOREIGN KEY(cycle_id) REFERENCES cycles(id) ON DELETE CASCADE,
  FOREIGN KEY(reading_id) REFERENCES readings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cycles_status ON cycles(status, utility, reference);
CREATE INDEX IF NOT EXISTS idx_readings_cycle ON readings(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cost_items_cycle ON cost_items(cycle_id);
CREATE INDEX IF NOT EXISTS idx_evidences_cycle ON evidences(cycle_id);

CREATE TABLE IF NOT EXISTS rateio_results (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  block_code TEXT NOT NULL,
  measured_consumption REAL NOT NULL DEFAULT 0,
  converted_consumption REAL NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  block_amount REAL NOT NULL DEFAULT 0,
  condo_amount REAL NOT NULL DEFAULT 0,
  apartment_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(cycle_id) REFERENCES cycles(id) ON DELETE CASCADE,
  UNIQUE(cycle_id, block_code)
);
CREATE INDEX IF NOT EXISTS idx_rateio_results_cycle ON rateio_results(cycle_id);
