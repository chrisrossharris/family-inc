import type { APIRoute } from 'astro';
import { importCsvFile } from '@/lib/services/imports';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'CSV file is required' }), { status: 400 });
  }

  const content = await file.text();
  const result = await importCsvFile(file.name, content);

  const target = new URL('/?imported=1', request.url);
  target.searchParams.set('inserted', String(result.inserted));
  target.searchParams.set('skipped', String(result.skipped));
  target.searchParams.set('duplicates', String(result.duplicatesFlagged));
  target.searchParams.set('alreadyImported', result.alreadyImported ? '1' : '0');
  if (result.existingRowCount !== undefined) target.searchParams.set('existingRows', String(result.existingRowCount));
  if (result.existingImportedAt) target.searchParams.set('existingImportedAt', result.existingImportedAt);

  return redirect(target.pathname + target.search, 303);
};
