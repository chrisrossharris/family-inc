import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addIncomeReceipt } from '@/lib/services/income';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  year: z.string().optional(),
  received_date: z.string().min(10),
  source_type: z.enum(['client_payment', 'gift', 'unemployment', 'food_stamps', 'interest', 'other']),
  payer_name: z.string().min(1),
  project_name: z.string().optional(),
  gross_amount: z.coerce.number().positive(),
  allocation_entity: z.enum(['chris', 'kate', 'big_picture']).optional(),
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

  const splitChris = parsed.data.allocation_entity === 'chris' ? 100 : parsed.data.split_chris;
  const splitKate = parsed.data.allocation_entity === 'kate' ? 100 : parsed.data.split_kate;
  const splitBigPicture = parsed.data.allocation_entity === 'big_picture' ? 100 : parsed.data.split_big_picture;
  const useDropdown = !!parsed.data.allocation_entity;
  const normalizedChris = useDropdown ? splitChris : parsed.data.split_chris;
  const normalizedKate = useDropdown ? splitKate : parsed.data.split_kate;
  const normalizedBigPicture = useDropdown ? splitBigPicture : parsed.data.split_big_picture;
  const splitTotal = normalizedChris + normalizedKate + normalizedBigPicture;
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
      { entity: 'chris', percent: normalizedChris },
      { entity: 'kate', percent: normalizedKate },
      { entity: 'big_picture', percent: normalizedBigPicture }
    ]
  });

  return redirect(`/income?year=${year}&saved=income`, 303);
};
