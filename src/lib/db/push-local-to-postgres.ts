import path from 'node:path';
import { createClient } from '@libsql/client';
import { Pool } from 'pg';

type SqliteValue = string | number | null;

const TABLE_ORDER = [
  'tenants',
  'users',
  'memberships',
  'invitations',
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

function resolveSqliteUrl() {
  const file = process.env.SOURCE_SQLITE_PATH?.trim() || './data/family-ledger.sqlite';
  const resolved = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  return `file:${resolved}`;
}

function resolveTargetPgUrl() {
  const candidates = [
    'TARGET_DATABASE_URL',
    'MIGRATIONS_DATABASE_URL',
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'NETLIFY_DATABASE_URL_UNPOOLED',
    'NETLIFY_DATABASE_URL'
  ] as const;

  for (const key of candidates) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

async function getPgColumnTypes(pool: Pool, tableName: string) {
  const rs = await pool.query<{ column_name: string; data_type: string }>(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  );
  const map = new Map<string, string>();
  for (const row of rs.rows) map.set(row.column_name, row.data_type);
  return map;
}

async function getSqliteColumns(sqlite: ReturnType<typeof createClient>, tableName: string) {
  const rs = await sqlite.execute({ sql: `PRAGMA table_info(${tableName})`, args: [] });
  return rs.rows.map((row) => String((row as Record<string, unknown>).name));
}

function chunk<T>(input: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < input.length; i += size) out.push(input.slice(i, i + size));
  return out;
}

function toPgValue(value: unknown, dataType: string | undefined): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (dataType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === '1' || v === 'true' || v === 't' || v === 'yes') return true;
      if (v === '0' || v === 'false' || v === 'f' || v === 'no' || v === '') return false;
    }
    return Boolean(value);
  }
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

async function copyTable(sqlite: ReturnType<typeof createClient>, pool: Pool, tableName: string) {
  const pgColumns = await getPgColumnTypes(pool, tableName);
  if (pgColumns.size === 0) {
    console.log(`- ${tableName}: skipped (table missing in Postgres)`);
    return { tableName, inserted: 0, read: 0, skipped: true };
  }

  const sqliteColumns = await getSqliteColumns(sqlite, tableName);
  const commonColumns = sqliteColumns.filter((name) => pgColumns.has(name));
  if (commonColumns.length === 0) {
    console.log(`- ${tableName}: skipped (no overlapping columns)`);
    return { tableName, inserted: 0, read: 0, skipped: true };
  }

  const quotedColumns = commonColumns.map((name) => `"${name}"`).join(', ');
  const selectSql = `SELECT ${quotedColumns} FROM ${tableName}`;
  const rs = await sqlite.execute({ sql: selectSql, args: [] });
  const rows = rs.rows as Array<Record<string, SqliteValue>>;
  if (rows.length === 0) {
    console.log(`- ${tableName}: 0 rows`);
    return { tableName, inserted: 0, read: 0, skipped: false };
  }

  let inserted = 0;
  for (const group of chunk(rows, 200)) {
    const values: Array<string | number | boolean | null> = [];
    const tuples: string[] = [];

    for (const row of group) {
      const placeholders: string[] = [];
      for (const column of commonColumns) {
        values.push(toPgValue(row[column], pgColumns.get(column)));
        placeholders.push(`$${values.length}`);
      }
      tuples.push(`(${placeholders.join(', ')})`);
    }

    const sql = `INSERT INTO "${tableName}" (${quotedColumns}) OVERRIDING SYSTEM VALUE VALUES ${tuples.join(', ')} ON CONFLICT DO NOTHING`;
    const result = await pool.query(sql, values);
    inserted += result.rowCount ?? 0;
  }

  console.log(`- ${tableName}: inserted ${inserted}/${rows.length}`);
  return { tableName, inserted, read: rows.length, skipped: false };
}

async function main() {
  const target = resolveTargetPgUrl();
  if (!target) {
    throw new Error('Missing Postgres target URL. Set TARGET_DATABASE_URL or DATABASE_URL.');
  }

  if (!target.value.startsWith('postgres://') && !target.value.startsWith('postgresql://')) {
    throw new Error(`Target URL from ${target.key} is not Postgres`);
  }

  const sqliteUrl = resolveSqliteUrl();
  const sqlite = createClient({ url: sqliteUrl });
  const pool = new Pool({ connectionString: target.value, ssl: { rejectUnauthorized: false } });

  console.log(`Source SQLite: ${sqliteUrl}`);
  console.log(`Target Postgres env: ${target.key}`);

  let totalRead = 0;
  let totalInserted = 0;
  try {
    for (const tableName of TABLE_ORDER) {
      const result = await copyTable(sqlite, pool, tableName);
      totalRead += result.read;
      totalInserted += result.inserted;
    }
  } finally {
    sqlite.close();
    await pool.end();
  }

  console.log(`Done. Inserted ${totalInserted} rows from ${totalRead} source rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

