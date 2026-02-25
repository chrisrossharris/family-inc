import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { normalizeReportYear } from '@/lib/utils/year';
import { resolveSession } from '@/lib/auth/session';

export const GET: APIRoute = async ({ url, locals, cookies }) => {
  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(url.searchParams.get('year'));
  const yearExpr = sqlYearExpr('date');
  const rows = await db.all<{ entity: string; category: string; total: number }>(
    `SELECT entity, category, SUM(amount) AS total
     FROM transactions
     WHERE tenant_id = ? AND amount > 0 AND ${yearExpr} = ?
     GROUP BY entity, category
     ORDER BY entity, total DESC`,
    [session.tenantId, year]
  );

  const header = 'Entity,Category,Total';
  const body = rows.map((r) => `${r.entity},"${r.category}",${r.total.toFixed(2)}`).join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="annual-category-breakdown-${year}.csv"`
    }
  });
};
