import db from '@/lib/db/connection';

export type FinanceEntityKind = 'person' | 'business';

export interface FinanceEntity {
  id: number;
  tenant_id: string;
  code: string;
  name: string;
  kind: FinanceEntityKind;
  owner_user_id: string | null;
  ownership_type: string | null;
  ownership_percent: number;
  tax_classification: string | null;
  notes: string | null;
  is_active: 0 | 1;
  is_default: 0 | 1;
  created_at: string;
  updated_at: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function firstWord(value: string): string {
  return value.split(/\s+/).filter(Boolean)[0] ?? value;
}

function dedupeCode(base: string, taken: Set<string>): string {
  const normalized = slugify(base) || 'entity';
  if (!taken.has(normalized)) return normalized;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${normalized}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${normalized}_${Date.now()}`;
}

export async function listFinanceEntities(tenantId: string, options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive === true;
  const where = includeInactive ? 'tenant_id = ?' : 'tenant_id = ? AND is_active = 1';
  const rows = await db.all<FinanceEntity>(
    `SELECT id, tenant_id, code, name, kind, owner_user_id, ownership_type, ownership_percent, tax_classification, notes, is_active, is_default, created_at, updated_at
     FROM finance_entities
     WHERE ${where}
     ORDER BY is_default DESC, kind ASC, name ASC`,
    [tenantId]
  );
  return rows;
}

export async function listFinanceEntityOptions(tenantId: string) {
  const rows = await listFinanceEntities(tenantId);
  return rows.map((row) => ({ code: row.code, label: row.name, kind: row.kind, isDefault: row.is_default === 1 }));
}

export async function entityExists(tenantId: string, code: string) {
  const row = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM finance_entities WHERE tenant_id = ? AND code = ? AND is_active = 1', [
    tenantId,
    code
  ]);
  return (row?.count ?? 0) > 0;
}

export async function getDefaultEntityCode(tenantId: string) {
  const row = await db.get<{ code: string }>(
    `SELECT code
     FROM finance_entities
     WHERE tenant_id = ? AND is_active = 1
     ORDER BY is_default DESC, kind ASC, name ASC
     LIMIT 1`,
    [tenantId]
  );
  return row?.code ?? 'big_picture';
}

async function createEntity(input: {
  tenantId: string;
  code: string;
  name: string;
  kind: FinanceEntityKind;
  ownerUserId?: string | null;
  ownershipType?: string | null;
  ownershipPercent?: number;
  taxClassification?: string | null;
  notes?: string | null;
  isDefault?: 0 | 1;
}) {
  await db.run(
    `INSERT INTO finance_entities
      (tenant_id, code, name, kind, owner_user_id, ownership_type, ownership_percent, tax_classification, notes, is_active, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      input.tenantId,
      input.code,
      input.name,
      input.kind,
      input.ownerUserId ?? null,
      input.ownershipType ?? null,
      input.ownershipPercent ?? 100,
      input.taxClassification ?? null,
      input.notes ?? null,
      input.isDefault ?? 0
    ]
  );
}

export async function ensureFinanceEntitiesForTenant(tenantId: string) {
  const existing = await listFinanceEntities(tenantId, { includeInactive: true });
  const taken = new Set(existing.map((row) => row.code));

  const legacyRows = await db.all<{ entity: string }>(
    `SELECT DISTINCT entity
     FROM transactions
     WHERE tenant_id = ? AND TRIM(COALESCE(entity, '')) <> ''`,
    [tenantId]
  );

  for (const row of legacyRows) {
    const code = slugify(row.entity);
    if (!code || taken.has(code)) continue;
    await createEntity({
      tenantId,
      code,
      name: row.entity.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
      kind: code === 'big_picture' ? 'business' : 'person',
      isDefault: code === 'big_picture' ? 1 : 0
    });
    taken.add(code);
  }

  const members = await db.all<{ user_id: string; display_name: string }>(
    `SELECT m.user_id, u.display_name
     FROM memberships m
     INNER JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id = ?
     ORDER BY u.display_name ASC`,
    [tenantId]
  );

  for (const member of members) {
    const preferred = slugify(firstWord(member.display_name));
    const code = dedupeCode(preferred || member.user_id, taken);
    const owned = await db.get<{ id: number; code: string }>(
      `SELECT id, code
       FROM finance_entities
       WHERE tenant_id = ? AND owner_user_id = ? AND kind = ?
       ORDER BY id ASC
       LIMIT 1`,
      [tenantId, member.user_id, 'person']
    );
    if (owned?.id) {
      taken.add(owned.code);
      continue;
    }

    const claimable = await db.get<{ id: number; code: string }>(
      `SELECT id, code
       FROM finance_entities
       WHERE tenant_id = ?
         AND kind = 'person'
         AND owner_user_id IS NULL
         AND (
           code = ?
           OR LOWER(name) = LOWER(?)
           OR LOWER(name) = LOWER(?)
         )
       ORDER BY
         CASE
           WHEN code = ? THEN 0
           WHEN LOWER(name) = LOWER(?) THEN 1
           ELSE 2
         END,
         is_default DESC,
         id ASC
       LIMIT 1`,
      [tenantId, preferred, member.display_name, firstWord(member.display_name), preferred, member.display_name]
    );

    if (claimable?.id) {
      await db.run(
        `UPDATE finance_entities
         SET owner_user_id = ?, name = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [member.user_id, member.display_name, claimable.id]
      );
      taken.add(claimable.code);
      continue;
    }

    await createEntity({
      tenantId,
      code,
      name: member.display_name,
      kind: 'person',
      ownerUserId: member.user_id
    });
    taken.add(code);
  }

  const businessCount = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM finance_entities WHERE tenant_id = ? AND kind = ?', [tenantId, 'business']);
  if ((businessCount?.count ?? 0) === 0) {
    const code = dedupeCode('big_picture', taken);
    await createEntity({
      tenantId,
      code,
      name: 'Big Picture',
      kind: 'business',
      ownershipType: 'joint_venture',
      isDefault: 1
    });
    taken.add(code);
  }

  const defaultCount = await db.get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM finance_entities WHERE tenant_id = ? AND is_active = 1 AND is_default = 1',
    [tenantId]
  );
  if ((defaultCount?.count ?? 0) === 0) {
    const first = await db.get<{ id: number }>(
      `SELECT id
       FROM finance_entities
       WHERE tenant_id = ? AND is_active = 1
       ORDER BY kind ASC, name ASC
       LIMIT 1`,
      [tenantId]
    );
    if (first?.id) {
      await db.run('UPDATE finance_entities SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?', [
        first.id,
        tenantId
      ]);
    }
  }
}

export async function addFinanceEntity(input: {
  tenantId: string;
  name: string;
  kind: FinanceEntityKind;
  ownerUserId?: string | null;
  ownershipType?: string | null;
  ownershipPercent?: number;
  taxClassification?: string | null;
  notes?: string | null;
}) {
  const existing = await listFinanceEntities(input.tenantId, { includeInactive: true });
  const taken = new Set(existing.map((row) => row.code));
  const code = dedupeCode(input.name, taken);

  await createEntity({
    tenantId: input.tenantId,
    code,
    name: input.name,
    kind: input.kind,
    ownerUserId: input.ownerUserId ?? null,
    ownershipType: input.ownershipType ?? null,
    ownershipPercent: input.ownershipPercent ?? 100,
    taxClassification: input.taxClassification ?? null,
    notes: input.notes ?? null
  });
}
