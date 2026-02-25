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
    const payload = record.payload as Record<string, number>;

    if (record.type === 'home_office') {
      const businessPct = (payload.businessSqft || 0) / Math.max(payload.totalSqft || 1, 1);
      const annual =
        (payload.mortgageInterest || 0) +
        (payload.utilities || 0) +
        (payload.insurance || 0) +
        (payload.repairs || 0);
      total += annual * businessPct;
    }

    if (record.type === 'mileage') {
      total += (payload.businessMiles || 0) * (payload.irsRate || 0.67);
    }

    if (record.type === 'phone') {
      total += (payload.annualCost || 0) * ((payload.businessPct || 0) / 100);
    }

    if (record.type === 'equipment') {
      total += payload.section179 ? payload.totalCost || 0 : (payload.totalCost || 0) * 0.2;
    }
  }

  return total;
}
