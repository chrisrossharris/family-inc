import type { APIRoute } from 'astro';
import { z } from 'zod';
import db from '@/lib/db/connection';
import { applyRuleRetroactively } from '@/lib/services/categorizer';
import { resolveSession } from '@/lib/auth/session';
import { entityExists } from '@/lib/services/finance-entities';

const bodySchema = z.object({
  match_type: z.enum(['exact', 'contains', 'regex']),
  match_value: z.string().min(1),
  entity: z.string().min(1),
  category: z.string().min(1),
  deductible_flag: z.coerce.number().transform((v) => (v ? 1 : 0)),
  notes: z.string().optional().nullable(),
  apply_retroactively: z.coerce.number().optional().default(1)
});

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const form = await request.formData();
  const parsed = bodySchema.safeParse(Object.fromEntries(form.entries()));

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const payload = parsed.data;
  const validEntity = await entityExists(session.tenantId, payload.entity);
  if (!validEntity) {
    return new Response(JSON.stringify({ error: 'Invalid entity' }), { status: 400 });
  }
  const result = await db.run(
    `INSERT INTO vendor_rules (tenant_id, match_type, match_value, entity, category, deductible_flag, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      session.tenantId,
      payload.match_type,
      payload.match_value.toLowerCase().trim(),
      payload.entity,
      payload.category,
      payload.deductible_flag,
      payload.notes ?? null
    ]
  );

  const ruleId = result.lastInsertRowid ?? 0;
  const updatedRows = payload.apply_retroactively ? await applyRuleRetroactively(session.tenantId, ruleId) : 0;

  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, ruleId, updatedRows }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  const referer = request.headers.get('referer');
  const target = referer ? new URL(referer) : new URL('/needs-review', request.url);
  target.searchParams.set('ruleSaved', '1');
  target.searchParams.set('updatedRows', String(updatedRows));
  return redirect(target.pathname + target.search, 303);
};
