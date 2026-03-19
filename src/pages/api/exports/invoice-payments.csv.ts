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
  const rows = await db.all<{
    received_on: string;
    invoice_number: string;
    client_name: string;
    entity: string;
    amount: number;
    method: string | null;
    reference: string | null;
    stripe_payment_intent_id: string | null;
    income_receipt_id: number | null;
  }>(
    `SELECT
       p.received_on,
       i.invoice_number,
       i.client_name,
       i.entity,
       p.amount,
       p.method,
       p.reference,
       p.stripe_payment_intent_id,
       p.income_receipt_id
     FROM invoice_payments p
     INNER JOIN invoices i ON i.id = p.invoice_id
     WHERE p.tenant_id = ? AND ${sqlYearExpr('p.received_on')} = ?
     ORDER BY p.received_on ASC, p.id ASC`,
    [session.tenantId, year]
  );

  const header = 'Received On,Invoice Number,Client,Entity,Amount,Method,Reference,Stripe Payment Intent,Synced To Income,Income Receipt ID';
  const body = rows
    .map((r) =>
      [
        r.received_on,
        csvCell(r.invoice_number),
        csvCell(r.client_name),
        r.entity,
        r.amount.toFixed(2),
        csvCell(r.method),
        csvCell(r.reference),
        csvCell(r.stripe_payment_intent_id),
        r.income_receipt_id ? 'Yes' : 'No',
        r.income_receipt_id ?? ''
      ].join(',')
    )
    .join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="invoice-payments-${year}.csv"`
    }
  });
};
