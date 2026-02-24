export const schemaSql = `
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL,
  file_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS vendor_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact','contains','regex')),
  match_value TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('chris','kate','big_picture')),
  category TEXT NOT NULL,
  deductible_flag INTEGER NOT NULL CHECK (deductible_flag IN (0,1)),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  vendor TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  account TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('chris','kate','big_picture')),
  category TEXT NOT NULL,
  deductible_flag INTEGER NOT NULL CHECK (deductible_flag IN (0,1)),
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  rule_id INTEGER,
  import_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(rule_id) REFERENCES vendor_rules(id)
);

CREATE TABLE IF NOT EXISTS deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL CHECK (entity IN ('chris','kate','big_picture')),
  type TEXT NOT NULL CHECK (type IN ('home_office','mileage','phone','equipment')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity, type)
);

CREATE INDEX IF NOT EXISTS idx_transactions_entity ON transactions(entity);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor ON transactions(vendor);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
`;
