import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { Pool } from 'pg';
import { schemaSql } from './schema';
import { postgresSchemaSql } from './schema-postgres';

function resolveMigrationDatabaseUrl(): string {
  return (
    process.env.MIGRATIONS_DATABASE_URL ??
    process.env.NETLIFY_DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL ??
    process.env.TURSO_DATABASE_URL ??
    'file:./data/family-ledger.sqlite'
  );
}

function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runPostgresMigrations(url: string, migrationFiles: string[]) {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    for (const statement of splitSqlStatements(postgresSchemaSql)) {
      await client.query(statement);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const filename of migrationFiles) {
      const already = await client.query('SELECT filename FROM schema_migrations WHERE filename = $1', [filename]);
      if (already.rowCount && already.rowCount > 0) continue;

      const fullPath = path.join(process.cwd(), 'migrations', filename);
      const sql = fs.readFileSync(fullPath, 'utf8');

      await client.query('BEGIN');
      try {
        for (const statement of splitSqlStatements(sql)) {
          await client.query(statement);
        }
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function runLibsqlMigrations(url: string, migrationFiles: string[]) {
  const normalizedUrl =
    url.startsWith('libsql://') || url.startsWith('https://') || url.startsWith('file:')
      ? url
      : `file:${path.isAbsolute(url) ? url : path.resolve(process.cwd(), url)}`;

  const client = createClient({ url: normalizedUrl, authToken: process.env.TURSO_AUTH_TOKEN });

  for (const statement of splitSqlStatements(schemaSql).filter((s) => !s.toLowerCase().startsWith('pragma'))) {
    await client.execute(statement);
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const filename of migrationFiles) {
    const already = await client.execute({ sql: 'SELECT filename FROM schema_migrations WHERE filename = ?', args: [filename] });
    if (already.rows.length > 0) continue;

    const fullPath = path.join(process.cwd(), 'migrations', filename);
    const sql = fs.readFileSync(fullPath, 'utf8');

    await client.execute('BEGIN');
    try {
      for (const statement of splitSqlStatements(sql)) {
        await client.execute(statement);
      }
      await client.execute({ sql: 'INSERT INTO schema_migrations (filename) VALUES (?)', args: [filename] });
      await client.execute('COMMIT');
    } catch (error) {
      await client.execute('ROLLBACK');
      throw error;
    }
  }

  client.close();
}

async function main() {
  if (process.env.SKIP_DB_MIGRATIONS === '1') {
    console.log('Skipping migrations (SKIP_DB_MIGRATIONS=1)');
    return;
  }

  const migrationsDir = path.join(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found; skipping');
    return;
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    console.log('No migration files found');
    return;
  }

  const url = resolveMigrationDatabaseUrl();
  const postgres = isPostgresUrl(url);

  console.log(`Running ${migrationFiles.length} migration(s) on ${postgres ? 'postgres' : 'libsql/sqlite'}`);
  if (postgres) await runPostgresMigrations(url, migrationFiles);
  else await runLibsqlMigrations(url, migrationFiles);
  console.log('Migrations complete');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
