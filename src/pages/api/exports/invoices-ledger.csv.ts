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
  const yearExpr = sqlYearExpr('i.issued_on');

  const rows = await db.all<{
    invoice_number: string;
    client_name: string;
    project_name: string | null;
    entity: string;
    issued_on: string;
    due_on: string;
    status: string;
    amount_total: number;
    amount_paid: number;
  }>(
    `SELECT
       i.invoice_number,
       i.client_name,
       i.project_name,
       i.entity,
       i.issued_on,
       i.due_on,
       i.status,
       i.amount_total,
       COALESCE(SUM(p.amount), 0) AS amount_paid
     FROM invoices i
     LEFT JOIN invoice_payments p ON p.invoice_id = i.id
     WHERE i.tenant_id = ? AND ${yearExpr} = ?
     GROUP BY i.id, i.invoice_number, i.client_name, i.project_name, i.entity, i.issued_on, i.due_on, i.status, i.amount_total
     ORDER BY i.due_on ASC, i.id ASC`,
    [session.tenantId, year]
  );

  const header = 'Invoice Number,Client,Project,Entity,Issued On,Due On,Status,Amount Total,Amount Paid,Amount Outstanding';
  const body = rows
    .map((r) => {
      const outstanding = Math.max(0, r.amount_total - r.amount_paid);
      return [
        csvCell(r.invoice_number),
        csvCell(r.client_name),
        csvCell(r.project_name),
        r.entity,
        r.issued_on,
        r.due_on,
        r.status,
        r.amount_total.toFixed(2),
        r.amount_paid.toFixed(2),
        outstanding.toFixed(2)
      ].join(',');
    })
    .join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="invoices-ledger-${year}.csv"`
    }
  });
};
