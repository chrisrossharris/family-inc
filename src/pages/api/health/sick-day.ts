import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addSickDay, deleteSickDay, updateSickDay } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalInt, formOptionalNumber, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  id: formOptionalInt({ positive: true }),
  member_id: z.coerce.number().min(1),
  start_date: z.string().min(10),
  end_date: z.string().min(10),
  reason: formTrimmedString(),
  fever: formOptionalNumber(),
  school_work_missed: formOptionalNumber(),
  notes: z.string().optional(),
  year: z.string().optional()
});

const deleteSchema = z.object({
  id: formOptionalInt({ positive: true }),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const values = Object.fromEntries((await request.formData()).entries());
  const mode = typeof values.mode === 'string' ? values.mode : 'create';
  const parsed = schema.safeParse(values);
  const fallbackYear = normalizeReportYear(typeof values.year === 'string' ? values.year : undefined);
  if (mode === 'delete') {
    const parsedDelete = deleteSchema.safeParse(values);
    if (!parsedDelete.success || !parsedDelete.data.id) return redirect(`/health?year=${fallbackYear}&error=sickday_invalid`, 303);
    const session = resolveSession(locals, cookies);
    const year = normalizeReportYear(parsedDelete.data.year);
    await deleteSickDay({ tenantId: session.tenantId, id: parsedDelete.data.id });
    return redirect(`/health?year=${year}&saved=sickday_deleted`, 303);
  }

  if (!parsed.success) return redirect(`/health?year=${fallbackYear}&error=sickday_invalid`, 303);

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  try {
    const payload = {
      tenantId: session.tenantId,
      memberId: parsed.data.member_id,
      startDate: parsed.data.start_date,
      endDate: parsed.data.end_date,
      reason: parsed.data.reason,
      fever: (parsed.data.fever ? 1 : 0) as 0 | 1,
      schoolWorkMissed: (parsed.data.school_work_missed === 0 ? 0 : 1) as 0 | 1,
      notes: parsed.data.notes || null
    };

    if (parsed.data.id) {
      await updateSickDay({ ...payload, id: parsed.data.id });
      return redirect(`/health?year=${year}&saved=sickday_updated`, 303);
    }

    await addSickDay(payload);
  } catch {
    return redirect(`/health?year=${year}&error=sickday_failed`, 303);
  }

  return redirect(`/health?year=${year}&saved=sickday`, 303);
};
