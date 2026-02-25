import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { DEFAULT_REPORT_YEAR, normalizeReportYear } from '@/lib/utils/year';

function yearParam(year?: string): string {
  return normalizeReportYear(year ?? DEFAULT_REPORT_YEAR);
}

export async function addFamilyProject(input: {
  tenantId: string;
  title: string;
  ownerName?: string | null;
  status?: 'active' | 'on_hold' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO family_projects (tenant_id, title, owner_name, status, priority, due_date, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [input.tenantId, input.title, input.ownerName ?? null, input.status ?? 'active', input.priority ?? 'medium', input.dueDate ?? null, input.notes ?? null]
  );
}

export async function addFamilyGoal(input: {
  tenantId: string;
  goalTitle: string;
  domain: string;
  targetDate?: string | null;
  progressPct?: number;
  status?: 'active' | 'on_hold' | 'completed';
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO family_goals (tenant_id, goal_title, domain, target_date, progress_pct, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [input.tenantId, input.goalTitle, input.domain, input.targetDate ?? null, input.progressPct ?? 0, input.status ?? 'active', input.notes ?? null]
  );
}

export async function getGoalsProjectsOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const projects = await db.all<{
    id: number;
    title: string;
    owner_name: string | null;
    status: string;
    priority: string;
    due_date: string | null;
    notes: string | null;
  }>(
    `SELECT id, title, owner_name, status, priority, due_date, notes
     FROM family_projects
     WHERE tenant_id = ?
     ORDER BY status ASC, due_date ASC, id DESC`,
    [tenantId]
  );

  const goals = await db.all<{
    id: number;
    goal_title: string;
    domain: string;
    target_date: string | null;
    progress_pct: number;
    status: string;
    notes: string | null;
  }>(
    `SELECT id, goal_title, domain, target_date, progress_pct, status, notes
     FROM family_goals
     WHERE tenant_id = ?
     ORDER BY status ASC, target_date ASC, id DESC`,
    [tenantId]
  );

  const goalsDueThisYear = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM family_goals
     WHERE tenant_id = ? AND ${sqlYearExpr('target_date')} = ?`,
    [tenantId, reportYear]
  );

  return {
    reportYear,
    projects,
    goals,
    stats: {
      projects: projects.length,
      activeProjects: projects.filter((p) => p.status === 'active').length,
      goals: goals.length,
      goalsDueThisYear: goalsDueThisYear?.count ?? 0,
      onTrackGoals: goals.filter((g) => g.status === 'active' && g.progress_pct >= 60).length
    }
  };
}

export async function addTrip(input: {
  tenantId: string;
  tripName: string;
  startDate: string;
  endDate: string;
  destination?: string | null;
  budgetAmount?: number;
  status?: 'planned' | 'booked' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO family_trips (tenant_id, trip_name, start_date, end_date, destination, budget_amount, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      input.tenantId,
      input.tripName,
      input.startDate,
      input.endDate,
      input.destination ?? null,
      input.budgetAmount ?? 0,
      input.status ?? 'planned',
      input.notes ?? null
    ]
  );
}

export async function addTripItem(input: {
  tenantId: string;
  tripId: number;
  itemName: string;
  category?: string | null;
  qty?: number;
  packed?: 0 | 1;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO family_trip_items (tenant_id, trip_id, item_name, category, qty, packed, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.tenantId, input.tripId, input.itemName, input.category ?? null, input.qty ?? 1, input.packed ?? 0, input.notes ?? null]
  );
}

export async function getTripsOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const trips = await db.all<{
    id: number;
    trip_name: string;
    start_date: string;
    end_date: string;
    destination: string | null;
    budget_amount: number;
    status: string;
    notes: string | null;
  }>(
    `SELECT id, trip_name, start_date, end_date, destination, budget_amount, status, notes
     FROM family_trips
     WHERE tenant_id = ?
     ORDER BY start_date DESC, id DESC`,
    [tenantId]
  );

  const items = await db.all<{
    trip_name: string;
    item_name: string;
    category: string | null;
    qty: number;
    packed: number;
  }>(
    `SELECT t.trip_name, i.item_name, i.category, i.qty, i.packed
     FROM family_trip_items i
     INNER JOIN family_trips t ON t.id = i.trip_id
     WHERE i.tenant_id = ?
     ORDER BY i.packed ASC, t.start_date DESC, i.id DESC`,
    [tenantId]
  );

  const tripsThisYear = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM family_trips WHERE tenant_id = ? AND ${sqlYearExpr('start_date')} = ?`,
    [tenantId, reportYear]
  );

  return {
    reportYear,
    trips,
    items,
    stats: {
      totalTrips: trips.length,
      tripsThisYear: tripsThisYear?.count ?? 0,
      plannedTrips: trips.filter((t) => t.status === 'planned' || t.status === 'booked').length,
      packedItems: items.filter((i) => i.packed === 1).length,
      unpackedItems: items.filter((i) => i.packed === 0).length
    }
  };
}

