import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { Pool, type PoolClient, type QueryResult } from 'pg';
import { schemaSql } from './schema';
import { postgresSchemaSql } from './schema-postgres';

export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowid: number | null;
}

interface DbClient {
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
}

function resolveDatabaseUrl(): string {
  const explicit =
    process.env.DATABASE_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.NETLIFY_DATABASE_URL_UNPOOLED ??
    process.env.NETLIFY_DATABASE_URL ??
    process.env.TURSO_DATABASE_URL ??
    'file:./data/family-ledger.sqlite';
  return explicit;
}

function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

const databaseUrl = resolveDatabaseUrl();
const postgresMode = isPostgresUrl(databaseUrl);
const libsqlMode = !postgresMode;

const libsqlUrl = (() => {
  if (!libsqlMode) return '';
  if (databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('https://') || databaseUrl.startsWith('file:')) return databaseUrl;
  const resolved = path.isAbsolute(databaseUrl) ? databaseUrl : path.resolve(process.cwd(), databaseUrl);
  return `file:${resolved}`;
})();

const isLocalFile = libsqlMode && libsqlUrl.startsWith('file:');
if (isLocalFile) {
  const filePath = libsqlUrl.slice('file:'.length);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const libsqlClient: Client | null = libsqlMode
  ? createClient({
      url: libsqlUrl,
      authToken: process.env.TURSO_AUTH_TOKEN
    })
  : null;

const pgPool: Pool | null = postgresMode
  ? new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    })
  : null;

const activeSchemaSql = postgresMode ? postgresSchemaSql : schemaSql;
const schemaStatements = activeSchemaSql
  .split(';')
  .map((part) => part.trim())
  .filter((part) => part.length > 0)
  .filter((part) => (libsqlMode ? isLocalFile || !part.toLowerCase().startsWith('pragma') : true));

let initPromise: Promise<void> | null = null;

const migrationStatements = [
  "ALTER TABLE imports ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'harris_holdings'",
  "ALTER TABLE vendor_rules ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'harris_holdings'",
  "ALTER TABLE transactions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'harris_holdings'",
  "ALTER TABLE deductions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'harris_holdings'",
  'ALTER TABLE income_receipts ADD COLUMN import_hash TEXT',
  'ALTER TABLE invoice_payments ADD COLUMN income_receipt_id INTEGER',
  'ALTER TABLE invoice_payments ADD COLUMN stripe_payment_intent_id TEXT'
];

function mapParamsToPg(sql: string, params: SqlValue[]) {
  let i = 0;
  const mappedSql = sql.replace(/\?/g, () => {
    i += 1;
    return `$${i}`;
  });
  return { sql: mappedSql, params };
}

async function runPg(sql: string, params: SqlValue[] = [], client?: PoolClient): Promise<QueryResult<Record<string, unknown>>> {
  const { sql: mappedSql, params: mappedParams } = mapParamsToPg(sql, params);
  if (client) return client.query(mappedSql, mappedParams);
  if (!pgPool) throw new Error('Postgres pool not initialized');
  return pgPool.query(mappedSql, mappedParams);
}

async function runLibsql(sql: string, params: SqlValue[] = []) {
  if (!libsqlClient) throw new Error('libSQL client not initialized');
  return libsqlClient.execute({ sql, args: params });
}

async function relaxPostgresEntityConstraints() {
  const statements = [
    'ALTER TABLE vendor_rules DROP CONSTRAINT IF EXISTS vendor_rules_entity_check',
    'ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_entity_check',
    'ALTER TABLE deductions DROP CONSTRAINT IF EXISTS deductions_entity_check',
    'ALTER TABLE income_splits DROP CONSTRAINT IF EXISTS income_splits_entity_check',
    'ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_entity_check',
    'ALTER TABLE income_receipts DROP CONSTRAINT IF EXISTS income_receipts_source_type_check'
  ];
  for (const statement of statements) {
    try {
      await runPg(statement);
    } catch (error) {
      const lower = String(error).toLowerCase();
      if (!lower.includes('does not exist') && !lower.includes('undefined table')) throw error;
    }
  }
}

