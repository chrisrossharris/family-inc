import db from '@/lib/db/connection';
import { ENTITY_LABELS } from '@/lib/constants';
import type { Entity, ScheduleCCategory, Transaction } from '@/lib/types';

export async function getKpisByEntity() {
  const entities = Object.keys(ENTITY_LABELS) as Entity[];

  return Promise.all(
    entities.map(async (entity) => {
      const totals =
        (await db.get<{ spend: number; refunds: number; needs_review: number }>(
          `SELECT
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS spend,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS refunds,
            COALESCE(COUNT(CASE WHEN category = 'Other Business Expense (Needs Review)' THEN 1 END), 0) AS needs_review
           FROM transactions
           WHERE entity = ?`,
          [entity]
        )) ?? { spend: 0, refunds: 0, needs_review: 0 };

      const topCategory = await db.get<{ category: ScheduleCCategory; total: number }>(
        `SELECT category, SUM(amount) AS total
         FROM transactions
         WHERE entity = ? AND amount > 0
         GROUP BY category
         ORDER BY total DESC
         LIMIT 1`,
        [entity]
      );

      const topVendor = await db.get<{ vendor: string; total: number }>(
        `SELECT vendor, SUM(amount) AS total
         FROM transactions
         WHERE entity = ? AND amount > 0
         GROUP BY vendor
         ORDER BY total DESC
         LIMIT 1`,
        [entity]
      );

      const monthly = await db.all<{ month: string; total: number }>(
        `SELECT strftime('%Y-%m', date) AS month, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total
         FROM transactions
         WHERE entity = ?
         GROUP BY month
         ORDER BY month ASC`,
        [entity]
      );

      const avgMonthlyBurn = monthly.length > 0 ? monthly.reduce((acc, row) => acc + row.total, 0) / monthly.length : 0;

      return {
        entity,
        label: ENTITY_LABELS[entity],
        totalSpend: totals.spend,
        refunds: totals.refunds,
        avgMonthlyBurn,
        topCategory: topCategory?.category ?? 'Other Business Expense (Needs Review)',
        topVendor: topVendor?.vendor ?? 'n/a',
        needsReviewCount: totals.needs_review
      };
    })
  );
}

export async function getMonthlyStacked() {
  const rows = await db.all<{ month: string; entity: Entity; total: number }>(
    `SELECT strftime('%Y-%m', date) AS month, entity, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total
     FROM transactions
     GROUP BY month, entity
     ORDER BY month ASC`
  );

  const byMonth = new Map<string, Record<Entity, number>>();

  for (const row of rows) {
    if (!byMonth.has(row.month)) {
      byMonth.set(row.month, { chris: 0, kate: 0, big_picture: 0 });
    }
    byMonth.get(row.month)![row.entity] = row.total;
  }

  return Array.from(byMonth.entries()).map(([month, totals]) => ({ month, ...totals }));
}

export async function getCategoryDistribution(entity?: Entity) {
  const sql = entity
    ? `SELECT category, SUM(amount) AS total FROM transactions WHERE entity = ? AND amount > 0 GROUP BY category ORDER BY total DESC`
    : `SELECT category, SUM(amount) AS total FROM transactions WHERE amount > 0 GROUP BY category ORDER BY total DESC`;

  return entity ? db.all<{ category: string; total: number }>(sql, [entity]) : db.all<{ category: string; total: number }>(sql);
}

export async function getTopVendors(entity?: Entity, limit = 10) {
  const sql = entity
    ? `SELECT vendor, SUM(amount) AS total FROM transactions WHERE entity = ? AND amount > 0 GROUP BY vendor ORDER BY total DESC LIMIT ?`
    : `SELECT vendor, SUM(amount) AS total FROM transactions WHERE amount > 0 GROUP BY vendor ORDER BY total DESC LIMIT ?`;

  return entity ? db.all<{ vendor: string; total: number }>(sql, [entity, limit]) : db.all<{ vendor: string; total: number }>(sql, [limit]);
}

export async function getEntityLedger(entity: Entity, filters?: { category?: string; vendor?: string; confidence?: string }) {
  const clauses = ['entity = ?'];
  const params: Array<string | number> = [entity];

  if (filters?.category) {
    clauses.push('category = ?');
    params.push(filters.category);
  }

  if (filters?.vendor) {
    clauses.push('vendor = ?');
    params.push(filters.vendor);
  }

  if (filters?.confidence) {
    clauses.push('confidence = ?');
    params.push(filters.confidence);
  }

  const sql = `SELECT * FROM transactions WHERE ${clauses.join(' AND ')} ORDER BY date DESC, id DESC LIMIT 500`;
  return db.all<Transaction>(sql, params);
}

export async function getNeedsReviewTransactions() {
  return db.all<Transaction>(
    `SELECT *
     FROM transactions
     WHERE category = 'Other Business Expense (Needs Review)' OR confidence = 'low'
     ORDER BY date DESC, id DESC`
  );
}

export async function getImportAuditMeta() {
  const row = await db.get<{ filename: string; imported_at: string; row_count: number }>(
    'SELECT filename, imported_at, row_count FROM imports ORDER BY imported_at DESC LIMIT 1'
  );

  const refundTotals =
    (await db.get<{ total: number }>('SELECT COALESCE(SUM(ABS(amount)), 0) AS total FROM transactions WHERE amount < 0')) ?? { total: 0 };

  return {
    latestImport: row,
    refundTotals: refundTotals.total
  };
}

export async function getSystemCounts() {
  const imports = (await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM imports'))?.count ?? 0;
  const transactions = (await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM transactions'))?.count ?? 0;
  return { imports, transactions };
}
