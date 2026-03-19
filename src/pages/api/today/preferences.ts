import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { TODAY_ACTION_IDS, upsertTodayWeights } from '@/lib/services/today';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  year: z.string().optional(),
  needs_review: z.coerce.number().min(0.4).max(2.5),
  income_unallocated: z.coerce.number().min(0.4).max(2.5),
  invoices_overdue: z.coerce.number().min(0.4).max(2.5),
  health_high_severity: z.coerce.number().min(0.4).max(2.5),
  health_appointments: z.coerce.number().min(0.4).max(2.5),
  children_goals: z.coerce.number().min(0.4).max(2.5),
  family_goals_overdue: z.coerce.number().min(0.4).max(2.5),
  trips_unpacked: z.coerce.number().min(0.4).max(2.5),
  grocery_needed: z.coerce.number().min(0.4).max(2.5)
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  await upsertTodayWeights(session.tenantId, session.userId, {
    'needs-review': parsed.data.needs_review,
    'income-unallocated': parsed.data.income_unallocated,
    'invoices-overdue': parsed.data.invoices_overdue,
    'health-high-severity': parsed.data.health_high_severity,
    'health-appointments': parsed.data.health_appointments,
    'children-goals': parsed.data.children_goals,
    'family-goals-overdue': parsed.data.family_goals_overdue,
    'trips-unpacked': parsed.data.trips_unpacked,
    'grocery-needed': parsed.data.grocery_needed
  });

  if (TODAY_ACTION_IDS.length < 1) return new Response('Unexpected', { status: 500 });
  return redirect(`/today?year=${year}&saved=weights`, 303);
};
