import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { getImportJob } from '@/lib/services/import-jobs';

const querySchema = z.object({
  id: z.coerce.number().int().positive()
});

export const GET: APIRoute = async ({ request, locals, cookies }) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const job = await getImportJob(session.tenantId, parsed.data.id);
  if (!job) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  return new Response(
    JSON.stringify({
      id: job.id,
      status: job.status,
      inserted: job.inserted_count,
      skipped: job.skipped_count,
      duplicates: job.duplicates_count,
      vendorUpdates: job.vendor_updates_count,
      error: job.error_message,
      createdAt: job.created_at,
      completedAt: job.completed_at
    }),
    { headers: { 'content-type': 'application/json' } }
  );
};
