import { getChildrenOverview } from '@/lib/services/children';
import { getHealthOverview } from '@/lib/services/health';
import { getIncomeOverview } from '@/lib/services/income';
import { getInvoicesOverview } from '@/lib/services/invoices';
import { getGoalsProjectsOverview, getHomeGroceriesOverview, getTripsOverview } from '@/lib/services/pillars';
import { getNeedsReviewTransactions } from '@/lib/services/reports';
import db from '@/lib/db/connection';

export interface AttentionItem {
  id: string;
  label: string;
  value: number;
  points: number;
  href: string;
  detail: string;
  suppressed?: boolean;
}

export const TODAY_ACTION_IDS = [
  'needs-review',
  'income-unallocated',
  'invoices-overdue',
  'health-high-severity',
  'health-appointments',
  'children-goals',
  'family-goals-overdue',
  'trips-unpacked',
  'grocery-needed'
] as const;

export type TodayActionId = (typeof TODAY_ACTION_IDS)[number];

type TodayWeights = Record<TodayActionId, number>;

const DEFAULT_WEIGHTS: TodayWeights = {
  'needs-review': 1,
  'income-unallocated': 1,
  'invoices-overdue': 1.2,
  'health-high-severity': 1.2,
  'health-appointments': 1,
  'children-goals': 1,
  'family-goals-overdue': 1,
  'trips-unpacked': 0.8,
  'grocery-needed': 0.7
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDaysIso(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now.toISOString().slice(0, 10);
}

export async function getTodayBrief(tenantId: string, year: string) {
  return getTodayBriefForUser(tenantId, '', year);
}

export async function getTodayWeights(tenantId: string, userId: string): Promise<TodayWeights> {
  const row = await db.get<{ weights_json: string }>('SELECT weights_json FROM today_preferences WHERE tenant_id = ? AND user_id = ?', [tenantId, userId]);
  if (!row?.weights_json) return { ...DEFAULT_WEIGHTS };
  try {
    const parsed = JSON.parse(row.weights_json) as Partial<TodayWeights>;
    return {
      ...DEFAULT_WEIGHTS,
      ...Object.fromEntries(
        TODAY_ACTION_IDS.map((id) => {
          const value = Number(parsed[id] ?? DEFAULT_WEIGHTS[id]);
          return [id, clamp(Number.isFinite(value) ? value : DEFAULT_WEIGHTS[id], 0.4, 2.5)];
        })
      )
    } as TodayWeights;
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

export async function upsertTodayWeights(tenantId: string, userId: string, weights: Partial<TodayWeights>) {
  const current = await getTodayWeights(tenantId, userId);
  const merged: TodayWeights = {
    ...current,
    ...Object.fromEntries(
      TODAY_ACTION_IDS.map((id) => {
        const raw = Number(weights[id] ?? current[id]);
        return [id, clamp(Number.isFinite(raw) ? raw : current[id], 0.4, 2.5)];
      })
    )
  } as TodayWeights;

  await db.run(
    `INSERT INTO today_preferences (tenant_id, user_id, weights_json, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id, user_id)
     DO UPDATE SET weights_json = excluded.weights_json, updated_at = CURRENT_TIMESTAMP`,
    [tenantId, userId, JSON.stringify(merged)]
  );
}

export async function setTodayActionState(input: {
  tenantId: string;
  userId: string;
  actionId: TodayActionId;
  status: 'done' | 'snoozed';
  doneOn?: string | null;
  snoozeUntil?: string | null;
}) {
  await db.run(
    `INSERT INTO today_action_states (tenant_id, user_id, action_id, status, done_on, snooze_until, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id, user_id, action_id)
     DO UPDATE SET status = excluded.status, done_on = excluded.done_on, snooze_until = excluded.snooze_until, updated_at = CURRENT_TIMESTAMP`,
    [input.tenantId, input.userId, input.actionId, input.status, input.doneOn ?? null, input.snoozeUntil ?? null]
  );
}

export async function clearTodayActionState(tenantId: string, userId: string, actionId: TodayActionId) {
  await db.run('DELETE FROM today_action_states WHERE tenant_id = ? AND user_id = ? AND action_id = ?', [tenantId, userId, actionId]);
}

export async function getTodayBriefForUser(tenantId: string, userId: string, year: string) {
  const [needsReview, income, invoices, health, children, goalsProjects, trips, groceries] = await Promise.all([
    getNeedsReviewTransactions(tenantId, year),
    getIncomeOverview(tenantId, year),
    getInvoicesOverview(tenantId, year),
    getHealthOverview(tenantId, year),
    getChildrenOverview(tenantId, year),
    getGoalsProjectsOverview(tenantId, year),
    getTripsOverview(tenantId, year),
    getHomeGroceriesOverview(tenantId, year)
  ]);

  const nowIso = todayIso();
  const nextWeekIso = inDaysIso(7);
  const weights = userId ? await getTodayWeights(tenantId, userId) : { ...DEFAULT_WEIGHTS };
  const actionStates = userId
    ? await db.all<{ action_id: string; status: 'done' | 'snoozed'; done_on: string | null; snooze_until: string | null }>(
        'SELECT action_id, status, done_on, snooze_until FROM today_action_states WHERE tenant_id = ? AND user_id = ?',
        [tenantId, userId]
      )
    : [];
  const actionById = new Map(actionStates.map((s) => [s.action_id, s]));

  const unallocatedIncomeReceipts = income.receipts.filter((row) => row.unallocatedAmount > 0).length;
  const upcomingAppointments7d = health.upcomingApptList.filter((row) => row.status === 'scheduled' && row.appointment_date <= nextWeekIso).length;
  const kidsOffTrackGoals = children.goals.filter((goal) => goal.status === 'active' && goal.progress_pct < 40).length;
  const overdueProjects = goalsProjects.projects.filter((project) => project.status !== 'completed' && project.due_date && project.due_date < nowIso).length;
  const overdueGoals = goalsProjects.goals.filter((goal) => goal.status !== 'completed' && goal.target_date && goal.target_date < nowIso).length;

  const attention: AttentionItem[] = [
    {
      id: 'needs-review',
      label: 'Transactions need review',
      value: needsReview.length,
      points: clamp(needsReview.length * weights['needs-review'], 0, 20),
      href: '/needs-review',
      detail: 'Uncategorized or low-confidence spend.'
    },
    {
      id: 'income-unallocated',
      label: 'Income receipts unallocated',
      value: unallocatedIncomeReceipts,
      points: clamp(unallocatedIncomeReceipts * 3 * weights['income-unallocated'], 0, 15),
      href: '/income',
      detail: 'Allocate entity splits so reporting stays accurate.'
    },
    {
      id: 'invoices-overdue',
      label: 'Overdue invoices',
      value: invoices.stats.overdueCount,
      points: clamp(invoices.stats.overdueCount * 5 * weights['invoices-overdue'], 0, 25),
      href: '/invoices',
      detail: 'Receivables past due date.'
    },
    {
      id: 'health-high-severity',
      label: 'High-severity symptom episodes',
      value: health.stats.highSeverityEpisodes,
      points: clamp(health.stats.highSeverityEpisodes * 2 * weights['health-high-severity'], 0, 10),
      href: '/health',
      detail: 'Recent episodes severity 4-5.'
    },
    {
      id: 'health-appointments',
      label: 'Appointments in next 7 days',
      value: upcomingAppointments7d,
      points: clamp(upcomingAppointments7d * 2 * weights['health-appointments'], 0, 10),
      href: '/health',
      detail: 'Scheduled care requiring prep.'
    },
    {
      id: 'children-goals',
      label: 'Children goals off track',
      value: kidsOffTrackGoals,
      points: clamp(kidsOffTrackGoals * 2 * weights['children-goals'], 0, 12),
      href: '/children',
      detail: 'Active goals below 40% progress.'
    },
    {
      id: 'family-goals-overdue',
      label: 'Family goals/projects overdue',
      value: overdueGoals + overdueProjects,
      points: clamp((overdueGoals + overdueProjects) * 3 * weights['family-goals-overdue'], 0, 18),
      href: '/goals-projects',
      detail: 'Deadlines passed on active goals/projects.'
    },
    {
      id: 'trips-unpacked',
      label: 'Trip items not packed',
      value: trips.stats.unpackedItems,
      points: clamp(trips.stats.unpackedItems * weights['trips-unpacked'], 0, 10),
      href: '/trips',
      detail: 'Open packing tasks.'
    },
    {
      id: 'grocery-needed',
      label: 'Grocery items needed now',
      value: groceries.stats.neededNow,
      points: clamp(Math.ceil(groceries.stats.neededNow / 4) * weights['grocery-needed'], 0, 8),
      href: '/home-groceries',
      detail: 'Household essentials to replenish.'
    }
  ];

  for (const item of attention) {
    const state = actionById.get(item.id);
    if (!state) continue;
    const doneToday = state.status === 'done' && state.done_on === nowIso;
    const snoozed = state.status === 'snoozed' && !!state.snooze_until && state.snooze_until >= nowIso;
    item.suppressed = doneToday || snoozed;
  }

  const score = clamp(attention.reduce((sum, item) => sum + item.points, 0), 0, 100);
  const riskBand = score >= 60 ? 'critical' : score >= 30 ? 'watch' : 'stable';
  const queue = attention.filter((item) => item.value > 0 && !item.suppressed).sort((a, b) => b.points - a.points);
  const mutedCount = attention.filter((item) => item.value > 0 && item.suppressed).length;

  return {
    score,
    riskBand,
    queue,
    attention,
    weights,
    mutedCount,
    snapshot: {
      needsReview: needsReview.length,
      unallocatedIncome: unallocatedIncomeReceipts,
      overdueInvoices: invoices.stats.overdueCount,
      appointments7d: upcomingAppointments7d,
      childrenOffTrack: kidsOffTrackGoals
    }
  };
}
