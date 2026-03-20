import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addFamilyMilestone, updateFamilyMilestone } from '@/lib/services/pillars';
import { formOptionalInt, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  id: formOptionalInt({ positive: true }),
  member_name: z.string().optional(),
  milestone_date: z.string().min(10),
  area: formTrimmedString(),
  title: formTrimmedString(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  if (parsed.data.id) {
    await updateFamilyMilestone({
      tenantId: session.tenantId,
      id: parsed.data.id,
      memberName: parsed.data.member_name || null,
      milestoneDate: parsed.data.milestone_date,
      area: parsed.data.area,
      title: parsed.data.title,
      notes: parsed.data.notes || null
    });
    return redirect(`/milestones?year=${year}&saved=milestone_updated`, 303);
  }

  await addFamilyMilestone({
    tenantId: session.tenantId,
    memberName: parsed.data.member_name || null,
    milestoneDate: parsed.data.milestone_date,
    area: parsed.data.area,
    title: parsed.data.title,
    notes: parsed.data.notes || null
  });

  return redirect(`/milestones?year=${year}&saved=milestone_created`, 303);
};
