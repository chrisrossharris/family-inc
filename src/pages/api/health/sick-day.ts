import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addSickDay } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  start_date: z.string().min(10),
  end_date: z.string().min(10),
  reason: z.string().min(1),
  fever: z.coerce.number().optional(),
  school_work_missed: z.coerce.number().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addSickDay({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    startDate: parsed.data.start_date,
    endDate: parsed.data.end_date,
    reason: parsed.data.reason,
    fever: parsed.data.fever ? 1 : 0,
    schoolWorkMissed: parsed.data.school_work_missed === 0 ? 0 : 1,
    notes: parsed.data.notes || null
  });

  return redirect(`/health?year=${year}&saved=sickday`, 303);
};
