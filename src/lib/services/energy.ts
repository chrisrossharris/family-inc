import db from '@/lib/db/connection';
import { DEFAULT_REPORT_YEAR, normalizeReportYear } from '@/lib/utils/year';

export type EnergySourceType = 'electricity' | 'gas' | 'water' | 'solar' | 'other';
export type EnergyActionCategory = 'efficiency' | 'solar' | 'renewable' | 'behavior' | 'upgrade';
export type EnergyActionStatus = 'planned' | 'in_progress' | 'done' | 'skipped';
export type EnergyActionPriority = 'low' | 'medium' | 'high';

export interface EnergyProfile {
  id: number;
  tenant_id: string;
  home_sqft: number | null;
  occupants: number | null;
  utility_rate_per_kwh: number | null;
  target_monthly_kwh: number | null;
  roof_solar_score: number | null;
  owns_home: 0 | 1;
  has_solar: 0 | 1;
  green_utility_plan: 0 | 1;
  notes: string | null;
}

export interface EnergyBill {
  id: number;
  tenant_id: string;
  bill_month: string;
  provider_name: string;
  source_type: EnergySourceType;
  kwh_used: number;
  cost_amount: number;
  peak_kwh: number;
  off_peak_kwh: number;
  renewable_pct: number;
  solar_export_kwh: number;
  notes: string | null;
}

export interface EnergyAction {
  id: number;
  tenant_id: string;
  action_name: string;
  category: EnergyActionCategory;
  status: EnergyActionStatus;
  priority: EnergyActionPriority;
  estimated_annual_kwh_savings: number;
  estimated_annual_cost_savings: number;
  estimated_upfront_cost: number;
  notes: string | null;
}

interface EnergyRecommendation {
  id: string;
  category: EnergyActionCategory;
  priority: EnergyActionPriority;
  title: string;
  rationale: string;
  estimatedAnnualKwhSavings: number;
  estimatedAnnualCostSavings: number;
  estimatedUpfrontCost: number;
  paybackYears: number | null;
}

function yearParam(year?: string): string {
  return normalizeReportYear(year ?? DEFAULT_REPORT_YEAR);
}

function safePaybackYears(cost: number, savings: number): number | null {
  if (cost <= 0 || savings <= 0) return null;
  return cost / savings;
}

function normalizeBillMonth(value: string): string {
  const trimmed = value.trim();
  const matchMonth = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (matchMonth) return `${matchMonth[1]}-${matchMonth[2]}-01`;
  const matchDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (matchDate) return `${matchDate[1]}-${matchDate[2]}-${matchDate[3]}`;
  return trimmed;
}

export async function upsertEnergyProfile(input: {
  tenantId: string;
  homeSqft?: number | null;
  occupants?: number | null;
  utilityRatePerKwh?: number | null;
  targetMonthlyKwh?: number | null;
  roofSolarScore?: number | null;
  ownsHome?: 0 | 1;
  hasSolar?: 0 | 1;
  greenUtilityPlan?: 0 | 1;
  notes?: string | null;
}) {
  const existing = await db.get<{ id: number }>('SELECT id FROM energy_profiles WHERE tenant_id = ?', [input.tenantId]);
  if (existing) {
    await db.run(
      `UPDATE energy_profiles
       SET home_sqft = ?, occupants = ?, utility_rate_per_kwh = ?, target_monthly_kwh = ?, roof_solar_score = ?,
           owns_home = ?, has_solar = ?, green_utility_plan = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ?`,
      [
        input.homeSqft ?? null,
        input.occupants ?? null,
        input.utilityRatePerKwh ?? null,
        input.targetMonthlyKwh ?? null,
        input.roofSolarScore ?? null,
        input.ownsHome ?? 1,
        input.hasSolar ?? 0,
        input.greenUtilityPlan ?? 0,
        input.notes ?? null,
        input.tenantId
      ]
    );
    return;
  }

  await db.run(
    `INSERT INTO energy_profiles
      (tenant_id, home_sqft, occupants, utility_rate_per_kwh, target_monthly_kwh, roof_solar_score, owns_home, has_solar, green_utility_plan, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      input.tenantId,
      input.homeSqft ?? null,
      input.occupants ?? null,
      input.utilityRatePerKwh ?? null,
      input.targetMonthlyKwh ?? null,
      input.roofSolarScore ?? null,
      input.ownsHome ?? 1,
      input.hasSolar ?? 0,
      input.greenUtilityPlan ?? 0,
      input.notes ?? null
    ]
  );
}

export async function addEnergyBill(input: {
  tenantId: string;
  billMonth: string;
  providerName: string;
  sourceType: EnergySourceType;
  kwhUsed?: number;
  costAmount?: number;
  peakKwh?: number;
  offPeakKwh?: number;
  renewablePct?: number;
  solarExportKwh?: number;
  notes?: string | null;
}) {
  const billMonth = normalizeBillMonth(input.billMonth);
  await db.run(
    `INSERT INTO energy_bills
      (tenant_id, bill_month, provider_name, source_type, kwh_used, cost_amount, peak_kwh, off_peak_kwh, renewable_pct, solar_export_kwh, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      input.tenantId,
      billMonth,
      input.providerName,
      input.sourceType,
      input.kwhUsed ?? 0,
      input.costAmount ?? 0,
      input.peakKwh ?? 0,
      input.offPeakKwh ?? 0,
      input.renewablePct ?? 0,
      input.solarExportKwh ?? 0,
      input.notes ?? null
    ]
  );
}

