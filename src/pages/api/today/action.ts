import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { TODAY_ACTION_IDS, clearTodayActionState, setTodayActionState, type TodayActionId } from '@/lib/services/today';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  year: z.string().optional(),
  action_id: z.string().min(1),
  op: z.enum(['done', 'snooze_1d', 'snooze_3d', 'clear'])
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  if (!TODAY_ACTION_IDS.includes(parsed.data.action_id as TodayActionId)) {
    return new Response(JSON.stringify({ error: 'Unknown action_id' }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  const actionId = parsed.data.action_id as TodayActionId;

  if (parsed.data.op === 'clear') {
    await clearTodayActionState(session.tenantId, session.userId, actionId);
  } else if (parsed.data.op === 'done') {
    await setTodayActionState({
      tenantId: session.tenantId,
      userId: session.userId,
      actionId,
      status: 'done',
      doneOn: todayIso()
    });
  } else {
    await setTodayActionState({
      tenantId: session.tenantId,
      userId: session.userId,
      actionId,
      status: 'snoozed',
      snoozeUntil: parsed.data.op === 'snooze_1d' ? plusDaysIso(1) : plusDaysIso(3)
    });
  }

  return redirect(`/today?year=${year}&saved=action`, 303);
};
