import db from '@/lib/db/connection';

export type MembershipRole = 'owner' | 'admin' | 'editor' | 'viewer';

export async function getMembershipRole(tenantId: string, userId: string): Promise<MembershipRole | null> {
  const row = await db.get<{ role: MembershipRole }>('SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?', [tenantId, userId]);
  return row?.role ?? null;
}

export async function requireAnyRole(tenantId: string, userId: string, allowedRoles: MembershipRole[]) {
  const role = await getMembershipRole(tenantId, userId);
  if (!role || !allowedRoles.includes(role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  return null;
}
