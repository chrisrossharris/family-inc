import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addChildGoal } from '@/lib/services/children';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  domain: z.string().min(1),
  goal_title: z.string().min(1),
  target_date: z.string().optional(),
  progress_pct: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(['active', 'on_hold', 'completed']).optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addChildGoal({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    domain: parsed.data.domain,
    goalTitle: parsed.data.goal_title,
    targetDate: parsed.data.target_date || null,
    progressPct: parsed.data.progress_pct,
    status: parsed.data.status,
    notes: parsed.data.notes || null
  });

  return redirect(`/children?year=${year}&saved=goal`, 303);
};
