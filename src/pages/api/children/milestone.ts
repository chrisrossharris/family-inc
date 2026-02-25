import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addChildMilestone } from '@/lib/services/children';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  milestone_date: z.string().min(10),
  domain: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addChildMilestone({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    milestoneDate: parsed.data.milestone_date,
    domain: parsed.data.domain,
    title: parsed.data.title,
    description: parsed.data.description || null
  });

  return redirect(`/children?year=${year}&saved=milestone`, 303);
};
