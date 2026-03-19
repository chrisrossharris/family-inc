import type { APIRoute } from 'astro';
import { normalizeReportYear } from '@/lib/utils/year';
import { previewIncomeCsv } from '@/lib/services/income-imports';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'CSV file is required' }), { status: 400 });
  }

  const selectedYear = normalizeReportYear(String(form.get('year') ?? ''));
  const preview = previewIncomeCsv(await file.text());

  const target = new URL('/income', request.url);
  target.searchParams.set('year', selectedYear);
  target.searchParams.set('previewIncome', '1');
  target.searchParams.set('previewTotal', String(preview.totalRows));
  target.searchParams.set('previewValid', String(preview.validRows));
  target.searchParams.set('previewInvalid', String(preview.invalidRows));
  target.searchParams.set('previewIncomeLike', String(preview.incomeLikeRows));
  return redirect(target.pathname + target.search, 303);
};
