import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { normalizeReportYear } from '@/lib/utils/year';
import { resolveSession } from '@/lib/auth/session';

function csvCell(value: string | null | undefined): string {
  const normalized = value ?? '';
  return `"${normalized.replaceAll('"', '""')}"`;
}

export const GET: APIRoute = async ({ url, locals, cookies }) => {
  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(url.searchParams.get('year'));
  const yearExpr = sqlYearExpr('r.received_date');

  const rows = await db.all<{
    client: string;
    project: string | null;
    receipts: number;
    gross_total: number;
    chris_allocated: number;
    kate_allocated: number;
    big_picture_allocated: number;
    allocated_total: number;
  }>(
    `WITH receipt_allocations AS (
       SELECT
         r.id,
         r.payer_name,
         r.project_name,
         r.gross_amount,
         COALESCE(SUM(CASE WHEN s.entity = 'chris' THEN s.split_amount ELSE 0 END), 0) AS chris_amount,
         COALESCE(SUM(CASE WHEN s.entity = 'kate' THEN s.split_amount ELSE 0 END), 0) AS kate_amount,
         COALESCE(SUM(CASE WHEN s.entity = 'big_picture' THEN s.split_amount ELSE 0 END), 0) AS big_picture_amount,
         COALESCE(SUM(s.split_amount), 0) AS allocated_amount
       FROM income_receipts r
       LEFT JOIN income_splits s ON s.income_receipt_id = r.id
       WHERE r.tenant_id = ? AND ${yearExpr} = ? AND r.source_type = 'client_payment'
       GROUP BY r.id, r.payer_name, r.project_name, r.gross_amount
     )
     SELECT
       payer_name AS client,
       project_name AS project,
       COUNT(*) AS receipts,
       SUM(gross_amount) AS gross_total,
       SUM(chris_amount) AS chris_allocated,
       SUM(kate_amount) AS kate_allocated,
       SUM(big_picture_amount) AS big_picture_allocated,
       SUM(allocated_amount) AS allocated_total
     FROM receipt_allocations
     GROUP BY payer_name, project_name
     ORDER BY gross_total DESC, payer_name ASC`,
    [session.tenantId, year]
  );

  const header =
    'Client,Project,Receipts,Gross Total,Chris Allocated,Kate Allocated,Big Picture Allocated,Allocated Total,Unallocated Total';
  const body = rows
    .map((row) => {
      const unallocated = Math.max(0, row.gross_total - row.allocated_total);
      return [
        csvCell(row.client),
        csvCell(row.project),
        row.receipts,
        row.gross_total.toFixed(2),
        row.chris_allocated.toFixed(2),
        row.kate_allocated.toFixed(2),
        row.big_picture_allocated.toFixed(2),
        row.allocated_total.toFixed(2),
        unallocated.toFixed(2)
      ].join(',');
    })
    .join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="income-by-client-project-${year}.csv"`
    }
  });
};
