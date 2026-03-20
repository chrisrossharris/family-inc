import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addFamilyGoal, updateFamilyGoal } from '@/lib/services/pillars';
import { formOptionalInt, formOptionalNumber, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  id: formOptionalInt({ positive: true }),
  goal_title: formTrimmedString(),
  domain: formTrimmedString(),
  target_date: z.string().optional(),
  progress_pct: formOptionalNumber({ min: 0, max: 100 }),
  status: z.enum(['active', 'on_hold', 'completed']).optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  if (parsed.data.id) {
    await updateFamilyGoal({
      tenantId: session.tenantId,
      id: parsed.data.id,
      goalTitle: parsed.data.goal_title,
      domain: parsed.data.domain,
      targetDate: parsed.data.target_date || null,
      progressPct: parsed.data.progress_pct,
      status: parsed.data.status,
      notes: parsed.data.notes || null
    });
    return redirect(`/goals-projects?year=${year}&saved=goal_updated`, 303);
  }

  await addFamilyGoal({
    tenantId: session.tenantId,
    goalTitle: parsed.data.goal_title,
    domain: parsed.data.domain,
    targetDate: parsed.data.target_date || null,
    progressPct: parsed.data.progress_pct,
    status: parsed.data.status,
    notes: parsed.data.notes || null
  });

  return redirect(`/goals-projects?year=${year}&saved=goal_created`, 303);
};
