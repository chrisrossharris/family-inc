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
    process.env.NETLIFY_DATABASE_URL_UNPOOLED ??
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
  'ALTER TABLE income_receipts ADD COLUMN import_hash TEXT'
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
}

async function seedDefaultTenant() {
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
