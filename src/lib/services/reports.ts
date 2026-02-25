import db from '@/lib/db/connection';
import { sqlMonthExpr, sqlYearExpr } from '@/lib/db/sql-dialect';
import { ENTITY_LABELS } from '@/lib/constants';
import { DEFAULT_REPORT_YEAR, normalizeReportYear } from '@/lib/utils/year';
import type { Entity, ScheduleCCategory, Transaction } from '@/lib/types';

function yearParam(year?: string): string {
  return normalizeReportYear(year ?? DEFAULT_REPORT_YEAR);
}

export async function getAvailableYears(tenantId: string) {
  const yearExpr = sqlYearExpr('date');
  const rows = await db.all<{ year: string }>(
    `SELECT DISTINCT ${yearExpr} AS year
     FROM transactions
     WHERE tenant_id = ? AND date IS NOT NULL
     ORDER BY year DESC`,
    [tenantId]
  );

  const years = rows.map((row) => row.year).filter(Boolean);
  if (!years.includes(DEFAULT_REPORT_YEAR)) years.unshift(DEFAULT_REPORT_YEAR);
  return Array.from(new Set(years));
}

export async function getKpisByEntity(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('date');
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
           WHERE tenant_id = ? AND entity = ? AND ${yearExpr} = ?`,
          [tenantId, entity, reportYear]
        )) ?? { spend: 0, refunds: 0, needs_review: 0 };

      const topCategory = await db.get<{ category: ScheduleCCategory; total: number }>(
        `SELECT category, SUM(amount) AS total
         FROM transactions
         WHERE tenant_id = ? AND entity = ? AND amount > 0 AND ${yearExpr} = ?
         GROUP BY category
         ORDER BY total DESC
         LIMIT 1`,
        [tenantId, entity, reportYear]
      );

      const topVendor = await db.get<{ vendor: string; total: number }>(
        `SELECT vendor, SUM(amount) AS total
         FROM transactions
         WHERE tenant_id = ? AND entity = ? AND amount > 0 AND ${yearExpr} = ?
         GROUP BY vendor
         ORDER BY total DESC
         LIMIT 1`,
        [tenantId, entity, reportYear]
      );

      const monthExpr = sqlMonthExpr('date');
      const monthly = await db.all<{ month: string; total: number }>(
        `SELECT ${monthExpr} AS month, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total
         FROM transactions
         WHERE tenant_id = ? AND entity = ? AND ${yearExpr} = ?
         GROUP BY month
         ORDER BY month ASC`,
        [tenantId, entity, reportYear]
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

export async function getMonthlyStacked(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const monthExpr = sqlMonthExpr('date');
  const yearExpr = sqlYearExpr('date');
  const rows = await db.all<{ month: string; entity: Entity; total: number }>(
    `SELECT ${monthExpr} AS month, entity, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total
     FROM transactions
     WHERE tenant_id = ? AND ${yearExpr} = ?
     GROUP BY month, entity
     ORDER BY month ASC`,
    [tenantId, reportYear]
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

export async function getCategoryDistribution(tenantId: string, entity?: Entity, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('date');
  const sql = entity
    ? `SELECT category, SUM(amount) AS total FROM transactions WHERE tenant_id = ? AND entity = ? AND amount > 0 AND ${yearExpr} = ? GROUP BY category ORDER BY total DESC`
    : `SELECT category, SUM(amount) AS total FROM transactions WHERE tenant_id = ? AND amount > 0 AND ${yearExpr} = ? GROUP BY category ORDER BY total DESC`;

  return entity
    ? db.all<{ category: string; total: number }>(sql, [tenantId, entity, reportYear])
    : db.all<{ category: string; total: number }>(sql, [tenantId, reportYear]);
}

export async function getTopVendors(tenantId: string, entity?: Entity, limit = 10, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('date');
  const sql = entity
    ? `SELECT vendor, SUM(amount) AS total FROM transactions WHERE tenant_id = ? AND entity = ? AND amount > 0 AND ${yearExpr} = ? GROUP BY vendor ORDER BY total DESC LIMIT ?`
    : `SELECT vendor, SUM(amount) AS total FROM transactions WHERE tenant_id = ? AND amount > 0 AND ${yearExpr} = ? GROUP BY vendor ORDER BY total DESC LIMIT ?`;

  return entity
    ? db.all<{ vendor: string; total: number }>(sql, [tenantId, entity, reportYear, limit])
    : db.all<{ vendor: string; total: number }>(sql, [tenantId, reportYear, limit]);
}

export async function getEntityLedger(tenantId: string, entity: Entity, filters?: { category?: string; vendor?: string; confidence?: string }, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('date');
  const clauses = ['tenant_id = ?', 'entity = ?', `${yearExpr} = ?`];
  const params: Array<string | number> = [tenantId, entity, reportYear];

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

export async function getNeedsReviewTransactions(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('date');
  return db.all<Transaction>(
    `SELECT *
     FROM transactions
     WHERE tenant_id = ?
       AND (category = 'Other Business Expense (Needs Review)' OR confidence = 'low')
       AND ${yearExpr} = ?
     ORDER BY date DESC, id DESC`,
    [tenantId, reportYear]
  );
}

export async function getImportAuditMeta(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('date');
  const row = await db.get<{ filename: string; imported_at: string; row_count: number }>(
    'SELECT filename, imported_at, row_count FROM imports WHERE tenant_id = ? ORDER BY imported_at DESC LIMIT 1',
    [tenantId]
  );

  const refundTotals =
    (await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0) AS total FROM transactions WHERE tenant_id = ? AND amount < 0 AND ${yearExpr} = ?`,
      [tenantId, reportYear]
    )) ?? {
      total: 0
    };

  return {
    latestImport: row,
    refundTotals: refundTotals.total
  };
}

export async function getSystemCounts(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('date');
  const imports = (await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM imports WHERE tenant_id = ?', [tenantId]))?.count ?? 0;
  const transactions =
    (await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM transactions WHERE tenant_id = ? AND ${yearExpr} = ?`, [tenantId, reportYear]))
      ?.count ?? 0;
  return { imports, transactions };
}
