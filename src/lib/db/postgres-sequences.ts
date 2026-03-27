import type { Pool, PoolClient } from 'pg';

const IDENTITY_TABLES = [
  'schema_migrations',
  'imports',
  'import_jobs',
  'vendor_rules',
  'transactions',
  'deductions',
  'finance_entities',
  'family_members',
  'health_symptom_logs',
  'health_sick_days',
  'health_allergies',
  'health_medications',
  'health_appointments',
  'health_calendar_feeds',
  'health_calendar_event_links',
  'children_profiles',
  'children_checkins',
  'children_goals',
  'children_milestones',
  'children_academics',
  'children_activities',
  'children_support_contacts',
  'family_projects',
  'family_goals',
  'family_trips',
  'family_trip_items',
  'home_grocery_items',
  'home_grocery_receipts',
  'home_grocery_receipt_items',
  'house_assets',
  'house_maintenance_tasks',
  'house_asset_documents',
  'energy_profiles',
  'energy_bills',
  'energy_actions',
  'income_receipts',
  'income_splits',
  'invoices',
  'invoice_payments',
  'stripe_webhook_events',
  'tenant_billing',
  'today_preferences',
  'today_action_states',
  'family_milestones'
] as const;

type PgExecutor = Pool | PoolClient;

export async function resetPostgresIdentitySequences(executor: PgExecutor) {
  for (const tableName of IDENTITY_TABLES) {
    await executor.query(
      `
        SELECT setval(
          pg_get_serial_sequence($1, 'id'),
          COALESCE((SELECT MAX(id) FROM ${tableName}), 0) + 1,
          false
        )
        WHERE pg_get_serial_sequence($1, 'id') IS NOT NULL
      `,
      [tableName]
    );
  }
}
