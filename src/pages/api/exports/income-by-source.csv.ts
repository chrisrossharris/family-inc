import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { normalizeReportYear } from '@/lib/utils/year';
import { resolveSession } from '@/lib/auth/session';

export const GET: APIRoute = async ({ url, locals, cookies }) => {
  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(url.searchParams.get('year'));
  const yearExpr = sqlYearExpr('r.received_date');

  const rows = await db.all<{
    source_type: string;
    receipts: number;
    gross_total: number;
    allocated_total: number;
  }>(
    `WITH receipt_allocations AS (
       SELECT
         r.id,
         r.source_type,
         r.gross_amount,
         COALESCE(SUM(s.split_amount), 0) AS allocated_amount
       FROM income_receipts r
       LEFT JOIN income_splits s ON s.income_receipt_id = r.id
       WHERE r.tenant_id = ? AND ${yearExpr} = ?
       GROUP BY r.id, r.source_type, r.gross_amount
     )
     SELECT
       source_type,
       COUNT(*) AS receipts,
       SUM(gross_amount) AS gross_total,
       SUM(allocated_amount) AS allocated_total
     FROM receipt_allocations
     GROUP BY source_type
     ORDER BY gross_total DESC, source_type ASC`,
    [session.tenantId, year]
  );

  const header = 'Source Type,Receipts,Gross Total,Allocated Total,Unallocated Total,Allocation Rate';
  const body = rows
    .map((row) => {
      const unallocated = Math.max(0, row.gross_total - row.allocated_total);
      const allocationRate = row.gross_total > 0 ? row.allocated_total / row.gross_total : 0;
      return [
        row.source_type,
        row.receipts,
        row.gross_total.toFixed(2),
        row.allocated_total.toFixed(2),
        unallocated.toFixed(2),
        `${(allocationRate * 100).toFixed(1)}%`
      ].join(',');
    })
    .join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="income-by-source-${year}.csv"`
    }
  });
};
