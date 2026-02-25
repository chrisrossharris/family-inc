import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { normalizeReportYear } from '@/lib/utils/year';
import { resolveSession } from '@/lib/auth/session';

export const GET: APIRoute = async ({ url, locals, cookies }) => {
  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(url.searchParams.get('year'));
  const yearExpr = sqlYearExpr('date');
  const rows = await db.all<{ entity: string; vendor: string; total_paid: number }>(
    `SELECT entity, vendor, SUM(amount) AS total_paid
     FROM transactions
     WHERE tenant_id = ? AND category = 'Contract Labor' AND amount > 0 AND ${yearExpr} = ?
     GROUP BY entity, vendor
     HAVING SUM(amount) > 600
     ORDER BY total_paid DESC`,
    [session.tenantId, year]
  );

  const header = 'Entity,Vendor,Total Paid';
  const body = rows.map((r) => `${r.entity},"${r.vendor}",${r.total_paid.toFixed(2)}`).join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="contract-labor-over-600-${year}.csv"`
    }
  });
};