export async function deleteEnergyBill(input: {
  tenantId: string;
  id: number;
}) {
  await db.run(
    `DELETE FROM energy_bills
     WHERE tenant_id = ? AND id = ?`,
    [input.tenantId, input.id]
  );
}

export async function addEnergyAction(input: {
  tenantId: string;
  actionName: string;
  category: EnergyActionCategory;
  status?: EnergyActionStatus;
  priority?: EnergyActionPriority;
  estimatedAnnualKwhSavings?: number;
  estimatedAnnualCostSavings?: number;
  estimatedUpfrontCost?: number;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO energy_actions
      (tenant_id, action_name, category, status, priority, estimated_annual_kwh_savings, estimated_annual_cost_savings, estimated_upfront_cost, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      input.tenantId,
      input.actionName,
      input.category,
      input.status ?? 'planned',
      input.priority ?? 'medium',
      input.estimatedAnnualKwhSavings ?? 0,
      input.estimatedAnnualCostSavings ?? 0,
      input.estimatedUpfrontCost ?? 0,
      input.notes ?? null
    ]
  );
}

export async function updateEnergyActionStatus(input: {
  tenantId: string;
  actionId: number;
  status: EnergyActionStatus;
}) {
  await db.run(
    `UPDATE energy_actions
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    [input.status, input.tenantId, input.actionId]
  );
}

function buildRecommendations(params: {
  avgMonthlyKwh: number;
  avgMonthlyCost: number;
  peakShare: number;
  weightedRenewablePct: number;
  targetMonthlyKwh: number;
  hasSolar: boolean;
  greenUtilityPlan: boolean;
  roofSolarScore: number;
  utilityRatePerKwh: number;
  ownsHome: boolean;
}): EnergyRecommendation[] {
  const recs: EnergyRecommendation[] = [];

  if (params.avgMonthlyKwh > params.targetMonthlyKwh * 1.1) {
    const annualKwh = Math.max(0, (params.avgMonthlyKwh - params.targetMonthlyKwh) * 12 * 0.35);
    const annualUsd = annualKwh * params.utilityRatePerKwh;
    recs.push({
      id: 'efficiency-baseload',
      category: 'efficiency',
      priority: 'high',
      title: 'Cut Baseload First (lighting + phantom loads + thermostat schedule)',
      rationale: `Current average ${params.avgMonthlyKwh.toFixed(0)} kWh/mo is above target ${params.targetMonthlyKwh.toFixed(0)} kWh/mo.`,
      estimatedAnnualKwhSavings: annualKwh,
      estimatedAnnualCostSavings: annualUsd,
      estimatedUpfrontCost: 250,
      paybackYears: safePaybackYears(250, annualUsd)
    });
  }

  if (params.peakShare >= 0.35) {
    const annualKwh = params.avgMonthlyKwh * 12 * 0.08;
    const annualUsd = annualKwh * params.utilityRatePerKwh;
    recs.push({
      id: 'behavior-load-shift',
      category: 'behavior',
      priority: 'medium',
      title: 'Shift Peak Usage (laundry, dishwasher, EV, water heating)',
      rationale: `Peak usage share is ${(params.peakShare * 100).toFixed(1)}%, indicating demand-time cost pressure.`,
      estimatedAnnualKwhSavings: annualKwh,
      estimatedAnnualCostSavings: annualUsd,
      estimatedUpfrontCost: 50,
      paybackYears: safePaybackYears(50, annualUsd)
    });
  }

  if (!params.greenUtilityPlan && params.weightedRenewablePct < 50) {
    recs.push({
      id: 'renewable-green-plan',
      category: 'renewable',
      priority: 'medium',
      title: 'Enroll in Utility Green Power / Community Solar',
      rationale: `Current renewable mix is ${params.weightedRenewablePct.toFixed(1)}%. Raising this de-carbonizes without home upgrades.`,
      estimatedAnnualKwhSavings: 0,
      estimatedAnnualCostSavings: params.avgMonthlyCost * 12 * 0.02,
      estimatedUpfrontCost: 0,
      paybackYears: 0
    });
  }

  if (!params.hasSolar && params.ownsHome && params.roofSolarScore >= 5 && params.avgMonthlyKwh >= 700) {
    const recommendedSystemKw = Math.max(3, Math.min(12, params.avgMonthlyKwh / 120));
    const annualKwh = params.avgMonthlyKwh * 12 * (0.6 + params.roofSolarScore * 0.025);
    const annualUsd = annualKwh * params.utilityRatePerKwh;
    const upfront = recommendedSystemKw * 2500;
    recs.push({
      id: 'solar-rooftop',
      category: 'solar',
      priority: 'high',
      title: `Evaluate ~${recommendedSystemKw.toFixed(1)} kW Rooftop Solar`,
      rationale: `Usage and roof score (${params.roofSolarScore}/10) support a meaningful offset scenario.`,
      estimatedAnnualKwhSavings: annualKwh,
      estimatedAnnualCostSavings: annualUsd,
      estimatedUpfrontCost: upfront,
      paybackYears: safePaybackYears(upfront, annualUsd)
    });
  }

  if (params.avgMonthlyKwh >= 1200) {
    const annualKwh = params.avgMonthlyKwh * 12 * 0.12;
    const annualUsd = annualKwh * params.utilityRatePerKwh;
    recs.push({
      id: 'upgrade-hvac-water',
      category: 'upgrade',
      priority: 'medium',
      title: 'Target HVAC / Water Heater Efficiency Upgrade',
      rationale: 'High monthly load usually indicates one large system driving consumption.',
      estimatedAnnualKwhSavings: annualKwh,
      estimatedAnnualCostSavings: annualUsd,
      estimatedUpfrontCost: 3500,
      paybackYears: safePaybackYears(3500, annualUsd)
    });
  }

  return recs.sort((a, b) => {
    const weight = { high: 3, medium: 2, low: 1 } as const;
    return weight[b.priority] - weight[a.priority];
  });
}

export async function getEnergyOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const profile = (await db.get<EnergyProfile>('SELECT * FROM energy_profiles WHERE tenant_id = ?', [tenantId])) ?? null;

  const bills = await db.all<EnergyBill>(
    `SELECT * FROM energy_bills
     WHERE tenant_id = ? AND substr(bill_month, 1, 4) = ?
     ORDER BY bill_month DESC, id DESC`,
    [tenantId, reportYear]
  );

  const monthly = await db.all<{
    month: string;
    electric_kwh: number;
    gas_usage: number;
    water_usage: number;
    solar_generated_kwh: number;
    total_cost: number;
    electric_cost: number;
    gas_cost: number;
    renewable_kwh: number;
    solar_export_kwh: number;
  }>(
    `SELECT substr(bill_month, 1, 7) AS month,
            COALESCE(SUM(CASE WHEN source_type = 'electricity' THEN kwh_used ELSE 0 END), 0) AS electric_kwh,
            COALESCE(SUM(CASE WHEN source_type = 'gas' THEN kwh_used ELSE 0 END), 0) AS gas_usage,
            COALESCE(SUM(CASE WHEN source_type = 'water' THEN kwh_used ELSE 0 END), 0) AS water_usage,
            COALESCE(SUM(CASE WHEN source_type = 'solar' THEN kwh_used ELSE 0 END), 0) AS solar_generated_kwh,
            COALESCE(SUM(cost_amount), 0) AS total_cost,
            COALESCE(SUM(CASE WHEN source_type = 'electricity' THEN cost_amount ELSE 0 END), 0) AS electric_cost,
            COALESCE(SUM(CASE WHEN source_type = 'gas' THEN cost_amount ELSE 0 END), 0) AS gas_cost,
            COALESCE(SUM(CASE WHEN source_type = 'electricity' THEN kwh_used * (renewable_pct / 100.0) ELSE 0 END), 0) AS renewable_kwh,
            COALESCE(SUM(solar_export_kwh), 0) AS solar_export_kwh
     FROM energy_bills
     WHERE tenant_id = ? AND substr(bill_month, 1, 4) = ?
     GROUP BY month
     ORDER BY month ASC`,
    [tenantId, reportYear]
  );

  const actions = await db.all<EnergyAction>(
    `SELECT *
     FROM energy_actions
     WHERE tenant_id = ?
     ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'planned' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, updated_at DESC`,
    [tenantId]
  );

  const monthsTracked = monthly.length;
  const monthsWithElectric = monthly.filter((row) => row.electric_kwh > 0 || row.electric_cost > 0).length;
  const totalElectricKwh = monthly.reduce((acc, row) => acc + row.electric_kwh, 0);
  const totalGasUsage = monthly.reduce((acc, row) => acc + row.gas_usage, 0);
  const totalWaterUsage = monthly.reduce((acc, row) => acc + row.water_usage, 0);
  const totalSolarGeneratedKwh = monthly.reduce((acc, row) => acc + row.solar_generated_kwh, 0);
  const totalCost = monthly.reduce((acc, row) => acc + row.total_cost, 0);
  const totalElectricCost = monthly.reduce((acc, row) => acc + row.electric_cost, 0);
  const totalGasCost = monthly.reduce((acc, row) => acc + row.gas_cost, 0);
  const renewableKwh = monthly.reduce((acc, row) => acc + row.renewable_kwh, 0);
  const totalSolarExportKwh = monthly.reduce((acc, row) => acc + row.solar_export_kwh, 0);
  const avgMonthlyKwh = monthsWithElectric > 0 ? totalElectricKwh / monthsWithElectric : 0;
  const avgMonthlyCost = monthsTracked > 0 ? totalCost / monthsTracked : 0;
  const weightedRenewablePct = totalElectricKwh > 0 ? (renewableKwh / totalElectricKwh) * 100 : 0;

  const peakRows = await db.get<{ peak: number; total: number }>(
    `SELECT COALESCE(SUM(CASE WHEN source_type = 'electricity' THEN peak_kwh ELSE 0 END), 0) AS peak,
            COALESCE(SUM(CASE WHEN source_type = 'electricity' THEN kwh_used ELSE 0 END), 0) AS total
     FROM energy_bills
     WHERE tenant_id = ? AND substr(bill_month, 1, 4) = ?`,
    [tenantId, reportYear]
  );
  const peakShare = (peakRows?.total ?? 0) > 0 ? (peakRows?.peak ?? 0) / (peakRows?.total ?? 0) : 0;

  const utilityRatePerKwh = profile?.utility_rate_per_kwh && profile.utility_rate_per_kwh > 0
    ? profile.utility_rate_per_kwh
    : totalElectricKwh > 0
      ? totalElectricCost / totalElectricKwh
      : 0.16;
  const targetMonthlyKwh = profile?.target_monthly_kwh && profile.target_monthly_kwh > 0 ? profile.target_monthly_kwh : 900;

  const recommendations = buildRecommendations({
    avgMonthlyKwh,
    avgMonthlyCost,
    peakShare,
    weightedRenewablePct,
    targetMonthlyKwh,
    hasSolar: profile?.has_solar === 1,
    greenUtilityPlan: profile?.green_utility_plan === 1,
    roofSolarScore: profile?.roof_solar_score ?? 5,
    utilityRatePerKwh,
    ownsHome: profile?.owns_home !== 0
  });

  const completedActions = actions.filter((a) => a.status === 'done').length;
  const plannedActions = actions.filter((a) => a.status === 'planned' || a.status === 'in_progress').length;
  const actionSavings = actions
    .filter((a) => a.status === 'done')
    .reduce(
      (acc, row) => {
        acc.kwh += row.estimated_annual_kwh_savings;
        acc.cost += row.estimated_annual_cost_savings;
        return acc;
      },
      { kwh: 0, cost: 0 }
    );

  return {
    reportYear,
    profile,
    bills,
    monthly,
    actions,
    recommendations,
    stats: {
      monthsTracked,
      monthsWithElectric,
      totalKwh: totalElectricKwh,
      totalElectricKwh,
      totalGasUsage,
      totalWaterUsage,
      totalSolarGeneratedKwh,
      totalCost,
      totalElectricCost,
      totalGasCost,
      avgMonthlyKwh,
      avgMonthlyCost,
      utilityRatePerKwh,
      weightedRenewablePct,
      peakShare,
      totalSolarExportKwh,
      targetMonthlyKwh,
      completedActions,
      plannedActions,
      doneActionAnnualKwhSavings: actionSavings.kwh,
      doneActionAnnualCostSavings: actionSavings.cost
    }
  };
}
