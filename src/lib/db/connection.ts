import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { schemaSql } from './schema';

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
  const explicit = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? 'file:./data/family-ledger.sqlite';

  if (explicit.startsWith('libsql://') || explicit.startsWith('https://') || explicit.startsWith('file:')) {
    return explicit;
  }

  const resolved = path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
  return `file:${resolved}`;
}

const databaseUrl = resolveDatabaseUrl();
const isLocalFile = databaseUrl.startsWith('file:');

if (isLocalFile) {
  const filePath = databaseUrl.slice('file:'.length);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const client: Client = createClient({
  url: databaseUrl,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const schemaStatements = schemaSql
  .split(';')
  .map((part) => part.trim())
  .filter((part) => part.length > 0)
  .filter((part) => isLocalFile || !part.toLowerCase().startsWith('pragma'));

let initPromise: Promise<void> | null = null;

async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      for (const statement of schemaStatements) {
        await client.execute(statement);
      }
    })();
  }
  await initPromise;
}

function normalizeRow<T>(row: unknown): T {
  const normalized = Object.fromEntries(
    Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value])
  );
  return normalized as T;
}

const db: DbClient = {
  async all<T>(sql, params = []) {
    await ensureInit();
    const rs = await client.execute({ sql, args: params });
    return rs.rows.map((row) => normalizeRow<T>(row));
  },

  async get<T>(sql, params = []) {
    const rows = await db.all<T>(sql, params);
    return rows[0];
  },

  async run(sql, params = []) {
    await ensureInit();
    const rs = await client.execute({ sql, args: params });
    const lastInsertRowid = rs.lastInsertRowid === undefined || rs.lastInsertRowid === null ? null : Number(rs.lastInsertRowid);
    return {
      changes: rs.rowsAffected,
      lastInsertRowid: Number.isFinite(lastInsertRowid) ? lastInsertRowid : null
    };
  },

  async transaction<T>(fn) {
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

export default db;
export { databaseUrl };
