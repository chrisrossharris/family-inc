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
    received_date: string;
    source_type: string;
    payer_name: string;
    project_name: string | null;
    gross_amount: number;
    split_chris_pct: number;
    split_kate_pct: number;
    split_big_picture_pct: number;
    split_chris_amount: number;
    split_kate_amount: number;
    split_big_picture_amount: number;
    allocated_amount: number;
    notes: string | null;
  }>(
    `SELECT
       r.received_date,
       r.source_type,
       r.payer_name,
       r.project_name,
       r.gross_amount,
       COALESCE(SUM(CASE WHEN s.entity = 'chris' THEN s.split_percent ELSE 0 END), 0) AS split_chris_pct,
       COALESCE(SUM(CASE WHEN s.entity = 'kate' THEN s.split_percent ELSE 0 END), 0) AS split_kate_pct,
       COALESCE(SUM(CASE WHEN s.entity = 'big_picture' THEN s.split_percent ELSE 0 END), 0) AS split_big_picture_pct,
       COALESCE(SUM(CASE WHEN s.entity = 'chris' THEN s.split_amount ELSE 0 END), 0) AS split_chris_amount,
       COALESCE(SUM(CASE WHEN s.entity = 'kate' THEN s.split_amount ELSE 0 END), 0) AS split_kate_amount,
       COALESCE(SUM(CASE WHEN s.entity = 'big_picture' THEN s.split_amount ELSE 0 END), 0) AS split_big_picture_amount,
       COALESCE(SUM(s.split_amount), 0) AS allocated_amount,
       r.notes
     FROM income_receipts r
     LEFT JOIN income_splits s ON s.income_receipt_id = r.id
     WHERE r.tenant_id = ? AND ${yearExpr} = ?
     GROUP BY r.id, r.received_date, r.source_type, r.payer_name, r.project_name, r.gross_amount, r.notes
     ORDER BY r.received_date ASC, r.id ASC`,
    [session.tenantId, year]
  );

  const header =
    'Date,Source Type,Payer,Project,Gross Amount,Chris %,Kate %,Big Picture %,Chris Amount,Kate Amount,Big Picture Amount,Allocated Amount,Unallocated Amount,Notes';
  const body = rows
    .map((row) => {
      const unallocated = Math.max(0, row.gross_amount - row.allocated_amount);
      return [
        row.received_date,
        row.source_type,
        csvCell(row.payer_name),
        csvCell(row.project_name),
        row.gross_amount.toFixed(2),
        row.split_chris_pct.toFixed(1),
        row.split_kate_pct.toFixed(1),
        row.split_big_picture_pct.toFixed(1),
        row.split_chris_amount.toFixed(2),
        row.split_kate_amount.toFixed(2),
        row.split_big_picture_amount.toFixed(2),
        row.allocated_amount.toFixed(2),
        unallocated.toFixed(2),
        csvCell(row.notes)
      ].join(',');
    })
    .join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="income-ledger-${year}.csv"`
    }
  });
};