async function sqliteTableHasLegacyEntityCheck(tableName: string) {
  const row = await runLibsql('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?', ['table', tableName]);
  const sql = String(row.rows?.[0]?.sql ?? '').toLowerCase();
  return sql.includes("entity in ('chris','kate','big_picture')");
}

async function rebuildSqliteEntityTables() {
  const needsVendorRules = await sqliteTableHasLegacyEntityCheck('vendor_rules');
  const needsTransactions = await sqliteTableHasLegacyEntityCheck('transactions');
  const needsDeductions = await sqliteTableHasLegacyEntityCheck('deductions');
  const needsIncomeSplits = await sqliteTableHasLegacyEntityCheck('income_splits');
  const needsInvoices = await sqliteTableHasLegacyEntityCheck('invoices');
  const incomeReceiptsSqlRow = await runLibsql('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?', ['table', 'income_receipts']);
  const incomeReceiptsSql = String(incomeReceiptsSqlRow.rows?.[0]?.sql ?? '').toLowerCase();
  const needsIncomeReceipts = incomeReceiptsSql.includes("source_type in ('client_payment','gift','unemployment','food_stamps','other')");

  if (!needsVendorRules && !needsTransactions && !needsDeductions && !needsIncomeSplits && !needsInvoices && !needsIncomeReceipts) return;

  await runLibsql('PRAGMA foreign_keys = OFF');
  try {
    if (needsVendorRules) {
      await runLibsql(
        `CREATE TABLE vendor_rules__new (
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
        )`
      );
      await runLibsql(
        `INSERT INTO vendor_rules__new (id, tenant_id, match_type, match_value, entity, category, deductible_flag, notes, created_at, updated_at)
         SELECT id, tenant_id, match_type, match_value, entity, category, deductible_flag, notes, created_at, updated_at FROM vendor_rules`
      );
      await runLibsql('DROP TABLE vendor_rules');
      await runLibsql('ALTER TABLE vendor_rules__new RENAME TO vendor_rules');
    }

    if (needsTransactions) {
      await runLibsql(
        `CREATE TABLE transactions__new (
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
        )`
      );
      await runLibsql(
        `INSERT INTO transactions__new
          (id, tenant_id, date, vendor, amount, description, account, entity, category, deductible_flag, confidence, rule_id, import_hash, created_at)
         SELECT id, tenant_id, date, vendor, amount, description, account, entity, category, deductible_flag, confidence, rule_id, import_hash, created_at
         FROM transactions`
      );
      await runLibsql('DROP TABLE transactions');
      await runLibsql('ALTER TABLE transactions__new RENAME TO transactions');
    }

    if (needsDeductions) {
      await runLibsql(
        `CREATE TABLE deductions__new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id TEXT NOT NULL DEFAULT 'harris_holdings',
          entity TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('home_office','mileage','phone','equipment')),
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tenant_id, entity, type)
        )`
      );
      await runLibsql(
        `INSERT INTO deductions__new (id, tenant_id, entity, type, payload_json, created_at, updated_at)
         SELECT id, tenant_id, entity, type, payload_json, created_at, updated_at FROM deductions`
      );
      await runLibsql('DROP TABLE deductions');
      await runLibsql('ALTER TABLE deductions__new RENAME TO deductions');
    }

    if (needsIncomeSplits) {
      await runLibsql(
        `CREATE TABLE income_splits__new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id TEXT NOT NULL,
          income_receipt_id INTEGER NOT NULL,
          entity TEXT NOT NULL,
          split_percent REAL NOT NULL CHECK (split_percent >= 0 AND split_percent <= 100),
          split_amount REAL NOT NULL CHECK (split_amount >= 0),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(tenant_id) REFERENCES tenants(id),
          FOREIGN KEY(income_receipt_id) REFERENCES income_receipts(id)
        )`
      );
      await runLibsql(
        `INSERT INTO income_splits__new (id, tenant_id, income_receipt_id, entity, split_percent, split_amount, created_at)
         SELECT id, tenant_id, income_receipt_id, entity, split_percent, split_amount, created_at FROM income_splits`
      );
      await runLibsql('DROP TABLE income_splits');
      await runLibsql('ALTER TABLE income_splits__new RENAME TO income_splits');
    }

    if (needsInvoices) {
      await runLibsql(
        `CREATE TABLE invoices__new (
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
        )`
      );
      await runLibsql(
        `INSERT INTO invoices__new (id, tenant_id, invoice_number, client_name, project_name, entity, issued_on, due_on, amount_total, status, notes, created_at, updated_at)
         SELECT id, tenant_id, invoice_number, client_name, project_name, entity, issued_on, due_on, amount_total, status, notes, created_at, updated_at FROM invoices`
      );
      await runLibsql('DROP TABLE invoices');
      await runLibsql('ALTER TABLE invoices__new RENAME TO invoices');
    }

    if (needsIncomeReceipts) {
      await runLibsql(
        `CREATE TABLE income_receipts__new (
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
        )`
      );
      await runLibsql(
        `INSERT INTO income_receipts__new (id, tenant_id, received_date, source_type, payer_name, project_name, gross_amount, notes, import_hash, created_at, updated_at)
         SELECT id, tenant_id, received_date, source_type, payer_name, project_name, gross_amount, notes, import_hash, created_at, updated_at FROM income_receipts`
      );
      await runLibsql('DROP TABLE income_receipts');
      await runLibsql('ALTER TABLE income_receipts__new RENAME TO income_receipts');
    }
  } finally {
    await runLibsql('PRAGMA foreign_keys = ON');
  }
}

