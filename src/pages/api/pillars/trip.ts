import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addTrip } from '@/lib/services/pillars';

const schema = z.object({
  trip_name: z.string().min(1),
  start_date: z.string().min(10),
  end_date: z.string().min(10),
  destination: z.string().optional(),
  budget_amount: z.coerce.number().optional(),
  status: z.enum(['planned', 'booked', 'in_progress', 'completed', 'cancelled']).optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addTrip({
    tenantId: session.tenantId,
    tripName: parsed.data.trip_name,
    startDate: parsed.data.start_date,
    endDate: parsed.data.end_date,
    destination: parsed.data.destination || null,
    budgetAmount: parsed.data.budget_amount,
    status: parsed.data.status,
    notes: parsed.data.notes || null
  });

  return redirect(`/trips?year=${year}&saved=trip`, 303);
};
