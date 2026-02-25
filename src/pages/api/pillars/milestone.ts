import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addFamilyMilestone } from '@/lib/services/pillars';

const schema = z.object({
  member_name: z.string().optional(),
  milestone_date: z.string().min(10),
  area: z.string().min(1),
  title: z.string().min(1),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addFamilyMilestone({
    tenantId: session.tenantId,
    memberName: parsed.data.member_name || null,
    milestoneDate: parsed.data.milestone_date,
    area: parsed.data.area,
    title: parsed.data.title,
    notes: parsed.data.notes || null
  });

  return redirect(`/milestones?year=${year}&saved=milestone`, 303);
};
