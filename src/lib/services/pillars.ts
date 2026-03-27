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

export async function updateFamilyProject(input: {
  tenantId: string;
  id: number;
  title: string;
  ownerName?: string | null;
  status?: 'active' | 'on_hold' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `UPDATE family_projects
     SET title = ?, owner_name = ?, status = ?, priority = ?, due_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [input.title, input.ownerName ?? null, input.status ?? 'active', input.priority ?? 'medium', input.dueDate ?? null, input.notes ?? null, input.tenantId, input.id]
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

export async function updateFamilyGoal(input: {
  tenantId: string;
  id: number;
  goalTitle: string;
  domain: string;
  targetDate?: string | null;
  progressPct?: number;
  status?: 'active' | 'on_hold' | 'completed';
  notes?: string | null;
}) {
  await db.run(
    `UPDATE family_goals
     SET goal_title = ?, domain = ?, target_date = ?, progress_pct = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [input.goalTitle, input.domain, input.targetDate ?? null, input.progressPct ?? 0, input.status ?? 'active', input.notes ?? null, input.tenantId, input.id]
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

export async function updateTrip(input: {
  tenantId: string;
  tripId: number;
  tripName: string;
  startDate: string;
  endDate: string;
  destination?: string | null;
  budgetAmount?: number;
  status?: 'planned' | 'booked' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string | null;
}) {
  await db.run(
    `UPDATE family_trips
     SET trip_name = ?, start_date = ?, end_date = ?, destination = ?, budget_amount = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [
      input.tripName,
      input.startDate,
      input.endDate,
      input.destination ?? null,
      input.budgetAmount ?? 0,
      input.status ?? 'planned',
      input.notes ?? null,
      input.tenantId,
      input.tripId
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

export async function updateGroceryItem(input: {
  tenantId: string;
  id: number;
  itemName: string;
  category: string;
  quantity?: number;
  unit?: string | null;
  needed?: 0 | 1;
  lastPurchasedOn?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `UPDATE home_grocery_items
     SET item_name = ?, category = ?, quantity = ?, unit = ?, needed = ?, last_purchased_on = ?, notes = ?
     WHERE tenant_id = ? AND id = ?`,
    [
      input.itemName,
      input.category,
      input.quantity ?? 1,
      input.unit ?? null,
      input.needed ?? 1,
      input.lastPurchasedOn ?? null,
      input.notes ?? null,
      input.tenantId,
      input.id
    ]
  );
}

export async function setGroceryItemNeeded(input: {
  tenantId: string;
  itemId: number;
  needed: 0 | 1;
}) {
  const today = new Date().toISOString().slice(0, 10);
  await db.run(
    `UPDATE home_grocery_items
     SET needed = ?,
         last_purchased_on = CASE WHEN ? = 0 THEN ? ELSE last_purchased_on END
     WHERE tenant_id = ? AND id = ?`,
    [input.needed, input.needed, today, input.tenantId, input.itemId]
  );
}

export function inferGroceryCategory(name: string): string {
  const value = name.toLowerCase();
  if (/(milk|yogurt|cheese|butter|cream)/.test(value)) return 'Dairy';
  if (/(apple|banana|berry|lettuce|spinach|onion|pepper|tomato|produce)/.test(value)) return 'Produce';
  if (/(chicken|beef|turkey|fish|salmon|pork|meat)/.test(value)) return 'Protein';
  if (/(bread|rice|pasta|flour|cereal|oat)/.test(value)) return 'Pantry';
  if (/(soap|detergent|paper|toilet|trash|clean|bleach)/.test(value)) return 'Household';
  if (/(snack|chips|cracker|cookie|juice|soda)/.test(value)) return 'Snacks';
  if (/(medicine|vitamin|bandage|pain|cough)/.test(value)) return 'Health';
  return 'Other';
}

function parseReceiptLines(rawText: string) {
  const parsed: Array<{ itemName: string; quantity: number; lineTotal: number; unitPrice: number; category: string }> = [];
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.length < 3) continue;
    const noise = /(subtotal|total|tax|change|visa|mastercard|debit|credit|authorization|thank|balance)/i;
    if (noise.test(line)) continue;

    const match = line.match(/^(.+?)\s+\$?(-?\d+(?:\.\d{2}))$/);
    if (!match) continue;

    let itemName = match[1].replace(/\s{2,}/g, ' ').trim();
    const lineTotal = Number(match[2]);
    if (!Number.isFinite(lineTotal) || lineTotal <= 0) continue;

    let quantity = 1;
    const qtyPrefix = itemName.match(/^(\d+(?:\.\d+)?)\s*[xX]\s+/);
    const qtySuffix = itemName.match(/\s+[xX]\s*(\d+(?:\.\d+)?)$/);
    if (qtyPrefix) {
      quantity = Number(qtyPrefix[1]);
      itemName = itemName.replace(/^(\d+(?:\.\d+)?)\s*[xX]\s+/, '').trim();
    } else if (qtySuffix) {
      quantity = Number(qtySuffix[1]);
      itemName = itemName.replace(/\s+[xX]\s*(\d+(?:\.\d+)?)$/, '').trim();
    }

    if (!itemName || !Number.isFinite(quantity) || quantity <= 0) continue;
    const unitPrice = lineTotal / quantity;
    parsed.push({
      itemName,
      quantity,
      lineTotal,
      unitPrice,
      category: inferGroceryCategory(itemName)
    });
  }

  return parsed.slice(0, 80);
}

export async function addGroceryReceiptFromText(input: {
  tenantId: string;
  storeName?: string | null;
  purchasedOn: string;
  totalAmount?: number;
  rawText: string;
  notes?: string | null;
  sourceType?: 'manual' | 'ocr_text' | 'integration';
}) {
  const parsedItems = parseReceiptLines(input.rawText);
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO home_grocery_receipts
        (tenant_id, store_name, purchased_on, total_amount, source_type, raw_text, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        input.tenantId,
        input.storeName ?? null,
        input.purchasedOn,
        input.totalAmount ?? parsedItems.reduce((sum, item) => sum + item.lineTotal, 0),
        input.sourceType ?? 'ocr_text',
        input.rawText,
        input.notes ?? null
      ]
    );

    const receipt = await tx.get<{ id: number }>(
      `SELECT id
       FROM home_grocery_receipts
       WHERE tenant_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [input.tenantId]
    );
    if (!receipt) return;

    for (const item of parsedItems) {
      await tx.run(
        `INSERT INTO home_grocery_receipt_items
          (tenant_id, receipt_id, item_name, category, quantity, unit_price, line_total, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [input.tenantId, receipt.id, item.itemName, item.category, item.quantity, item.unitPrice, item.lineTotal]
      );

      const existing = await tx.get<{ id: number }>(
        `SELECT id
         FROM home_grocery_items
         WHERE tenant_id = ? AND lower(item_name) = lower(?)
         LIMIT 1`,
        [input.tenantId, item.itemName]
      );

      if (existing) {
        await tx.run(
          `UPDATE home_grocery_items
           SET quantity = quantity + ?, needed = 0, last_purchased_on = ?, category = ?, notes = COALESCE(notes, '')
           WHERE tenant_id = ? AND id = ?`,
          [item.quantity, input.purchasedOn, item.category, input.tenantId, existing.id]
        );
      } else {
        await tx.run(
          `INSERT INTO home_grocery_items (tenant_id, item_name, category, quantity, unit, needed, last_purchased_on, notes)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
          [input.tenantId, item.itemName, item.category, item.quantity, null, input.purchasedOn, `Imported from receipt`]
        );
      }
    }
  });

  return { parsedCount: parsedItems.length };
}

