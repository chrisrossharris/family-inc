import db from '@/lib/db/connection';

export interface MemberRow {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
}

export interface InvitationRow {
  id: number;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

export async function listMembers(tenantId: string) {
  return db.all<MemberRow>(
    `SELECT m.user_id, u.display_name, u.email, m.role
     FROM memberships m
     INNER JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id = ?
     ORDER BY u.display_name ASC`,
    [tenantId]
  );
}

export async function listInvitations(tenantId: string) {
  return db.all<InvitationRow>(
    `SELECT id, email, role, status, created_at
     FROM invitations
     WHERE tenant_id = ?
     ORDER BY created_at DESC`,
    [tenantId]
  );
}

export async function createInvitation(tenantId: string, invitedByUserId: string, email: string, role: string) {
  await db.run(
    `INSERT INTO invitations (tenant_id, email, role, invited_by_user_id, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id, email, status)
     DO UPDATE SET role = excluded.role, invited_by_user_id = excluded.invited_by_user_id, created_at = CURRENT_TIMESTAMP`,
    [tenantId, email.toLowerCase().trim(), role, invitedByUserId]
  );
}

export async function countOwners(tenantId: string) {
  const row = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id = ? AND role = ?', [tenantId, 'owner']);
  return row?.count ?? 0;
}

export async function updateMemberRole(tenantId: string, userId: string, role: string) {
  await db.run('UPDATE memberships SET role = ? WHERE tenant_id = ? AND user_id = ?', [role, tenantId, userId]);
}
