import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addIncomeReceipt } from '@/lib/services/income';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  year: z.string().optional(),
  received_date: z.string().min(10),
  source_type: z.enum(['client_payment', 'gift', 'unemployment', 'food_stamps', 'other']),
  payer_name: z.string().min(1),
  project_name: z.string().optional(),
  gross_amount: z.coerce.number().positive(),
  split_chris: z.coerce.number().min(0).max(100).default(0),
  split_kate: z.coerce.number().min(0).max(100).default(0),
  split_big_picture: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const splitTotal = parsed.data.split_chris + parsed.data.split_kate + parsed.data.split_big_picture;
  if (splitTotal <= 0 || splitTotal > 100) {
    return new Response(JSON.stringify({ error: 'Split total must be greater than 0 and less than or equal to 100.' }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  await addIncomeReceipt({
    tenantId: session.tenantId,
    receivedDate: parsed.data.received_date,
    sourceType: parsed.data.source_type,
    payerName: parsed.data.payer_name,
    projectName: parsed.data.project_name || null,
    grossAmount: parsed.data.gross_amount,
    notes: parsed.data.notes || null,
    splits: [
      { entity: 'chris', percent: parsed.data.split_chris },
      { entity: 'kate', percent: parsed.data.split_kate },
      { entity: 'big_picture', percent: parsed.data.split_big_picture }
    ]
  });

  return redirect(`/income?year=${year}&saved=income`, 303);
};
