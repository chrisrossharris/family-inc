import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addAcademicRecord } from '@/lib/services/children';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  recorded_on: z.string().min(10),
  term: z.string().min(1),
  subject: z.string().min(1),
  score: z.string().optional(),
  teacher_note: z.string().optional(),
  support_plan: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addAcademicRecord({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    recordedOn: parsed.data.recorded_on,
    term: parsed.data.term,
    subject: parsed.data.subject,
    score: parsed.data.score || null,
    teacherNote: parsed.data.teacher_note || null,
    supportPlan: parsed.data.support_plan || null
  });

  return redirect(`/children?year=${year}&saved=academic`, 303);
};
