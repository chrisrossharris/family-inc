import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addChildCheckin } from '@/lib/services/children';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  checkin_date: z.string().min(10),
  mood: z.coerce.number().min(1).max(5),
  sleep_hours: z.coerce.number().optional(),
  reading_minutes: z.coerce.number().optional(),
  movement_minutes: z.coerce.number().optional(),
  screen_time_minutes: z.coerce.number().optional(),
  social_connection: z.coerce.number().min(1).max(5).optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addChildCheckin({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    checkinDate: parsed.data.checkin_date,
    mood: parsed.data.mood,
    sleepHours: parsed.data.sleep_hours,
    readingMinutes: parsed.data.reading_minutes,
    movementMinutes: parsed.data.movement_minutes,
    screenTimeMinutes: parsed.data.screen_time_minutes,
    socialConnection: parsed.data.social_connection,
    notes: parsed.data.notes || null
  });

  return redirect(`/children?year=${year}&saved=checkin`, 303);
};
