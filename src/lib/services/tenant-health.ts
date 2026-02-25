import db from '@/lib/db/connection';
import { SCHEDULE_C_CATEGORIES } from '@/lib/constants';
import { listTenantMembershipsForUser } from '@/lib/services/tenants';

export interface TenantHealthRow {
  tenantId: string;
  tenantName: string;
  role: string;
  transactions: number;
  imports: number;
  vendorRules: number;
  deductions: number;
  members: number;
  pendingInvites: number;
  healthRecords: number;
  childrenRecords: number;
  latestImportAt: string | null;
  latestTransactionDate: string | null;
  staleDays: number | null;
  invalidEntityCount: number;
  invalidCategoryCount: number;
  invalidConfidenceCount: number;
  blankVendorCount: number;
  blankDateCount: number;
  unexpectedMembershipRoleCount: number;
}

const VALID_ENTITIES = ['chris', 'kate', 'big_picture'];
const VALID_CONFIDENCE = ['high', 'medium', 'low'];
const VALID_MEMBERSHIP_ROLES = ['owner', 'admin', 'editor', 'viewer'];

function daysSince(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const parsed = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

export async function getTenantHealthForUser(userId: string): Promise<TenantHealthRow[]> {
  const memberships = await listTenantMembershipsForUser(userId);
  const rows: TenantHealthRow[] = [];

  for (const membership of memberships) {
    const tenantId = membership.id;

    const [
      txCount,
      importsCount,
      rulesCount,
      deductionsCount,
      membersCount,
      pendingInvites,
      latestImport,
      latestTxn,
      invalidEntity,
      invalidCategory,
      invalidConfidence,
      blankVendor,
      blankDate,
      unexpectedRole,
      symptomCount,
      sickDaysCount,
      allergyCount,
      medicationCount,
      appointmentCount,
      childProfileCount,
      childCheckinsCount,
      childGoalsCount,
      childMilestonesCount,
      childAcademicsCount,
      childActivitiesCount,
      childContactsCount
    ] = await Promise.all([
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM transactions WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM imports WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM vendor_rules WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM deductions WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>("SELECT COUNT(*) AS count FROM invitations WHERE tenant_id = ? AND status = 'pending'", [tenantId]),
      db.get<{ imported_at: string | null }>('SELECT imported_at FROM imports WHERE tenant_id = ? ORDER BY imported_at DESC LIMIT 1', [tenantId]),
      db.get<{ date: string | null }>('SELECT date FROM transactions WHERE tenant_id = ? ORDER BY date DESC LIMIT 1', [tenantId]),
      db.get<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM transactions
         WHERE tenant_id = ? AND entity NOT IN (${VALID_ENTITIES.map(() => '?').join(',')})`,
        [tenantId, ...VALID_ENTITIES]
      ),
      db.get<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM transactions
         WHERE tenant_id = ? AND category NOT IN (${SCHEDULE_C_CATEGORIES.map(() => '?').join(',')})`,
        [tenantId, ...SCHEDULE_C_CATEGORIES]
      ),
      db.get<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM transactions
         WHERE tenant_id = ? AND confidence NOT IN (${VALID_CONFIDENCE.map(() => '?').join(',')})`,
        [tenantId, ...VALID_CONFIDENCE]
      ),
      db.get<{ count: number }>("SELECT COUNT(*) AS count FROM transactions WHERE tenant_id = ? AND TRIM(COALESCE(vendor, '')) = ''", [tenantId]),
      db.get<{ count: number }>("SELECT COUNT(*) AS count FROM transactions WHERE tenant_id = ? AND TRIM(COALESCE(date, '')) = ''", [tenantId]),
      db.get<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM memberships
         WHERE tenant_id = ? AND role NOT IN (${VALID_MEMBERSHIP_ROLES.map(() => '?').join(',')})`,
        [tenantId, ...VALID_MEMBERSHIP_ROLES]
      ),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM health_symptom_logs WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM health_sick_days WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM health_allergies WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM health_medications WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM health_appointments WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM children_profiles WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM children_checkins WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM children_goals WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM children_milestones WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM children_academics WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM children_activities WHERE tenant_id = ?', [tenantId]),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM children_support_contacts WHERE tenant_id = ?', [tenantId])
    ]);

    const healthRecords =
      (symptomCount?.count ?? 0) +
      (sickDaysCount?.count ?? 0) +
      (allergyCount?.count ?? 0) +
      (medicationCount?.count ?? 0) +
      (appointmentCount?.count ?? 0);

    const childrenRecords =
      (childProfileCount?.count ?? 0) +
      (childCheckinsCount?.count ?? 0) +
      (childGoalsCount?.count ?? 0) +
      (childMilestonesCount?.count ?? 0) +
      (childAcademicsCount?.count ?? 0) +
      (childActivitiesCount?.count ?? 0) +
      (childContactsCount?.count ?? 0);

    rows.push({
      tenantId,
      tenantName: membership.name,
      role: membership.role,
      transactions: txCount?.count ?? 0,
      imports: importsCount?.count ?? 0,
      vendorRules: rulesCount?.count ?? 0,
      deductions: deductionsCount?.count ?? 0,
      members: membersCount?.count ?? 0,
      pendingInvites: pendingInvites?.count ?? 0,
      healthRecords,
      childrenRecords,
      latestImportAt: latestImport?.imported_at ?? null,
      latestTransactionDate: latestTxn?.date ?? null,
      staleDays: daysSince(latestTxn?.date ?? null),
      invalidEntityCount: invalidEntity?.count ?? 0,
      invalidCategoryCount: invalidCategory?.count ?? 0,
      invalidConfidenceCount: invalidConfidence?.count ?? 0,
      blankVendorCount: blankVendor?.count ?? 0,
      blankDateCount: blankDate?.count ?? 0,
      unexpectedMembershipRoleCount: unexpectedRole?.count ?? 0
    });
  }

  return rows;
}
