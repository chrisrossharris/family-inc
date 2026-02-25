export const postgresSchemaSql = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email, status)
);

CREATE TABLE IF NOT EXISTS imports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'harris_holdings',
  filename TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_count INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  UNIQUE(tenant_id, file_hash)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  filename TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')) DEFAULT 'queued',
  payload_json TEXT NOT NULL,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  duplicates_count INTEGER NOT NULL DEFAULT 0,
  vendor_updates_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vendor_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'harris_holdings',
  match_type TEXT NOT NULL CHECK (match_type IN ('exact','contains','regex')),
  match_value TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('chris','kate','big_picture')),
  category TEXT NOT NULL,
  deductible_flag INTEGER NOT NULL CHECK (deductible_flag IN (0,1)),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'harris_holdings',
  date TEXT NOT NULL,
  vendor TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  description TEXT NOT NULL,
  account TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('chris','kate','big_picture')),
  category TEXT NOT NULL,
  deductible_flag INTEGER NOT NULL CHECK (deductible_flag IN (0,1)),
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  rule_id BIGINT,
  import_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(import_hash),
  FOREIGN KEY(rule_id) REFERENCES vendor_rules(id)
);

CREATE TABLE IF NOT EXISTS deductions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'harris_holdings',
  entity TEXT NOT NULL CHECK (entity IN ('chris','kate','big_picture')),
  type TEXT NOT NULL CHECK (type IN ('home_office','mileage','phone','equipment')),
  payload_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, entity, type)
);

CREATE TABLE IF NOT EXISTS family_members (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  birth_date TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_symptom_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT REFERENCES family_members(id),
  occurred_on TEXT NOT NULL,
  symptom TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  duration_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  trigger TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_sick_days (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  fever INTEGER NOT NULL DEFAULT 0,
  school_work_missed INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_allergies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  allergen TEXT NOT NULL,
  reaction TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  has_epinephrine INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_medications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  prescribed_by TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_appointments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  appointment_date TEXT NOT NULL,
  provider TEXT NOT NULL,
  appointment_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled','completed','cancelled')) DEFAULT 'scheduled',
  follow_up_date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS children_profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  school_name TEXT,
  grade_level TEXT,
  learning_style TEXT,
  strengths TEXT,
  support_needs TEXT,
  long_term_focus TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, member_id)
);

CREATE TABLE IF NOT EXISTS children_checkins (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  checkin_date TEXT NOT NULL,
  mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  sleep_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  reading_minutes INTEGER NOT NULL DEFAULT 0,
  movement_minutes INTEGER NOT NULL DEFAULT 0,
  screen_time_minutes INTEGER NOT NULL DEFAULT 0,
  social_connection INTEGER NOT NULL DEFAULT 3 CHECK (social_connection BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS children_goals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  domain TEXT NOT NULL,
  goal_title TEXT NOT NULL,
  target_date TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS children_milestones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  milestone_date TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS children_academics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  recorded_on TEXT NOT NULL,
  term TEXT NOT NULL,
  subject TEXT NOT NULL,
  score TEXT,
  teacher_note TEXT,
  support_plan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS children_activities (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  activity_name TEXT NOT NULL,
  category TEXT NOT NULL,
  schedule TEXT,
  mentor_or_coach TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  monthly_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS children_support_contacts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_id BIGINT NOT NULL REFERENCES family_members(id),
  contact_name TEXT NOT NULL,
  role TEXT NOT NULL,
  organization TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS family_projects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  owner_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS family_goals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  goal_title TEXT NOT NULL,
  domain TEXT NOT NULL,
  target_date TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS family_trips (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  trip_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  destination TEXT,
  budget_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','booked','in_progress','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS family_trip_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  trip_id BIGINT NOT NULL REFERENCES family_trips(id),
  item_name TEXT NOT NULL,
  category TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  packed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS home_grocery_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  unit TEXT,
  needed INTEGER NOT NULL DEFAULT 1,
  last_purchased_on TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS income_receipts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  received_date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('client_payment','gift','unemployment','food_stamps','other')),
  payer_name TEXT NOT NULL,
  project_name TEXT,
  gross_amount DOUBLE PRECISION NOT NULL CHECK (gross_amount >= 0),
  notes TEXT,
  import_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS income_splits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  income_receipt_id BIGINT NOT NULL REFERENCES income_receipts(id),
  entity TEXT NOT NULL CHECK (entity IN ('chris','kate','big_picture')),
  split_percent DOUBLE PRECISION NOT NULL CHECK (split_percent >= 0 AND split_percent <= 100),
  split_amount DOUBLE PRECISION NOT NULL CHECK (split_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS family_milestones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  member_name TEXT,
  milestone_date TEXT NOT NULL,
  area TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_entity ON transactions(entity);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor ON transactions(vendor);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rules_tenant ON vendor_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imports_tenant ON imports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_status ON import_jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_deductions_tenant ON deductions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_family_members_tenant ON family_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_health_symptoms_tenant ON health_symptom_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_health_sick_days_tenant ON health_sick_days(tenant_id);
CREATE INDEX IF NOT EXISTS idx_health_allergies_tenant ON health_allergies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_health_meds_tenant ON health_medications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_health_appts_tenant ON health_appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_children_profiles_tenant ON children_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_children_checkins_tenant ON children_checkins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_children_goals_tenant ON children_goals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_children_milestones_tenant ON children_milestones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_children_academics_tenant ON children_academics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_children_activities_tenant ON children_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_children_contacts_tenant ON children_support_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_family_projects_tenant ON family_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_family_goals_tenant ON family_goals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_family_trips_tenant ON family_trips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_family_trip_items_tenant ON family_trip_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_home_grocery_items_tenant ON home_grocery_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_income_receipts_tenant_date ON income_receipts(tenant_id, received_date);
CREATE INDEX IF NOT EXISTS idx_income_receipts_tenant_source ON income_receipts(tenant_id, source_type);
CREATE UNIQUE INDEX IF NOT EXISTS ux_income_receipts_tenant_import_hash ON income_receipts(tenant_id, import_hash);
CREATE INDEX IF NOT EXISTS idx_income_splits_tenant_receipt ON income_splits(tenant_id, income_receipt_id);
CREATE INDEX IF NOT EXISTS idx_income_splits_tenant_entity ON income_splits(tenant_id, entity);
CREATE INDEX IF NOT EXISTS idx_family_milestones_tenant ON family_milestones(tenant_id);
`;
