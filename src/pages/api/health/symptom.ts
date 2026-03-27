import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addSymptomLog } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalNumber, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  member_id: formOptionalNumber(),
  occurred_on: z.string().min(10),
  symptom: formTrimmedString(),
  severity: z.coerce.number().min(1).max(5),
  duration_hours: formOptionalNumber(),
  trigger: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const values = Object.fromEntries((await request.formData()).entries());
  const parsed = schema.safeParse(values);
  const fallbackYear = normalizeReportYear(typeof values.year === 'string' ? values.year : undefined);
  if (!parsed.success) return redirect(`/health?year=${fallbackYear}&error=symptom_invalid`, 303);

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  try {
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
  } catch {
    return redirect(`/health?year=${year}&error=symptom_failed`, 303);
  }

  return redirect(`/health?year=${year}&saved=symptom`, 303);
};