export async function addGroceryItem(input: {
  tenantId: string;
  itemName: string;
  category: string;
  quantity?: number;
  unit?: string | null;
  needed?: 0 | 1;
  lastPurchasedOn?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO home_grocery_items (tenant_id, item_name, category, quantity, unit, needed, last_purchased_on, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.itemName,
      input.category,
      input.quantity ?? 1,
      input.unit ?? null,
      input.needed ?? 1,
      input.lastPurchasedOn ?? null,
      input.notes ?? null
    ]
  );
}

export async function getHomeGroceriesOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const items = await db.all<{
    id: number;
    item_name: string;
    category: string;
    quantity: number;
    unit: string | null;
    needed: number;
    last_purchased_on: string | null;
    notes: string | null;
  }>(
    `SELECT id, item_name, category, quantity, unit, needed, last_purchased_on, notes
     FROM home_grocery_items
     WHERE tenant_id = ?
     ORDER BY needed DESC, category ASC, item_name ASC`,
    [tenantId]
  );

  const purchasedThisYear = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM home_grocery_items
     WHERE tenant_id = ? AND last_purchased_on IS NOT NULL AND ${sqlYearExpr('last_purchased_on')} = ?`,
    [tenantId, reportYear]
  );

  return {
    reportYear,
    items,
    stats: {
      totalItems: items.length,
      neededNow: items.filter((i) => i.needed === 1).length,
      stocked: items.filter((i) => i.needed === 0).length,
      purchasedThisYear: purchasedThisYear?.count ?? 0
    }
  };
}

export async function addFamilyMilestone(input: {
  tenantId: string;
  memberName?: string | null;
  milestoneDate: string;
  area: string;
  title: string;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO family_milestones (tenant_id, member_name, milestone_date, area, title, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.tenantId, input.memberName ?? null, input.milestoneDate, input.area, input.title, input.notes ?? null]
  );
}

export async function getMilestonesOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const milestones = await db.all<{
    id: number;
    member_name: string | null;
    milestone_date: string;
    area: string;
    title: string;
    notes: string | null;
  }>(
    `SELECT id, member_name, milestone_date, area, title, notes
     FROM family_milestones
     WHERE tenant_id = ?
     ORDER BY milestone_date DESC, id DESC`,
    [tenantId]
  );

  const milestonesThisYear = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM family_milestones
     WHERE tenant_id = ? AND ${sqlYearExpr('milestone_date')} = ?`,
    [tenantId, reportYear]
  );

  return {
    reportYear,
    milestones,
    stats: {
      totalMilestones: milestones.length,
      milestonesThisYear: milestonesThisYear?.count ?? 0,
      familyMilestones: milestones.filter((m) => !m.member_name).length,
      memberMilestones: milestones.filter((m) => !!m.member_name).length
    }
  };
}
