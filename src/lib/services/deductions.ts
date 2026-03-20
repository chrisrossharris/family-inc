import db from '@/lib/db/connection';
import type { DeductionType, Entity } from '@/lib/types';

export interface DeductionRecord {
  id: number;
  tenant_id: string;
  entity: Entity;
  type: DeductionType;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export function estimateDeduction(type: DeductionType, payloadInput: Record<string, unknown>): number {
  const payload = payloadInput as Record<string, number | boolean>;

  if (type === 'home_office') {
    const totalSqft = Math.max(Number(payload.totalSqft || 1), 1);
    const businessSqft = Number(payload.businessSqft || 0);
    const businessPct = businessSqft / totalSqft;
    const annual =
      Number(payload.mortgageInterest || 0) +
      Number(payload.utilities || 0) +
      Number(payload.insurance || 0) +
      Number(payload.repairs || 0);
    return annual * businessPct;
  }

  if (type === 'mileage') {
    return Number(payload.businessMiles || 0) * Number(payload.irsRate || 0.67);
  }

  if (type === 'phone') {
    return Number(payload.annualCost || 0) * (Number(payload.businessPct || 0) / 100);
  }

  const totalCost = Number(payload.totalCost || 0);
  return payload.section179 ? totalCost : totalCost * 0.2;
}

export async function upsertDeduction(tenantId: string, entity: Entity, type: DeductionType, payload: Record<string, unknown>) {
  await db.run(
    `INSERT INTO deductions (tenant_id, entity, type, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(tenant_id, entity, type)
     DO UPDATE SET payload_json = excluded.payload_json, updated_at = CURRENT_TIMESTAMP`,
    [tenantId, entity, type, JSON.stringify(payload)]
  );
}

export async function getDeductions(tenantId: string, entity?: Entity) {
  const sql = entity
    ? 'SELECT * FROM deductions WHERE tenant_id = ? AND entity = ?'
    : 'SELECT * FROM deductions WHERE tenant_id = ?';
  const rows = entity ? await db.all<DeductionRecord>(sql, [tenantId, entity]) : await db.all<DeductionRecord>(sql, [tenantId]);

  return rows.map((row) => ({
    ...row,
    payload: JSON.parse(row.payload_json) as Record<string, number | string | boolean>
  }));
}

export async function calculateDeductionTotals(tenantId: string, entity: Entity) {
  const records = await getDeductions(tenantId, entity);
  let total = 0;

  for (const record of records) {
    total += estimateDeduction(record.type, (record.payload ?? {}) as Record<string, unknown>);
  }

  return total;
}