export async function updateGroceryReceipt(input: {
  tenantId: string;
  id: number;
  storeName?: string | null;
  purchasedOn: string;
  totalAmount?: number;
  sourceType?: 'manual' | 'ocr_text' | 'integration';
  notes?: string | null;
}) {
  await db.run(
    `UPDATE home_grocery_receipts
     SET store_name = ?, purchased_on = ?, total_amount = ?, source_type = ?, notes = ?
     WHERE tenant_id = ? AND id = ?`,
    [
      input.storeName ?? null,
      input.purchasedOn,
      input.totalAmount ?? 0,
      input.sourceType ?? 'manual',
      input.notes ?? null,
      input.tenantId,
      input.id
    ]
  );
}

export async function deleteGroceryReceipt(input: {
  tenantId: string;
  id: number;
  autoDeleteEmptyItems?: boolean;
}) {
  await db.transaction(async (tx) => {
    const receiptItems = await tx.all<{
      item_name: string;
      quantity: number;
    }>(
      `SELECT item_name, quantity
       FROM home_grocery_receipt_items
       WHERE tenant_id = ? AND receipt_id = ?
       ORDER BY id ASC`,
      [input.tenantId, input.id]
    );

    for (const item of receiptItems) {
      const pantryRow = await tx.get<{ id: number }>(
        `SELECT id
         FROM home_grocery_items
         WHERE tenant_id = ? AND lower(item_name) = lower(?)
         ORDER BY id DESC
         LIMIT 1`,
        [input.tenantId, item.item_name]
      );
      if (!pantryRow) continue;

      await tx.run(
        `UPDATE home_grocery_items
         SET quantity = CASE
           WHEN quantity - ? < 0 THEN 0
           ELSE quantity - ?
         END
         WHERE tenant_id = ? AND id = ?`,
        [item.quantity, item.quantity, input.tenantId, pantryRow.id]
      );

      if (input.autoDeleteEmptyItems) {
        await tx.run(
          `DELETE FROM home_grocery_items
           WHERE tenant_id = ? AND id = ? AND quantity <= 0`,
          [input.tenantId, pantryRow.id]
        );
      }
    }

    await tx.run(
      `DELETE FROM home_grocery_receipt_items
       WHERE tenant_id = ? AND receipt_id = ?`,
      [input.tenantId, input.id]
    );

    await tx.run(
      `DELETE FROM home_grocery_receipts
       WHERE tenant_id = ? AND id = ?`,
      [input.tenantId, input.id]
    );
  });
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

  const receipts = await db.all<{
    id: number;
    store_name: string | null;
    purchased_on: string;
    total_amount: number;
    source_type: string;
    notes: string | null;
    created_at: string;
  }>(
    `SELECT id, store_name, purchased_on, total_amount, source_type, notes, created_at
     FROM home_grocery_receipts
     WHERE tenant_id = ? AND ${sqlYearExpr('purchased_on')} = ?
     ORDER BY purchased_on DESC, id DESC
     LIMIT 50`,
    [tenantId, reportYear]
  );

  const receiptItems = await db.all<{
    id: number;
    receipt_id: number;
    purchased_on: string;
    store_name: string | null;
    item_name: string;
    category: string;
    quantity: number;
    line_total: number;
  }>(
    `SELECT i.id, i.receipt_id, r.purchased_on, r.store_name, i.item_name, i.category, i.quantity, i.line_total
     FROM home_grocery_receipt_items i
     INNER JOIN home_grocery_receipts r ON r.id = i.receipt_id
     WHERE i.tenant_id = ? AND ${sqlYearExpr('r.purchased_on')} = ?
     ORDER BY r.purchased_on DESC, i.id DESC
     LIMIT 200`,
    [tenantId, reportYear]
  );

  const categorySummary = await db.all<{
    category: string;
    items_count: number;
    needed_count: number;
  }>(
    `SELECT category,
            COUNT(*) AS items_count,
            SUM(CASE WHEN needed = 1 THEN 1 ELSE 0 END) AS needed_count
     FROM home_grocery_items
     WHERE tenant_id = ?
     GROUP BY category
     ORDER BY needed_count DESC, items_count DESC, category ASC`,
    [tenantId]
  );

  return {
    reportYear,
    items,
    receipts,
    receiptItems,
    categorySummary,
    stats: {
      totalItems: items.length,
      neededNow: items.filter((i) => i.needed === 1).length,
      stocked: items.filter((i) => i.needed === 0).length,
      purchasedThisYear: purchasedThisYear?.count ?? 0,
      receiptCount: receipts.length,
      receiptSpendYtd: receipts.reduce((sum, receipt) => sum + receipt.total_amount, 0)
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

export async function updateFamilyMilestone(input: {
  tenantId: string;
  id: number;
  memberName?: string | null;
  milestoneDate: string;
  area: string;
  title: string;
  notes?: string | null;
}) {
  await db.run(
    `UPDATE family_milestones
     SET member_name = ?, milestone_date = ?, area = ?, title = ?, notes = ?
     WHERE tenant_id = ? AND id = ?`,
    [input.memberName ?? null, input.milestoneDate, input.area, input.title, input.notes ?? null, input.tenantId, input.id]
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

export async function addHouseAsset(input: {
  tenantId: string;
  assetName: string;
  assetType: string;
  category: string;
  location?: string | null;
  installDate?: string | null;
  purchaseDate?: string | null;
  warrantyExpires?: string | null;
  expectedLifespanYears?: number | null;
  conditionStatus?: string;
  replacementPriority?: string;
  vendorName?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  replacementCost?: number | null;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO house_assets
      (tenant_id, asset_name, asset_type, category, location, install_date, purchase_date, warranty_expires, expected_lifespan_years, condition_status, replacement_priority, vendor_name, model_number, serial_number, replacement_cost, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      input.tenantId,
      input.assetName,
      input.assetType,
      input.category,
      input.location ?? null,
      input.installDate ?? null,
      input.purchaseDate ?? null,
      input.warrantyExpires ?? null,
      input.expectedLifespanYears ?? null,
      input.conditionStatus ?? 'good',
      input.replacementPriority ?? 'medium',
      input.vendorName ?? null,
      input.modelNumber ?? null,
      input.serialNumber ?? null,
      input.replacementCost ?? 0,
      input.notes ?? null
    ]
  );
}

export async function updateHouseAsset(input: {
  tenantId: string;
  id: number;
  assetName: string;
  assetType: string;
  category: string;
  location?: string | null;
  installDate?: string | null;
  purchaseDate?: string | null;
  warrantyExpires?: string | null;
  expectedLifespanYears?: number | null;
  conditionStatus?: string;
  replacementPriority?: string;
  vendorName?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  replacementCost?: number | null;
  notes?: string | null;
}) {
  await db.run(
    `UPDATE house_assets
     SET asset_name = ?, asset_type = ?, category = ?, location = ?, install_date = ?, purchase_date = ?, warranty_expires = ?, expected_lifespan_years = ?, condition_status = ?, replacement_priority = ?, vendor_name = ?, model_number = ?, serial_number = ?, replacement_cost = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [
      input.assetName,
      input.assetType,
      input.category,
      input.location ?? null,
      input.installDate ?? null,
      input.purchaseDate ?? null,
      input.warrantyExpires ?? null,
      input.expectedLifespanYears ?? null,
      input.conditionStatus ?? 'good',
      input.replacementPriority ?? 'medium',
      input.vendorName ?? null,
      input.modelNumber ?? null,
      input.serialNumber ?? null,
      input.replacementCost ?? 0,
      input.notes ?? null,
      input.tenantId,
      input.id
    ]
  );
}

export async function deleteHouseAsset(input: {
  tenantId: string;
  id: number;
}) {
  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE house_maintenance_tasks
       SET asset_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND asset_id = ?`,
      [input.tenantId, input.id]
    );

    await tx.run(
      `DELETE FROM house_assets
       WHERE tenant_id = ? AND id = ?`,
      [input.tenantId, input.id]
    );
  });
}

export async function addHouseTask(input: {
  tenantId: string;
  assetId?: number | null;
  title: string;
  taskType?: string;
  cadenceMonths?: number | null;
  lastCompletedOn?: string | null;
  nextDueOn?: string | null;
  status?: string;
  estimatedCost?: number | null;
  vendorName?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO house_maintenance_tasks
      (tenant_id, asset_id, title, task_type, cadence_months, last_completed_on, next_due_on, status, estimated_cost, vendor_name, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      input.tenantId,
      input.assetId ?? null,
      input.title,
      input.taskType ?? 'inspect',
      input.cadenceMonths ?? null,
      input.lastCompletedOn ?? null,
      input.nextDueOn ?? null,
      input.status ?? 'planned',
      input.estimatedCost ?? 0,
      input.vendorName ?? null,
      input.notes ?? null
    ]
  );
}

export async function updateHouseTask(input: {
  tenantId: string;
  id: number;
  assetId?: number | null;
  title: string;
  taskType?: string;
  cadenceMonths?: number | null;
  lastCompletedOn?: string | null;
  nextDueOn?: string | null;
  status?: string;
  estimatedCost?: number | null;
  vendorName?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `UPDATE house_maintenance_tasks
     SET asset_id = ?, title = ?, task_type = ?, cadence_months = ?, last_completed_on = ?, next_due_on = ?, status = ?, estimated_cost = ?, vendor_name = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [
      input.assetId ?? null,
      input.title,
      input.taskType ?? 'inspect',
      input.cadenceMonths ?? null,
      input.lastCompletedOn ?? null,
      input.nextDueOn ?? null,
      input.status ?? 'planned',
      input.estimatedCost ?? 0,
      input.vendorName ?? null,
      input.notes ?? null,
      input.tenantId,
      input.id
    ]
  );
}

export async function deleteHouseTask(input: {
  tenantId: string;
  id: number;
}) {
  await db.run(
    `DELETE FROM house_maintenance_tasks
     WHERE tenant_id = ? AND id = ?`,
    [input.tenantId, input.id]
  );
}

export async function getHouseOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const assets = await db.all<{
    id: number;
    asset_name: string;
    asset_type: string;
    category: string;
    location: string | null;
    install_date: string | null;
    purchase_date: string | null;
    warranty_expires: string | null;
    expected_lifespan_years: number | null;
    condition_status: string;
    replacement_priority: string;
    vendor_name: string | null;
    model_number: string | null;
    serial_number: string | null;
    replacement_cost: number;
    notes: string | null;
  }>(
    `SELECT id, asset_name, asset_type, category, location, install_date, purchase_date, warranty_expires, expected_lifespan_years, condition_status, replacement_priority, vendor_name, model_number, serial_number, replacement_cost, notes
     FROM house_assets
     WHERE tenant_id = ?
     ORDER BY CASE replacement_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
              CASE condition_status WHEN 'replace_soon' THEN 0 WHEN 'repair_now' THEN 1 WHEN 'watch' THEN 2 ELSE 3 END,
              asset_type ASC, category ASC, asset_name ASC`,
    [tenantId]
  );

  const tasks = await db.all<{
    id: number;
    asset_id: number | null;
    asset_name: string | null;
    title: string;
    task_type: string;
    cadence_months: number | null;
    last_completed_on: string | null;
    next_due_on: string;
    status: string;
    estimated_cost: number;
    vendor_name: string | null;
    notes: string | null;
  }>(
    `SELECT t.id, t.asset_id, a.asset_name, t.title, t.task_type, t.cadence_months, t.last_completed_on, t.next_due_on, t.status, t.estimated_cost, t.vendor_name, t.notes
     FROM house_maintenance_tasks t
     LEFT JOIN house_assets a ON a.id = t.asset_id
     WHERE t.tenant_id = ?
     ORDER BY CASE t.status WHEN 'planned' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
              t.next_due_on ASC, t.id DESC`,
    [tenantId]
  );

  const dueThisYear = tasks.filter((task) => task.next_due_on?.slice(0, 4) === reportYear).length;
  const warrantiesExpiring = assets.filter((asset) => asset.warranty_expires?.slice(0, 4) === reportYear).length;
  const replacementExposure = assets
    .filter((asset) => asset.replacement_priority === 'high' || asset.condition_status === 'replace_soon')
    .reduce((sum, asset) => sum + (asset.replacement_cost ?? 0), 0);
  const monthKeys = Array.from({ length: 12 }, (_, index) => `${reportYear}-${String(index + 1).padStart(2, '0')}`);
  const monthlyDue = monthKeys.map((month) => ({
    month,
    count: tasks.filter((task) => task.next_due_on?.slice(0, 7) === month).length
  }));

  return {
    reportYear,
    assets,
    tasks,
    monthlyDue,
    stats: {
      totalAssets: assets.length,
      systemsTracked: assets.filter((asset) => asset.asset_type === 'system').length,
      appliancesTracked: assets.filter((asset) => asset.asset_type === 'appliance').length,
      highPriorityAssets: assets.filter((asset) => asset.replacement_priority === 'high').length,
      replaceSoonAssets: assets.filter((asset) => asset.condition_status === 'replace_soon').length,
      dueThisYear,
      warrantiesExpiring,
      replacementExposure
    }
  };
}