function normalizeRow<T>(row: unknown): T {
  const normalized = Object.fromEntries(
    Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value])
  );
  return normalized as T;
}

async function runMigrations() {
  for (const statement of migrationStatements) {
    try {
      if (postgresMode) await runPg(statement);
      else await runLibsql(statement);
    } catch (error) {
      const lower = String(error).toLowerCase();
      if (
        !lower.includes('duplicate column name') &&
        !lower.includes('already exists') &&
        !lower.includes('no such table') &&
        !lower.includes('does not exist')
      ) {
        throw error;
      }
    }
  }

  if (postgresMode) await relaxPostgresEntityConstraints();
  else await rebuildSqliteEntityTables();

  try {
    const indexSql = 'CREATE UNIQUE INDEX IF NOT EXISTS ux_deductions_tenant_entity_type ON deductions(tenant_id, entity, type)';
    if (postgresMode) await runPg(indexSql);
    else await runLibsql(indexSql);
  } catch (error) {
    const lower = String(error).toLowerCase();
    if (!lower.includes('no such table') && !lower.includes('no such column') && !lower.includes('does not exist')) {
      throw error;
    }
  }

  try {
    const indexSql = 'CREATE UNIQUE INDEX IF NOT EXISTS ux_income_receipts_tenant_import_hash ON income_receipts(tenant_id, import_hash)';
    if (postgresMode) await runPg(indexSql);
    else await runLibsql(indexSql);
  } catch (error) {
    const lower = String(error).toLowerCase();
    if (!lower.includes('no such table') && !lower.includes('no such column') && !lower.includes('does not exist')) {
      throw error;
    }
  }

  try {
    const indexSql = 'CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_payments_tenant_intent ON invoice_payments(tenant_id, stripe_payment_intent_id)';
    if (postgresMode) await runPg(indexSql);
    else await runLibsql(indexSql);
  } catch (error) {
    const lower = String(error).toLowerCase();
    if (!lower.includes('no such table') && !lower.includes('no such column') && !lower.includes('does not exist')) {
      throw error;
    }
  }
}

