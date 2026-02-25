import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addAppointment } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  appointment_date: z.string().min(10),
  provider: z.string().min(1),
  appointment_type: z.string().min(1),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
  follow_up_date: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addAppointment({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    appointmentDate: parsed.data.appointment_date,
    provider: parsed.data.provider,
    appointmentType: parsed.data.appointment_type,
    status: parsed.data.status,
    followUpDate: parsed.data.follow_up_date || null,
    notes: parsed.data.notes || null
  });

  return redirect(`/health?year=${year}&saved=appointment`, 303);
};
