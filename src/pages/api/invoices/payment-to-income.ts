import type { APIRoute } from 'astro';
import { z } from 'zod';
import db from '@/lib/db/connection';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addIncomeReceipt } from '@/lib/services/income';

const schema = z.object({
  year: z.string().optional(),
  payment_id: z.coerce.number().int().positive()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  const payment = await db.get<{
    id: number;
    income_receipt_id: number | null;
    invoice_id: number;
    received_on: string;
    amount: number;
    method: string | null;
    reference: string | null;
    notes: string | null;
    invoice_number: string;
    client_name: string;
    project_name: string | null;
    entity: 'chris' | 'kate' | 'big_picture';
  }>(
    `SELECT
       p.id,
       p.income_receipt_id,
       p.invoice_id,
       p.received_on,
       p.amount,
       p.method,
       p.reference,
       p.notes,
       i.invoice_number,
       i.client_name,
       i.project_name,
       i.entity
     FROM invoice_payments p
     INNER JOIN invoices i ON i.id = p.invoice_id
     WHERE p.tenant_id = ? AND p.id = ?`,
    [session.tenantId, parsed.data.payment_id]
  );

  if (!payment) return new Response(JSON.stringify({ error: 'Payment not found' }), { status: 404 });

  const target = new URL('/invoices', request.url);
  target.searchParams.set('year', year);

  if (payment.income_receipt_id) {
    target.searchParams.set('saved', 'payment_already_synced');
    return redirect(target.pathname + target.search, 303);
  }

  const created = await addIncomeReceipt({
    tenantId: session.tenantId,
    receivedDate: payment.received_on,
    sourceType: 'client_payment',
    payerName: payment.client_name,
    projectName: payment.project_name ?? null,
    grossAmount: payment.amount,
    notes: `Invoice ${payment.invoice_number}${payment.reference ? ` · Ref ${payment.reference}` : ''}${payment.notes ? ` · ${payment.notes}` : ''}`,
    splits: [{ entity: payment.entity, percent: 100 }]
  });

  if (!created.inserted || !created.id) {
    target.searchParams.set('saved', 'payment_sync_failed');
    return redirect(target.pathname + target.search, 303);
  }

  await db.run('UPDATE invoice_payments SET income_receipt_id = ? WHERE tenant_id = ? AND id = ?', [created.id, session.tenantId, payment.id]);

  target.searchParams.set('saved', 'payment_synced_to_income');
  return redirect(target.pathname + target.search, 303);
};
