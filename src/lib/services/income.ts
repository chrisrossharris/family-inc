import { ENTITY_LABELS, INCOME_SOURCE_LABELS } from '@/lib/constants';
import db from '@/lib/db/connection';
import { insertIgnore, sqlYearExpr } from '@/lib/db/sql-dialect';
import type { Entity, IncomeSourceType } from '@/lib/types';
import { DEFAULT_REPORT_YEAR, normalizeReportYear } from '@/lib/utils/year';

function yearParam(year?: string): string {
  return normalizeReportYear(year ?? DEFAULT_REPORT_YEAR);
}

function normalizeIncomeSourceType(value: string): IncomeSourceType {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'client_payment') return 'client_payment';
  if (normalized === 'gift') return 'gift';
  if (normalized === 'unemployment') return 'unemployment';
  if (normalized === 'food_stamps') return 'food_stamps';
  if (normalized === 'interest') return 'interest';
  return 'other';
}

type IncomeSplitInput = {
  entity: Entity;
  percent: number;
};

function toCents(value: number): number {
  return Math.round(value * 100);
}

export function buildIncomeSplitRows(grossAmount: number, splits: IncomeSplitInput[]) {
  const grossCents = toCents(grossAmount);
  const normalized = splits
    .map((split) => ({ ...split, percent: Number(split.percent.toFixed(4)) }))
    .filter((split) => split.percent > 0);

  const allocated = normalized.map((split) => ({
    entity: split.entity,
    splitPercent: split.percent,
    splitAmountCents: Math.round((grossCents * split.percent) / 100)
  }));

  const delta = grossCents - allocated.reduce((sum, row) => sum + row.splitAmountCents, 0);
  if (allocated.length > 0 && delta !== 0) {
    allocated[allocated.length - 1]!.splitAmountCents += delta;
  }

  return allocated.map((row) => ({
    entity: row.entity,
    splitPercent: row.splitPercent,
    splitAmount: row.splitAmountCents / 100
  }));
}

