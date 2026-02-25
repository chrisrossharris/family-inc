import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { normalizeReportYear } from '@/lib/utils/year';
import { resolveSession } from '@/lib/auth/session';

export const GET: APIRoute = async ({ url, locals, cookies }) => {
  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(url.searchParams.get('year'));
  const yearExpr = sqlYearExpr('date');
  const rows = await db.all<{ entity: string; gross_total: number; deductible_total: number }>(
    `SELECT entity, SUM(amount) AS gross_total, SUM(amount) * 0.5 AS deductible_total
     FROM transactions
     WHERE tenant_id = ? AND category = 'Meals (50%)' AND amount > 0 AND ${yearExpr} = ?
     GROUP BY entity
     ORDER BY entity`,
    [session.tenantId, year]
  );

  const header = 'Entity,Meals Gross,Meals Deductible (50%)';
  const body = rows.map((r) => `${r.entity},${r.gross_total.toFixed(2)},${r.deductible_total.toFixed(2)}`).join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="meals-summary-${year}.csv"`
    }
  });
};
