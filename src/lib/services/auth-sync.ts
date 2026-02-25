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

async function upsertUser(userId: string, email: string, displayName: string) {
  await db.run(
    'INSERT INTO users (id, email, display_name) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name',
    [userId, email, displayName]
  );
}

async function ensureMembership(tenantId: string, userId: string, role: 'owner' | 'admin' | 'editor' | 'viewer') {
  await db.run('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT (tenant_id, user_id) DO NOTHING', [
    tenantId,
    userId,
    role
  ]);
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

  await upsertUser(userId, email, displayName);

  if (clerkOrgId) {
    const tenantId = `org_${clerkOrgId}`;
    await upsertTenant(tenantId, clerkOrgName ?? `Organization ${clerkOrgId}`);
    await ensureMembership(tenantId, userId, 'admin');
    return tenantId;
  }

  const memberships = await db.all<{ tenant_id: string }>('SELECT tenant_id FROM memberships WHERE user_id = ? ORDER BY created_at ASC', [userId]);

  if (preferredTenantId) {
    const hasPreferred = memberships.some((row) => row.tenant_id === preferredTenantId);
    if (hasPreferred) return preferredTenantId;
  }

  if (memberships.length > 0) return memberships[0]!.tenant_id;

  const personalTenantId = `user_${slugify(userId) || 'workspace'}`;
  const defaultTenantId = preferredTenantId || personalTenantId;
  await upsertTenant(defaultTenantId, displayName + ' Personal');
  await ensureMembership(defaultTenantId, userId, 'owner');
  return defaultTenantId;
}
