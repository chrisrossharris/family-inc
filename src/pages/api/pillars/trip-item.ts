import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addTripItem } from '@/lib/services/pillars';

const schema = z.object({
  trip_id: z.coerce.number().min(1),
  item_name: z.string().min(1),
  category: z.string().optional(),
  qty: z.coerce.number().min(1).optional(),
  packed: z.coerce.number().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addTripItem({
    tenantId: session.tenantId,
    tripId: parsed.data.trip_id,
    itemName: parsed.data.item_name,
    category: parsed.data.category || null,
    qty: parsed.data.qty,
    packed: parsed.data.packed ? 1 : 0,
    notes: parsed.data.notes || null
  });

  return redirect(`/trips?year=${year}&saved=trip_item`, 303);
};
