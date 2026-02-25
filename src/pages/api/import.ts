import type { APIRoute } from 'astro';
import { importCsvFile } from '@/lib/services/imports';
import { enqueueImportJob } from '@/lib/services/import-jobs';
import { normalizeReportYear } from '@/lib/utils/year';
import { resolveSession } from '@/lib/auth/session';

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'CSV file is required' }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const selectedYear = normalizeReportYear(String(form.get('year') ?? ''));
  const content = await file.text();

  const mode = String(form.get('mode') ?? '').toLowerCase();
  const useBackground = mode === 'background' && process.env.NETLIFY === 'true';
  if (mode === 'background') {
    if (!useBackground) {
      const direct = await importCsvFile(session.tenantId, file.name, content);
      const target = new URL('/?imported=1', request.url);
      target.searchParams.set('year', selectedYear);
      target.searchParams.set('inserted', String(direct.inserted));
      target.searchParams.set('skipped', String(direct.skipped));
      target.searchParams.set('duplicates', String(direct.duplicatesFlagged));
      target.searchParams.set('vendorUpdates', String(direct.vendorNamesUpdated));
      target.searchParams.set('alreadyImported', direct.alreadyImported ? '1' : '0');
      if (direct.existingRowCount !== undefined) target.searchParams.set('existingRows', String(direct.existingRowCount));
      if (direct.existingImportedAt) target.searchParams.set('existingImportedAt', direct.existingImportedAt);
      return redirect(target.pathname + target.search, 303);
    }

    const jobId = await enqueueImportJob({
      tenantId: session.tenantId,
      filename: file.name,
      content
    });

    const backgroundUrl = new URL('/.netlify/functions/import-run-background', request.url);
    await fetch(backgroundUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, secret: process.env.IMPORT_JOB_SECRET ?? '' })
    });

    const queuedTarget = new URL('/?imported=1', request.url);
    queuedTarget.pathname = '/imports';
    queuedTarget.searchParams.set('year', selectedYear);
    queuedTarget.searchParams.set('queued', '1');
    queuedTarget.searchParams.set('jobId', String(jobId));
    return redirect(queuedTarget.pathname + queuedTarget.search, 303);
  }

  const result = await importCsvFile(session.tenantId, file.name, content);

  const target = new URL('/?imported=1', request.url);
  target.searchParams.set('year', selectedYear);
  target.searchParams.set('inserted', String(result.inserted));
  target.searchParams.set('skipped', String(result.skipped));
  target.searchParams.set('duplicates', String(result.duplicatesFlagged));
  target.searchParams.set('vendorUpdates', String(result.vendorNamesUpdated));
  target.searchParams.set('alreadyImported', result.alreadyImported ? '1' : '0');
  if (result.existingRowCount !== undefined) target.searchParams.set('existingRows', String(result.existingRowCount));
  if (result.existingImportedAt) target.searchParams.set('existingImportedAt', result.existingImportedAt);

  return redirect(target.pathname + target.search, 303);
};
