import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addInvoice } from '@/lib/services/invoices';

const schema = z.object({
  year: z.string().optional(),
  invoice_number: z.string().min(1),
  client_name: z.string().min(1),
  project_name: z.string().optional(),
  entity: z.enum(['chris', 'kate', 'big_picture']),
  issued_on: z.string().min(10),
  due_on: z.string().min(10),
  amount_total: z.coerce.number().positive(),
  status: z.enum(['draft', 'sent', 'partial', 'paid', 'overdue', 'void']).optional(),
  notes: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addInvoice({
    tenantId: session.tenantId,
    invoiceNumber: parsed.data.invoice_number.trim(),
    clientName: parsed.data.client_name.trim(),
    projectName: parsed.data.project_name?.trim() || null,
    entity: parsed.data.entity,
    issuedOn: parsed.data.issued_on,
    dueOn: parsed.data.due_on,
    amountTotal: parsed.data.amount_total,
    status: parsed.data.status ?? 'sent',
    notes: parsed.data.notes?.trim() || null
  });

  return redirect(`/invoices?year=${year}&saved=invoice`, 303);
};
