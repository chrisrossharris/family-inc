import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';

export interface AnnualShowcaseData {
  periodLabel: string;
  years: string[];
  finance: {
    totalSpend: number;
    totalRefunds: number;
    netSpend: number;
    transactions: number;
    topCategory: string;
    yearly: Array<{ year: string; spend: number; refunds: number }>;
    topVendors: Array<{ label: string; value: string }>;
  };
  health: {
    symptomEntries: number;
    highSeverity: number;
    sickDays: number;
    activeAllergies: number;
    activeMedications: number;
    upcomingAppointments: number;
    topSymptoms: Array<{ label: string; value: string }>;
  };
  children: {
    childrenCount: number;
    checkins: number;
    activeGoals: number;
    milestones: number;
    activities: number;
    topGoalDomains: Array<{ label: string; value: string }>;
  };
}

function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

export async function getAnnualShowcaseData(tenantId: string): Promise<AnnualShowcaseData> {
  const txYearExpr = sqlYearExpr('date');

  const yearsRows = await db.all<{ year: string }>(
    `SELECT DISTINCT ${txYearExpr} AS year
     FROM transactions
     WHERE tenant_id = ? AND date IS NOT NULL
     ORDER BY year ASC`,
    [tenantId]
  );

  const years = yearsRows.map((row) => row.year).filter(Boolean);
  const periodLabel = years.length > 0 ? `${years[0]}-${years[years.length - 1]}` : 'No Data';

  const financeTotals =
    (await db.get<{ spend: number; refunds: number; tx_count: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS spend,
         COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS refunds,
         COUNT(*) AS tx_count
       FROM transactions
       WHERE tenant_id = ?`,
      [tenantId]
    )) ?? { spend: 0, refunds: 0, tx_count: 0 };

  const financeTopCategory = await db.get<{ category: string; total: number }>(
    `SELECT category, SUM(amount) AS total
     FROM transactions
     WHERE tenant_id = ? AND amount > 0
     GROUP BY category
     ORDER BY total DESC
     LIMIT 1`,
    [tenantId]
  );

  const financeYearly = await db.all<{ year: string; spend: number; refunds: number }>(
    `SELECT
       ${txYearExpr} AS year,
       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS spend,
       COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS refunds
     FROM transactions
     WHERE tenant_id = ?
     GROUP BY year
     ORDER BY year ASC`,
    [tenantId]
  );

  const financeTopVendorsRaw = await db.all<{ vendor: string; total: number }>(
    `SELECT vendor, SUM(amount) AS total
     FROM transactions
     WHERE tenant_id = ? AND amount > 0
     GROUP BY vendor
     ORDER BY total DESC
     LIMIT 8`,
    [tenantId]
  );

  const healthTotals =
    (await db.get<{ symptom_entries: number; high_severity: number; active_allergies: number; active_meds: number; upcoming_appointments: number }>(
      `SELECT
         (SELECT COUNT(*) FROM health_symptom_logs WHERE tenant_id = ?) AS symptom_entries,
         (SELECT COALESCE(SUM(CASE WHEN severity >= 4 THEN 1 ELSE 0 END), 0) FROM health_symptom_logs WHERE tenant_id = ?) AS high_severity,
         (SELECT COUNT(*) FROM health_allergies WHERE tenant_id = ? AND active = 1) AS active_allergies,
         (SELECT COUNT(*) FROM health_medications WHERE tenant_id = ? AND active = 1) AS active_meds,
         (SELECT COUNT(*) FROM health_appointments WHERE tenant_id = ? AND status = 'scheduled') AS upcoming_appointments`,
      [tenantId, tenantId, tenantId, tenantId, tenantId]
    )) ?? { symptom_entries: 0, high_severity: 0, active_allergies: 0, active_meds: 0, upcoming_appointments: 0 };

  const sickDayRanges = await db.all<{ start_date: string; end_date: string }>(
    `SELECT start_date, end_date
     FROM health_sick_days
     WHERE tenant_id = ?`,
    [tenantId]
  );
  const totalSickDays = sickDayRanges.reduce((sum, row) => sum + daysBetweenInclusive(row.start_date, row.end_date), 0);

  const topSymptomsRaw = await db.all<{ symptom: string; count: number }>(
    `SELECT symptom, COUNT(*) AS count
     FROM health_symptom_logs
     WHERE tenant_id = ?
     GROUP BY symptom
     ORDER BY count DESC
     LIMIT 6`,
    [tenantId]
  );

  const childrenTotals =
    (await db.get<{ children_count: number; checkins: number; active_goals: number; milestones: number; activities: number }>(
      `SELECT
         (SELECT COUNT(*) FROM family_members WHERE tenant_id = ? AND is_active = 1 AND (LOWER(relation) LIKE '%child%' OR LOWER(relation) LIKE '%son%' OR LOWER(relation) LIKE '%daughter%')) AS children_count,
         (SELECT COUNT(*) FROM children_checkins WHERE tenant_id = ?) AS checkins,
         (SELECT COUNT(*) FROM children_goals WHERE tenant_id = ? AND status = 'active') AS active_goals,
         (SELECT COUNT(*) FROM children_milestones WHERE tenant_id = ?) AS milestones,
         (SELECT COUNT(*) FROM children_activities WHERE tenant_id = ?) AS activities`,
      [tenantId, tenantId, tenantId, tenantId, tenantId]
    )) ?? { children_count: 0, checkins: 0, active_goals: 0, milestones: 0, activities: 0 };

  const topGoalDomainsRaw = await db.all<{ domain: string; count: number }>(
    `SELECT domain, COUNT(*) AS count
     FROM children_goals
     WHERE tenant_id = ?
     GROUP BY domain
     ORDER BY count DESC
     LIMIT 6`,
    [tenantId]
  );

  return {
    periodLabel,
    years,
    finance: {
      totalSpend: financeTotals.spend,
      totalRefunds: financeTotals.refunds,
      netSpend: financeTotals.spend - financeTotals.refunds,
      transactions: financeTotals.tx_count,
      topCategory: financeTopCategory?.category ?? 'n/a',
      yearly: financeYearly,
      topVendors: financeTopVendorsRaw.map((row) => ({ label: row.vendor, value: row.total.toLocaleString('en-US', { maximumFractionDigits: 0 }) }))
    },
    health: {
      symptomEntries: healthTotals.symptom_entries,
      highSeverity: healthTotals.high_severity,
      sickDays: totalSickDays,
      activeAllergies: healthTotals.active_allergies,
      activeMedications: healthTotals.active_meds,
      upcomingAppointments: healthTotals.upcoming_appointments,
      topSymptoms: topSymptomsRaw.map((row) => ({ label: row.symptom, value: row.count.toLocaleString() }))
    },
    children: {
      childrenCount: childrenTotals.children_count,
      checkins: childrenTotals.checkins,
      activeGoals: childrenTotals.active_goals,
      milestones: childrenTotals.milestones,
      activities: childrenTotals.activities,
      topGoalDomains: topGoalDomainsRaw.map((row) => ({ label: row.domain, value: row.count.toLocaleString() }))
    }
  };
}