export async function addIncomeReceipt(input: {
  tenantId: string;
  receivedDate: string;
  sourceType: IncomeSourceType;
  payerName: string;
  projectName?: string | null;
  grossAmount: number;
  notes?: string | null;
  importHash?: string | null;
  splits: IncomeSplitInput[];
}): Promise<{ inserted: boolean; id: number | null }> {
  const splitRows = buildIncomeSplitRows(input.grossAmount, input.splits);
  let insertedAny = false;
  let insertedId: number | null = null;

  await db.transaction(async (tx) => {
    const inserted = await tx.get<{ id: number }>(
      insertIgnore(
        `INSERT OR IGNORE INTO income_receipts (tenant_id, received_date, source_type, payer_name, project_name, gross_amount, notes, import_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        `INSERT INTO income_receipts (tenant_id, received_date, source_type, payer_name, project_name, gross_amount, notes, import_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (tenant_id, import_hash) DO NOTHING
         RETURNING id`
      ),
      [
        input.tenantId,
        input.receivedDate,
        input.sourceType,
        input.payerName,
        input.projectName ?? null,
        input.grossAmount,
        input.notes ?? null,
        input.importHash ?? null
      ]
    );

    if (!inserted?.id) return;
    insertedAny = true;
    insertedId = inserted.id;

    for (const split of splitRows) {
      await tx.run(
        `INSERT INTO income_splits (tenant_id, income_receipt_id, entity, split_percent, split_amount, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [input.tenantId, inserted.id, split.entity, split.splitPercent, split.splitAmount]
      );
    }
  });
  return { inserted: insertedAny, id: insertedId };
}

export async function updateIncomeReceipt(input: {
  tenantId: string;
  id: number;
  receivedDate: string;
  sourceType: IncomeSourceType;
  payerName: string;
  projectName?: string | null;
  grossAmount: number;
  notes?: string | null;
  splits: IncomeSplitInput[];
}) {
  const splitRows = buildIncomeSplitRows(input.grossAmount, input.splits);

  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE income_receipts
       SET received_date = ?, source_type = ?, payer_name = ?, project_name = ?, gross_amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
      [
        input.receivedDate,
        input.sourceType,
        input.payerName,
        input.projectName ?? null,
        input.grossAmount,
        input.notes ?? null,
        input.tenantId,
        input.id
      ]
    );

    await tx.run('DELETE FROM income_splits WHERE tenant_id = ? AND income_receipt_id = ?', [input.tenantId, input.id]);
    for (const split of splitRows) {
      await tx.run(
        `INSERT INTO income_splits (tenant_id, income_receipt_id, entity, split_percent, split_amount, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [input.tenantId, input.id, split.entity, split.splitPercent, split.splitAmount]
      );
    }
  });
}

export async function getIncomeOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('r.received_date');
  const receipts = await db.all<{
    id: number;
    received_date: string;
    source_type: IncomeSourceType;
    payer_name: string;
    project_name: string | null;
    gross_amount: number;
    notes: string | null;
    allocated_amount: number;
  }>(
    `SELECT
       r.id,
       r.received_date,
       r.source_type,
       r.payer_name,
       r.project_name,
       r.gross_amount,
       r.notes,
       COALESCE(SUM(s.split_amount), 0) AS allocated_amount
     FROM income_receipts r
     LEFT JOIN income_splits s ON s.income_receipt_id = r.id
     WHERE r.tenant_id = ? AND ${yearExpr} = ?
     GROUP BY r.id, r.received_date, r.source_type, r.payer_name, r.project_name, r.gross_amount, r.notes
     ORDER BY r.received_date DESC, r.id DESC`,
    [tenantId, reportYear]
  );

  const splits = await db.all<{
    income_receipt_id: number;
    entity: Entity;
    split_percent: number;
    split_amount: number;
  }>(
    `SELECT s.income_receipt_id, s.entity, s.split_percent, s.split_amount
     FROM income_splits s
     INNER JOIN income_receipts r ON r.id = s.income_receipt_id
     WHERE s.tenant_id = ? AND ${yearExpr} = ?
     ORDER BY s.income_receipt_id DESC, s.id ASC`,
    [tenantId, reportYear]
  );

  const sourceTotals = await db.all<{ source_type: IncomeSourceType; total: number; count: number }>(
    `SELECT r.source_type, COALESCE(SUM(r.gross_amount), 0) AS total, COUNT(*) AS count
     FROM income_receipts r
     WHERE r.tenant_id = ? AND ${yearExpr} = ?
     GROUP BY r.source_type
     ORDER BY total DESC`,
    [tenantId, reportYear]
  );

  const clientProjectPaidRaw = await db.all<{ source_type: string; client: string; project: string | null; total: number }>(
    `SELECT r.source_type, r.payer_name AS client, r.project_name AS project, COALESCE(SUM(r.gross_amount), 0) AS total
     FROM income_receipts r
     WHERE r.tenant_id = ? AND ${yearExpr} = ?
     GROUP BY r.source_type, r.payer_name, r.project_name
     ORDER BY total DESC, client ASC`,
    [tenantId, reportYear]
  );
  const clientProjectPaid = clientProjectPaidRaw
    .filter((row) => normalizeIncomeSourceType(row.source_type) === 'client_payment')
    .map((row) => ({ client: row.client, project: row.project, total: row.total }))
    .slice(0, 30);

  const entityTotals: Record<Entity, number> = { chris: 0, kate: 0, big_picture: 0 };
  for (const row of splits) {
    entityTotals[row.entity] += row.split_amount;
  }

  const topClientRows = await db.all<{ source_type: string; client: string; total: number }>(
    `SELECT r.source_type, r.payer_name AS client, COALESCE(SUM(r.gross_amount), 0) AS total
     FROM income_receipts r
     WHERE r.tenant_id = ? AND ${yearExpr} = ?
     GROUP BY r.source_type, r.payer_name
     ORDER BY total DESC`,
    [tenantId, reportYear]
  );
  const topClient = topClientRows.find((row) => normalizeIncomeSourceType(row.source_type) === 'client_payment') ?? null;

  const splitsByReceipt = new Map<number, typeof splits>();
  for (const split of splits) {
    if (!splitsByReceipt.has(split.income_receipt_id)) {
      splitsByReceipt.set(split.income_receipt_id, []);
    }
    splitsByReceipt.get(split.income_receipt_id)!.push(split);
  }

  const enrichedReceipts = receipts.map((receipt) => {
    const receiptSplits = splitsByReceipt.get(receipt.id) ?? [];
    const splitByEntity: Record<Entity, number> = { chris: 0, kate: 0, big_picture: 0 };
    for (const split of receiptSplits) {
      splitByEntity[split.entity] += split.split_percent;
    }
    const unallocatedAmount = Math.max(0, receipt.gross_amount - receipt.allocated_amount);
    return {
      ...receipt,
      split_chris: splitByEntity.chris,
      split_kate: splitByEntity.kate,
      split_big_picture: splitByEntity.big_picture,
      split_total_pct: splitByEntity.chris + splitByEntity.kate + splitByEntity.big_picture,
      sourceLabel: INCOME_SOURCE_LABELS[normalizeIncomeSourceType(receipt.source_type)],
      splitSummary:
        receiptSplits.length === 0
          ? 'Unallocated'
          : receiptSplits
              .map((split) => `${ENTITY_LABELS[split.entity]} ${split.split_percent.toFixed(1)}% ($${split.split_amount.toFixed(2)})`)
              .join(' · '),
      unallocatedAmount
    };
  });

  const totalIncome = receipts.reduce((sum, row) => sum + row.gross_amount, 0);
  const allocatedIncome = receipts.reduce((sum, row) => sum + row.allocated_amount, 0);
  const otherSourceIncome = sourceTotals.filter((s) => s.source_type !== 'client_payment').reduce((sum, s) => sum + s.total, 0);
  const allocationRate = totalIncome > 0 ? allocatedIncome / totalIncome : 0;
  const topClientShare = topClient && totalIncome > 0 ? topClient.total / totalIncome : 0;

  return {
    reportYear,
    receipts: enrichedReceipts,
    sourceTotals: sourceTotals.map((row) => ({ ...row, label: INCOME_SOURCE_LABELS[normalizeIncomeSourceType(row.source_type)] })),
    clientProjectPaid,
    stats: {
      totalIncome,
      allocatedIncome,
      unallocatedIncome: Math.max(0, totalIncome - allocatedIncome),
      allocationRate,
      otherSourceIncome,
      chrisIncome: entityTotals.chris,
      kateIncome: entityTotals.kate,
      bigPictureIncome: entityTotals.big_picture,
      receiptsCount: receipts.length,
      topClientName: topClient?.client ?? null,
      topClientTotal: topClient?.total ?? 0,
      topClientShare
    }
  };
}
