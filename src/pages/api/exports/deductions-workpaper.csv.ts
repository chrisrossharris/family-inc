import type { APIRoute } from 'astro';
import { normalizeReportYear } from '@/lib/utils/year';
import { resolveSession } from '@/lib/auth/session';
import { entityExists } from '@/lib/services/finance-entities';
import { getDeductions, estimateDeduction } from '@/lib/services/deductions';

export const GET: APIRoute = async ({ url, locals, cookies }) => {
  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(url.searchParams.get('year'));
  const entity = url.searchParams.get('entity');

  if (entity) {
    const validEntity = await entityExists(session.tenantId, entity);
    if (!validEntity) return new Response('Invalid entity', { status: 400 });
  }

  const rows = await getDeductions(session.tenantId, entity ?? undefined);
  const header = 'Entity,Type,Estimated Deduction,Payload JSON,Updated At,Notes';
  const body = rows
    .map((row) => {
      const estimate = estimateDeduction(row.type, (row.payload ?? {}) as Record<string, unknown>);
      const payloadJson = JSON.stringify(row.payload ?? {}).replaceAll('"', '""');
      const notes =
        row.type === 'equipment'
          ? 'Section 179 toggle controls full vs 20% estimate'
          : row.type === 'mileage'
            ? 'Verify IRS mileage rate and mileage log support'
            : row.type === 'phone'
              ? 'Business % should reflect documented usage'
              : 'Business-use % = business sqft / total sqft';
      return `"${row.entity}","${row.type}",${estimate.toFixed(2)},"${payloadJson}","${row.updated_at}","${notes}"`;
    })
    .join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="deductions-workpaper-${entity ?? 'all'}-${year}.csv"`
    }
  });
};

