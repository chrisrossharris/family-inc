import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

async function run() {
  const dbFile = path.join(process.cwd(), 'data', `tenant-isolation-${Date.now()}.sqlite`);
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SKIP_DB_MIGRATIONS = '0';

  const { resolveAppWorkspace } = await import('@/lib/services/auth-sync');
  const dbModule = await import('@/lib/db/connection');
  const db = dbModule.default;

  const userA = await resolveAppWorkspace({
    userId: 'user_alpha',
    email: 'alpha@example.com',
    displayName: 'Alpha User',
    preferredTenantId: null
  });
  assert.equal(userA.userId, 'user_alpha');
  assert.equal(userA.tenantId, 'user_user-alpha');

  const userB = await resolveAppWorkspace({
    userId: 'user_beta',
    email: 'beta@example.com',
    displayName: 'Beta User',
    preferredTenantId: userA.tenantId
  });
  assert.equal(userB.userId, 'user_beta');
  assert.equal(userB.tenantId, 'user_user-beta', 'new user must not auto-join another tenant via preferredTenantId');

  const bInA = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id = ? AND user_id = ?', [
    userA.tenantId,
    userB.userId
  ]);
  assert.equal(bInA?.count ?? 0, 0, 'user B should not have membership in user A tenant');

  await db.run(
    `INSERT INTO family_members (tenant_id, name, relation, birth_date, notes, is_active)
     VALUES (?, 'Kid A', 'child', '2018-01-01', NULL, 1)`,
    [userA.tenantId]
  );

  const visibleToB = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM family_members WHERE tenant_id = ?', [userB.tenantId]);
  assert.equal(visibleToB?.count ?? 0, 0, 'tenant-scoped member data should be isolated');

  fs.rmSync(dbFile, { force: true });
  console.log('tenant-isolation: ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
