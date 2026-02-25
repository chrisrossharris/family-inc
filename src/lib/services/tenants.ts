import db from '@/lib/db/connection';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
}

export interface TenantMembership extends Tenant {
  role: string;
}

export async function listTenantsForUser(userId: string) {
  return db.all<Tenant>(
    `SELECT t.id, t.slug, t.name
     FROM tenants t
     INNER JOIN memberships m ON m.tenant_id = t.id
     WHERE m.user_id = ?
     ORDER BY t.name ASC`,
    [userId]
  );
}

export async function listTenantMembershipsForUser(userId: string) {
  return db.all<TenantMembership>(
    `SELECT t.id, t.slug, t.name, m.role
     FROM tenants t
     INNER JOIN memberships m ON m.tenant_id = t.id
     WHERE m.user_id = ?
     ORDER BY t.name ASC`,
    [userId]
  );
}
