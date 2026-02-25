import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addAllergy } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  allergen: z.string().min(1),
  reaction: z.string().min(1),
  severity: z.coerce.number().min(1).max(5),
  has_epinephrine: z.coerce.number().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addAllergy({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    allergen: parsed.data.allergen,
    reaction: parsed.data.reaction,
    severity: parsed.data.severity,
    hasEpinephrine: parsed.data.has_epinephrine ? 1 : 0,
    notes: parsed.data.notes || null,
    active: 1
  });

  return redirect(`/health?year=${year}&saved=allergy`, 303);
};
