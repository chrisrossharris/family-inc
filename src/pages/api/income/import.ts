import type { APIRoute } from 'astro';
import { resolveSession } from '@/lib/auth/session';
import { importIncomeCsvFile } from '@/lib/services/income-imports';
import { normalizeReportYear } from '@/lib/utils/year';

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'CSV file is required' }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const selectedYear = normalizeReportYear(String(form.get('year') ?? ''));
  const content = await file.text();
  const result = await importIncomeCsvFile(session.tenantId, content);

  const target = new URL('/income', request.url);
  target.searchParams.set('year', selectedYear);
  target.searchParams.set('importedIncome', '1');
  target.searchParams.set('insertedIncome', String(result.inserted));
  target.searchParams.set('skippedIncome', String(result.skipped));
  target.searchParams.set('invalidIncome', String(result.invalid));
  return redirect(target.pathname + target.search, 303);
};
