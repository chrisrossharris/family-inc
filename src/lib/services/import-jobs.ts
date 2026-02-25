import db from '@/lib/db/connection';
import { importCsvFile } from '@/lib/services/imports';

export type ImportJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ImportJob {
  id: number;
  tenant_id: string;
  filename: string;
  status: ImportJobStatus;
  payload_json: string;
  inserted_count: number;
  skipped_count: number;
  duplicates_count: number;
  vendor_updates_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function enqueueImportJob(input: { tenantId: string; filename: string; content: string }) {
  const payload = JSON.stringify({ content: input.content });
  await db.run(
    `INSERT INTO import_jobs (tenant_id, filename, status, payload_json)
     VALUES (?, ?, 'queued', ?)`,
    [input.tenantId, input.filename, payload]
  );
  const created = await db.get<{ id: number }>('SELECT id FROM import_jobs WHERE tenant_id = ? ORDER BY id DESC LIMIT 1', [input.tenantId]);
  return created?.id ?? 0;
}

export async function getImportJob(tenantId: string, jobId: number) {
  return db.get<ImportJob>('SELECT * FROM import_jobs WHERE tenant_id = ? AND id = ?', [tenantId, jobId]);
}

export async function listImportJobs(tenantId: string, limit = 50) {
  return db.all<ImportJob>(
    `SELECT *
     FROM import_jobs
     WHERE tenant_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    [tenantId, limit]
  );
}

export async function runImportJob(jobId: number) {
  const job = await db.get<ImportJob>('SELECT * FROM import_jobs WHERE id = ?', [jobId]);
  if (!job) throw new Error(`Import job ${jobId} not found`);
  if (job.status === 'completed') return job;

  await db.run("UPDATE import_jobs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?", [jobId]);

  try {
    const payload = JSON.parse(job.payload_json) as { content?: string };
    if (!payload?.content) throw new Error('Missing import payload content');

    const result = await importCsvFile(job.tenant_id, job.filename, payload.content);
    await db.run(
      `UPDATE import_jobs
       SET status = 'completed',
           inserted_count = ?,
           skipped_count = ?,
           duplicates_count = ?,
           vendor_updates_count = ?,
           completed_at = CURRENT_TIMESTAMP,
           error_message = NULL
       WHERE id = ?`,
      [result.inserted, result.skipped, result.duplicatesFlagged, result.vendorNamesUpdated, jobId]
    );
  } catch (error) {
    await db.run(
      `UPDATE import_jobs
       SET status = 'failed',
           completed_at = CURRENT_TIMESTAMP,
           error_message = ?
       WHERE id = ?`,
      [String(error), jobId]
    );
    throw error;
  }

  return db.get<ImportJob>('SELECT * FROM import_jobs WHERE id = ?', [jobId]);
}
