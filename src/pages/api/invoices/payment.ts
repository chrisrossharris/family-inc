import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addInvoicePayment } from '@/lib/services/invoices';

const schema = z.object({
  year: z.string().optional(),
  invoice_id: z.coerce.number().int().positive(),
  received_on: z.string().min(10),
  amount: z.coerce.number().positive(),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addInvoicePayment({
    tenantId: session.tenantId,
    invoiceId: parsed.data.invoice_id,
    receivedOn: parsed.data.received_on,
    amount: parsed.data.amount,
    method: parsed.data.method?.trim() || null,
    reference: parsed.data.reference?.trim() || null,
    notes: parsed.data.notes?.trim() || null
  });

  return redirect(`/invoices?year=${year}&saved=payment`, 303);
};
