import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addSymptomLog } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  member_id: z.coerce.number().optional(),
  occurred_on: z.string().min(10),
  symptom: z.string().min(1),
  severity: z.coerce.number().min(1).max(5),
  duration_hours: z.coerce.number().optional(),
  trigger: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addSymptomLog({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    occurredOn: parsed.data.occurred_on,
    symptom: parsed.data.symptom,
    severity: parsed.data.severity,
    durationHours: parsed.data.duration_hours,
    trigger: parsed.data.trigger || null,
    notes: parsed.data.notes || null
  });

  return redirect(`/health?year=${year}&saved=symptom`, 303);
};
