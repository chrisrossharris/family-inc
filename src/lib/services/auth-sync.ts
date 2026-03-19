import db from '@/lib/db/connection';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function upsertTenant(tenantId: string, tenantName: string) {
  const slug = slugify(tenantName || tenantId) || tenantId;
  await db.run(
    'INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, name = excluded.name',
    [tenantId, slug, tenantName || tenantId]
  );
}

async function upsertUser(userId: string, email: string, displayName: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const existingByEmail = await db.get<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [normalizedEmail]);

  // If this email already exists under a different user id (legacy/local data),
  // re-use that user id to preserve memberships and avoid unique(email) collisions.
  if (existingByEmail && existingByEmail.id !== userId) {
    await db.run('UPDATE users SET email = ?, display_name = ? WHERE id = ?', [normalizedEmail, displayName, existingByEmail.id]);
    return existingByEmail.id;
  }

  await db.run(
    'INSERT INTO users (id, email, display_name) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name',
    [userId, normalizedEmail, displayName]
  );
  return userId;
}

async function ensureMembership(tenantId: string, userId: string, role: 'owner' | 'admin' | 'editor' | 'viewer') {
  await db.run('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT (tenant_id, user_id) DO NOTHING', [
    tenantId,
    userId,
    role
  ]);
}

async function acceptPendingInvitationsForEmail(userId: string, email: string): Promise<string[]> {
  const pending = await db.all<{ tenant_id: string; role: 'owner' | 'admin' | 'editor' | 'viewer' }>(
    `SELECT tenant_id, role
     FROM invitations
     WHERE LOWER(email) = LOWER(?)
       AND status = 'pending'
     ORDER BY created_at ASC`,
    [email]
  );
  if (pending.length === 0) return [];

  const acceptedTenantIds: string[] = [];
  await db.transaction(async (tx) => {
    for (const invite of pending) {
      await tx.run('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT (tenant_id, user_id) DO NOTHING', [
        invite.tenant_id,
        userId,
        invite.role
      ]);
      await tx.run("UPDATE invitations SET status = 'accepted' WHERE tenant_id = ? AND LOWER(email) = LOWER(?) AND status = 'pending'", [
        invite.tenant_id,
        email
      ]);
      acceptedTenantIds.push(invite.tenant_id);
    }
  });
  return acceptedTenantIds;
}

async function recoverMembershipsByEmail(userId: string, email: string): Promise<string[]> {
  const legacyRows = await db.all<{ tenant_id: string; role: 'owner' | 'admin' | 'editor' | 'viewer' }>(
    `
      SELECT m.tenant_id, m.role
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE LOWER(u.email) = LOWER(?)
      ORDER BY m.created_at ASC
    `,
    [email]
  );
  if (legacyRows.length === 0) return [];

  const attached: string[] = [];
  await db.transaction(async (tx) => {
    for (const row of legacyRows) {
      await tx.run('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT (tenant_id, user_id) DO NOTHING', [
        row.tenant_id,
        userId,
        row.role
      ]);
      attached.push(row.tenant_id);
    }
  });
  return attached;
}

export async function resolveAppWorkspace(params: {
  userId: string;
  email: string;
  displayName: string;
  clerkOrgId?: string | null;
  clerkOrgName?: string | null;
  preferredTenantId?: string | null;
}) {
  const { userId, email, displayName, clerkOrgId, clerkOrgName, preferredTenantId } = params;

  const resolvedUserId = await upsertUser(userId, email, displayName);
  const acceptedTenants = await acceptPendingInvitationsForEmail(resolvedUserId, email);
  const recoveredTenants = await recoverMembershipsByEmail(resolvedUserId, email);

  if (clerkOrgId) {
    const tenantId = `org_${clerkOrgId}`;
    await upsertTenant(tenantId, clerkOrgName ?? `Organization ${clerkOrgId}`);
    await ensureMembership(tenantId, resolvedUserId, 'admin');
    return { tenantId, userId: resolvedUserId };
  }

  const memberships = await db.all<{ tenant_id: string }>('SELECT tenant_id FROM memberships WHERE user_id = ? ORDER BY created_at ASC', [resolvedUserId]);

  if (acceptedTenants.length > 0) return { tenantId: acceptedTenants[0]!, userId: resolvedUserId };
  if (recoveredTenants.length > 0) return { tenantId: recoveredTenants[0]!, userId: resolvedUserId };

  if (preferredTenantId) {
    const hasPreferred = memberships.some((row) => row.tenant_id === preferredTenantId);
    if (hasPreferred) return { tenantId: preferredTenantId, userId: resolvedUserId };
  }

  if (memberships.length > 0) return { tenantId: memberships[0]!.tenant_id, userId: resolvedUserId };

  const personalTenantId = `user_${slugify(resolvedUserId) || 'workspace'}`;
  // Never auto-join a preferred tenant when this user has no existing membership.
  // This prevents cross-account data leakage from stale tenant cookies.
  await upsertTenant(personalTenantId, displayName + ' Personal');
  await ensureMembership(personalTenantId, resolvedUserId, 'owner');
  return { tenantId: personalTenantId, userId: resolvedUserId };
}
