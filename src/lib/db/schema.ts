export const schemaSql = `
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  invited_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, email, status),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(invited_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'harris_holdings',
  filename TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  UNIQUE(tenant_id, file_hash)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')) DEFAULT 'queued',
  payload_json TEXT NOT NULL,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  duplicates_count INTEGER NOT NULL DEFAULT 0,
  vendor_updates_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS vendor_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'harris_holdings',
  match_type TEXT NOT NULL CHECK (match_type IN ('exact','contains','regex')),
  match_value TEXT NOT NULL,
  entity TEXT NOT NULL,
  category TEXT NOT NULL,
  deductible_flag INTEGER NOT NULL CHECK (deductible_flag IN (0,1)),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'harris_holdings',
  date TEXT NOT NULL,
  vendor TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  account TEXT NOT NULL,
  entity TEXT NOT NULL,
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
  tenant_id TEXT NOT NULL DEFAULT 'harris_holdings',
  entity TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('home_office','mileage','phone','equipment')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, entity, type)
);

CREATE TABLE IF NOT EXISTS finance_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('person','business')),
  owner_user_id TEXT,
  ownership_type TEXT,
  ownership_percent REAL NOT NULL DEFAULT 100 CHECK (ownership_percent >= 0 AND ownership_percent <= 100),
  tax_classification TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, code),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  birth_date TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS health_symptom_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER,
  occurred_on TEXT NOT NULL,
  symptom TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  duration_hours REAL NOT NULL DEFAULT 0,
  trigger TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS health_sick_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  fever INTEGER NOT NULL DEFAULT 0,
  school_work_missed INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS health_allergies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  allergen TEXT NOT NULL,
  reaction TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  has_epinephrine INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS health_medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  prescribed_by TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS health_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  appointment_date TEXT NOT NULL,
  provider TEXT NOT NULL,
  appointment_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled','completed','cancelled')) DEFAULT 'scheduled',
  follow_up_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS children_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  school_name TEXT,
  grade_level TEXT,
  learning_style TEXT,
  strengths TEXT,
  support_needs TEXT,
  long_term_focus TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, member_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS children_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  checkin_date TEXT NOT NULL,
  mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  sleep_hours REAL NOT NULL DEFAULT 0,
  reading_minutes INTEGER NOT NULL DEFAULT 0,
  movement_minutes INTEGER NOT NULL DEFAULT 0,
  screen_time_minutes INTEGER NOT NULL DEFAULT 0,
  social_connection INTEGER NOT NULL DEFAULT 3 CHECK (social_connection BETWEEN 1 AND 5),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS children_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  goal_title TEXT NOT NULL,
  target_date TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS children_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  milestone_date TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS children_academics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  recorded_on TEXT NOT NULL,
  term TEXT NOT NULL,
  subject TEXT NOT NULL,
  score TEXT,
  teacher_note TEXT,
  support_plan TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS children_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  activity_name TEXT NOT NULL,
  category TEXT NOT NULL,
  schedule TEXT,
  mentor_or_coach TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  monthly_cost REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS children_support_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  contact_name TEXT NOT NULL,
  role TEXT NOT NULL,
  organization TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS family_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  owner_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS family_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  goal_title TEXT NOT NULL,
  domain TEXT NOT NULL,
  target_date TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS family_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  trip_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  destination TEXT,
  budget_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','booked','in_progress','completed','cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS family_trip_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  trip_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  packed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(trip_id) REFERENCES family_trips(id)
);

CREATE TABLE IF NOT EXISTS home_grocery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT,
  needed INTEGER NOT NULL DEFAULT 1,
  last_purchased_on TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS home_grocery_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  store_name TEXT,
  purchased_on TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','ocr_text','integration')),
  raw_text TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS home_grocery_receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  receipt_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(receipt_id) REFERENCES home_grocery_receipts(id)
);

CREATE TABLE IF NOT EXISTS house_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('system','appliance','fixture','exterior','safety','other')),
  category TEXT NOT NULL,
  location TEXT,
  install_date TEXT,
  purchase_date TEXT,
  warranty_expires TEXT,
  expected_lifespan_years INTEGER,
  condition_status TEXT NOT NULL DEFAULT 'good' CHECK (condition_status IN ('good','watch','repair_now','replace_soon')),
  replacement_priority TEXT NOT NULL DEFAULT 'medium' CHECK (replacement_priority IN ('low','medium','high')),
  vendor_name TEXT,
  model_number TEXT,
  serial_number TEXT,
  replacement_cost REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS house_maintenance_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  asset_id INTEGER,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('inspect','service','clean','repair','replace','warranty')),
  cadence_months INTEGER,
  last_completed_on TEXT,
  next_due_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','scheduled','done','skipped')),
  estimated_cost REAL NOT NULL DEFAULT 0,
  vendor_name TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(asset_id) REFERENCES house_assets(id)
);

CREATE TABLE IF NOT EXISTS house_asset_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  asset_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  blob_data BLOB NOT NULL,
  notes TEXT,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(asset_id) REFERENCES house_assets(id)
);

CREATE TABLE IF NOT EXISTS health_calendar_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  feed_name TEXT NOT NULL,
  ical_url TEXT NOT NULL,
  default_member_id INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(default_member_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS health_calendar_event_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  feed_id INTEGER NOT NULL,
  event_uid TEXT NOT NULL,
  appointment_id INTEGER NOT NULL,
  event_hash TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(feed_id, event_uid),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(feed_id) REFERENCES health_calendar_feeds(id),
  FOREIGN KEY(appointment_id) REFERENCES health_appointments(id)
);

CREATE TABLE IF NOT EXISTS energy_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL UNIQUE,
  home_sqft REAL,
  occupants INTEGER,
  utility_rate_per_kwh REAL,
  target_monthly_kwh REAL,
  roof_solar_score INTEGER CHECK (roof_solar_score BETWEEN 1 AND 10),
  owns_home INTEGER NOT NULL DEFAULT 1,
  has_solar INTEGER NOT NULL DEFAULT 0,
  green_utility_plan INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS energy_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  bill_month TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('electricity','gas','water','solar','other')),
  kwh_used REAL NOT NULL DEFAULT 0,
  cost_amount REAL NOT NULL DEFAULT 0,
  peak_kwh REAL NOT NULL DEFAULT 0,
  off_peak_kwh REAL NOT NULL DEFAULT 0,
  renewable_pct REAL NOT NULL DEFAULT 0 CHECK (renewable_pct >= 0 AND renewable_pct <= 100),
  solar_export_kwh REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS energy_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  action_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('efficiency','solar','renewable','behavior','upgrade')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done','skipped')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  estimated_annual_kwh_savings REAL NOT NULL DEFAULT 0,
  estimated_annual_cost_savings REAL NOT NULL DEFAULT 0,
  estimated_upfront_cost REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS income_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  received_date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('client_payment','gift','unemployment','food_stamps','interest','other')),
  payer_name TEXT NOT NULL,
  project_name TEXT,
  gross_amount REAL NOT NULL CHECK (gross_amount >= 0),
  notes TEXT,
  import_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS income_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  income_receipt_id INTEGER NOT NULL,
  entity TEXT NOT NULL,
  split_percent REAL NOT NULL CHECK (split_percent >= 0 AND split_percent <= 100),
  split_amount REAL NOT NULL CHECK (split_amount >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(income_receipt_id) REFERENCES income_receipts(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  project_name TEXT,
  entity TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  amount_total REAL NOT NULL CHECK (amount_total >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft','sent','partial','paid','overdue','void')) DEFAULT 'sent',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, invoice_number),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  invoice_id INTEGER NOT NULL,
  income_receipt_id INTEGER,
  stripe_payment_intent_id TEXT,
  received_on TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  method TEXT,
  reference TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(invoice_id) REFERENCES invoices(id),
  FOREIGN KEY(income_receipt_id) REFERENCES income_receipts(id)
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_billing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_key TEXT NOT NULL DEFAULT 'starter' CHECK (plan_key IN ('starter','family_plus','family_pro')),
  subscription_status TEXT NOT NULL DEFAULT 'inactive' CHECK (subscription_status IN ('inactive','trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired')),
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS today_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS today_action_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('done','snoozed')),
  done_on TEXT,
  snooze_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, user_id, action_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS family_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  member_name TEXT,
  milestone_date TEXT NOT NULL,
  area TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
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
CREATE INDEX IF NOT EXISTS idx_finance_entities_tenant ON finance_entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_entities_owner ON finance_entities(tenant_id, owner_user_id);
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
CREATE INDEX IF NOT EXISTS idx_home_grocery_receipts_tenant_date ON home_grocery_receipts(tenant_id, purchased_on);
CREATE INDEX IF NOT EXISTS idx_home_grocery_receipt_items_tenant_receipt ON home_grocery_receipt_items(tenant_id, receipt_id);
CREATE INDEX IF NOT EXISTS idx_house_assets_tenant ON house_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_house_assets_tenant_priority ON house_assets(tenant_id, replacement_priority, condition_status);
CREATE INDEX IF NOT EXISTS idx_house_tasks_tenant ON house_maintenance_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_house_tasks_tenant_due ON house_maintenance_tasks(tenant_id, next_due_on, status);
CREATE INDEX IF NOT EXISTS idx_house_documents_tenant ON house_asset_documents(tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_health_calendar_feeds_tenant ON health_calendar_feeds(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_health_calendar_links_tenant ON health_calendar_event_links(tenant_id, feed_id);
CREATE INDEX IF NOT EXISTS idx_energy_profiles_tenant ON energy_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_energy_bills_tenant_month ON energy_bills(tenant_id, bill_month);
CREATE INDEX IF NOT EXISTS idx_energy_actions_tenant_status ON energy_actions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_income_receipts_tenant_date ON income_receipts(tenant_id, received_date);
CREATE INDEX IF NOT EXISTS idx_income_receipts_tenant_source ON income_receipts(tenant_id, source_type);
CREATE UNIQUE INDEX IF NOT EXISTS ux_income_receipts_tenant_import_hash ON income_receipts(tenant_id, import_hash);
CREATE INDEX IF NOT EXISTS idx_income_splits_tenant_receipt ON income_splits(tenant_id, income_receipt_id);
CREATE INDEX IF NOT EXISTS idx_income_splits_tenant_entity ON income_splits(tenant_id, entity);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_due ON invoices(tenant_id, due_on);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_tenant_invoice ON invoice_payments(tenant_id, invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_payments_tenant_intent ON invoice_payments(tenant_id, stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_plan ON tenant_billing(plan_key, subscription_status);
CREATE INDEX IF NOT EXISTS idx_today_preferences_tenant_user ON today_preferences(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_today_actions_tenant_user ON today_action_states(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_family_milestones_tenant ON family_milestones(tenant_id);
`;
