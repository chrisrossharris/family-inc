import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addAppointment, deleteAppointment, updateAppointment, updateAppointmentReviewStatus } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalInt } from '@/lib/validation/form';

const schema = z.object({
  id: formOptionalInt({ positive: true }),
  member_id: z.coerce.number().min(1),
  appointment_date: z.string().min(10),
  provider: z.string().min(1),
  appointment_type: z.string().min(1),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
  follow_up_date: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

const deleteSchema = z.object({
  id: formOptionalInt({ positive: true }),
  year: z.string().optional()
});

const reviewSchema = z.object({
  id: formOptionalInt({ positive: true }),
  review_status: z.enum(['confirmed', 'needs_review', 'ignored']),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const values = Object.fromEntries((await request.formData()).entries());
  const mode = typeof values.mode === 'string' ? values.mode : 'create';
  const fallbackYear = normalizeReportYear(typeof values.year === 'string' ? values.year : undefined);
  if (mode === 'delete') {
    const parsedDelete = deleteSchema.safeParse(values);
    if (!parsedDelete.success || !parsedDelete.data.id) return redirect(`/health?year=${fallbackYear}&error=appointment_invalid`, 303);

    const session = resolveSession(locals, cookies);
    const year = normalizeReportYear(parsedDelete.data.year);
    await deleteAppointment({ tenantId: session.tenantId, id: parsedDelete.data.id });
    return redirect(`/health?year=${year}&saved=appointment_deleted`, 303);
  }

  if (mode === 'review') {
    const parsedReview = reviewSchema.safeParse(values);
    if (!parsedReview.success || !parsedReview.data.id) return redirect(`/health?year=${fallbackYear}&error=appointment_invalid`, 303);

    const session = resolveSession(locals, cookies);
    const year = normalizeReportYear(parsedReview.data.year);
    try {
      await updateAppointmentReviewStatus({
        tenantId: session.tenantId,
        id: parsedReview.data.id,
        reviewStatus: parsedReview.data.review_status
      });
    } catch {
      return redirect(`/health?year=${year}&error=appointment_failed`, 303);
    }
    return redirect(`/health?year=${year}&saved=appointment_reviewed`, 303);
  }

  const parsed = schema.safeParse(values);

  if (!parsed.success) return redirect(`/health?year=${fallbackYear}&error=appointment_invalid`, 303);

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  try {
    const payload = {
      tenantId: session.tenantId,
      memberId: parsed.data.member_id,
      appointmentDate: parsed.data.appointment_date,
      provider: parsed.data.provider,
      appointmentType: parsed.data.appointment_type,
      status: parsed.data.status,
      followUpDate: parsed.data.follow_up_date || null,
      notes: parsed.data.notes || null
    };

    if (parsed.data.id) {
      await updateAppointment({ ...payload, id: parsed.data.id });
      return redirect(`/health?year=${year}&saved=appointment_updated`, 303);
    }

    await addAppointment(payload);
  } catch {
    return redirect(`/health?year=${year}&error=appointment_failed`, 303);
  }

  return redirect(`/health?year=${year}&saved=appointment`, 303);
};
