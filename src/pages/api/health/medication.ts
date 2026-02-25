import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addMedication } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  medication_name: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  start_date: z.string().min(10),
  end_date: z.string().optional(),
  prescribed_by: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addMedication({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    medicationName: parsed.data.medication_name,
    dosage: parsed.data.dosage,
    frequency: parsed.data.frequency,
    startDate: parsed.data.start_date,
    endDate: parsed.data.end_date || null,
    prescribedBy: parsed.data.prescribed_by || null,
    notes: parsed.data.notes || null,
    active: 1
  });

  return redirect(`/health?year=${year}&saved=medication`, 303);
};
