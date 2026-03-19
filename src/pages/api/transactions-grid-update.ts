import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';
import { resolveSession } from '@/lib/auth/session';
import { SCHEDULE_C_CATEGORIES } from '@/lib/constants';
import { listFinanceEntityOptions } from '@/lib/services/finance-entities';

const VALID_CATEGORIES = new Set(SCHEDULE_C_CATEGORIES);

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = await request.formData();
  const idsRaw = String(form.get('ids') ?? '');
  const ids = idsRaw
    .split(',')
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter(Number.isFinite);

  if (ids.length === 0 || ids.length > 1000) {
    return new Response(JSON.stringify({ error: 'No valid IDs' }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const validEntities = new Set((await listFinanceEntityOptions(session.tenantId)).map((entity) => entity.code));
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const id of ids) {
      const vendor = String(form.get(`vendor_${id}`) ?? '').trim();
      const description = String(form.get(`description_${id}`) ?? '').trim();
      const category = String(form.get(`category_${id}`) ?? '').trim();
      const entity = String(form.get(`entity_${id}`) ?? '').trim();

      if (!vendor || !category || !validEntities.has(entity) || !VALID_CATEGORIES.has(category as (typeof SCHEDULE_C_CATEGORIES)[number])) continue;

      const result = await tx.run(
        `UPDATE transactions
         SET vendor = ?, description = ?, category = ?, entity = ?
         WHERE tenant_id = ? AND id = ?
           AND (
             vendor <> ?
             OR COALESCE(description, '') <> ?
             OR category <> ?
             OR entity <> ?
           )`,
        [vendor, description, category, entity, session.tenantId, id, vendor, description, category, entity]
      );

      updated += result.changes;
    }
  });

  const referer = request.headers.get('referer');
  const target = referer ? new URL(referer) : new URL('/needs-review', request.url);
  target.searchParams.set('updated', String(updated));
  return redirect(target.pathname + target.search, 303);
};
