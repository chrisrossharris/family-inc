import type { APIRoute } from 'astro';
import { z } from 'zod';
import { runImportJob } from '@/lib/services/import-jobs';

const bodySchema = z.object({
  jobId: z.coerce.number().int().positive()
});

function isAuthorized(request: Request): boolean {
  const expected = process.env.IMPORT_JOB_SECRET;
  if (!expected) return true;
  const provided = request.headers.get('x-import-job-secret') ?? '';
  return provided === expected;
}

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  try {
    const job = await runImportJob(parsed.data.jobId);
    return new Response(JSON.stringify({ ok: true, status: job?.status ?? 'unknown' }), { headers: { 'content-type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
