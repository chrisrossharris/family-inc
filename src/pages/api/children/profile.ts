import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { upsertChildProfile } from '@/lib/services/children';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  school_name: z.string().optional(),
  grade_level: z.string().optional(),
  learning_style: z.string().optional(),
  strengths: z.string().optional(),
  support_needs: z.string().optional(),
  long_term_focus: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await upsertChildProfile({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    schoolName: parsed.data.school_name || null,
    gradeLevel: parsed.data.grade_level || null,
    learningStyle: parsed.data.learning_style || null,
    strengths: parsed.data.strengths || null,
    supportNeeds: parsed.data.support_needs || null,
    longTermFocus: parsed.data.long_term_focus || null
  });

  return redirect(`/children?year=${year}&saved=profile`, 303);
};
