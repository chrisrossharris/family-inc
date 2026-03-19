import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { normalizeReportYear } from '@/lib/utils/year';
import { resolveSession } from '@/lib/auth/session';
import { entityExists } from '@/lib/services/finance-entities';

export const GET: APIRoute = async ({ params, url, locals, cookies }) => {
  const entity = params.entity;
  if (!entity) {
    return new Response('Invalid entity', { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const validEntity = await entityExists(session.tenantId, entity);
  if (!validEntity) return new Response('Invalid entity', { status: 400 });
  const year = normalizeReportYear(url.searchParams.get('year'));
  const yearExpr = sqlYearExpr('date');
  const rows = await db.all<{
    date: string;
    vendor: string;
    amount: number;
    category: string;
    deductible_flag: 0 | 1;
    description: string;
  }>(
    `SELECT date, vendor, amount, category, deductible_flag, description
     FROM transactions
     WHERE tenant_id = ? AND entity = ? AND ${yearExpr} = ?
     ORDER BY date ASC, id ASC`,
    [session.tenantId, entity, year]
  );

  const header = 'Date,Vendor,Amount,Category,Deductible,Notes';
  const body = rows
    .map((row) => {
      const notes = row.description.replaceAll('"', '""');
      return `${row.date},"${row.vendor}",${row.amount.toFixed(2)},"${row.category}",${row.deductible_flag ? 'Yes' : 'No'},"${notes}"`;
    })
    .join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${entity}-transactions-${year}.csv"`
    }
  });
};