async function seedDefaultTenant() {
  const shouldSeedDemoData = !postgresMode && process.env.ENABLE_DEMO_SEED !== '0';
  if (!shouldSeedDemoData) return;

  const insertTenant =
    "INSERT INTO tenants (id, slug, name) VALUES ('harris_holdings', 'harris-holdings', 'Harris Holdings') ON CONFLICT (id) DO NOTHING";
  const insertUser =
    "INSERT INTO users (id, email, display_name) VALUES ('chris_harris', 'chris@harrisholdings.local', 'Chris Harris') ON CONFLICT (id) DO NOTHING";
  const insertMembership =
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ('harris_holdings', 'chris_harris', 'owner') ON CONFLICT (tenant_id, user_id) DO NOTHING";

  if (postgresMode) {
    await runPg(insertTenant);
    await runPg(insertUser);
    await runPg(insertMembership);
  } else {
    await runLibsql(insertTenant);
    await runLibsql(insertUser);
    await runLibsql(insertMembership);
  }
}

async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      await runMigrations();
      for (const statement of schemaStatements) {
        if (postgresMode) await runPg(statement);
        else await runLibsql(statement);
      }
      await runMigrations();
      await seedDefaultTenant();
    })();
  }
  await initPromise;
}

const db: DbClient = {
  async all<T>(sql: string, params: SqlValue[] = []) {
    await ensureInit();
    if (postgresMode) {
      const rs = await runPg(sql, params);
      return rs.rows.map((row: Record<string, unknown>) => normalizeRow<T>(row));
    }

    const rs = await runLibsql(sql, params);
    return rs.rows.map((row) => normalizeRow<T>(row));
  },

  async get<T>(sql: string, params: SqlValue[] = []) {
    const rows = await db.all<T>(sql, params);
    return rows[0];
  },

  async run(sql: string, params: SqlValue[] = []) {
    await ensureInit();

    if (postgresMode) {
      const rs = await runPg(sql, params);
      const first = rs.rows[0] as { id?: number } | undefined;
      return {
        changes: rs.rowCount ?? 0,
        lastInsertRowid: typeof first?.id === 'number' ? first.id : null
      };
    }

    const rs = await runLibsql(sql, params);
    const lastInsertRowid = rs.lastInsertRowid === undefined || rs.lastInsertRowid === null ? null : Number(rs.lastInsertRowid);
    return {
      changes: rs.rowsAffected,
      lastInsertRowid: Number.isFinite(lastInsertRowid) ? lastInsertRowid : null
    };
  },

  async transaction<T>(fn: (tx: DbClient) => Promise<T>) {
    await ensureInit();

    if (postgresMode) {
      if (!pgPool) throw new Error('Postgres pool not initialized');
      const client = await pgPool.connect();
      const txClient: DbClient = {
        async all<U>(sql: string, params: SqlValue[] = []) {
          const rs = await runPg(sql, params, client);
          return rs.rows.map((row: Record<string, unknown>) => normalizeRow<U>(row));
        },
        async get<U>(sql: string, params: SqlValue[] = []) {
          const rows = await txClient.all<U>(sql, params);
          return rows[0];
        },
        async run(sql: string, params: SqlValue[] = []) {
          const rs = await runPg(sql, params, client);
          const first = rs.rows[0] as { id?: number } | undefined;
          return {
            changes: rs.rowCount ?? 0,
            lastInsertRowid: typeof first?.id === 'number' ? first.id : null
          };
        },
        async transaction<U>(innerFn: (tx: DbClient) => Promise<U>) {
          return innerFn(txClient);
        }
      };

      try {
        await client.query('BEGIN');
        const result = await fn(txClient);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    await db.run('BEGIN');
    try {
      const result = await fn(db);
      await db.run('COMMIT');
      return result;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }
};

export const dbDialect = postgresMode ? 'postgres' : 'sqlite';
export const isPostgres = postgresMode;
export default db;
export { databaseUrl };
