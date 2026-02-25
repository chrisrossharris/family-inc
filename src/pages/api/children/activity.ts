import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addChildActivity } from '@/lib/services/children';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  activity_name: z.string().min(1),
  category: z.string().min(1),
  schedule: z.string().optional(),
  mentor_or_coach: z.string().optional(),
  status: z.enum(['active', 'paused', 'completed']).optional(),
  monthly_cost: z.coerce.number().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addChildActivity({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    activityName: parsed.data.activity_name,
    category: parsed.data.category,
    schedule: parsed.data.schedule || null,
    mentorOrCoach: parsed.data.mentor_or_coach || null,
    status: parsed.data.status,
    monthlyCost: parsed.data.monthly_cost,
    notes: parsed.data.notes || null
  });

  return redirect(`/children?year=${year}&saved=activity`, 303);
};
