import type { APIRoute } from 'astro';
import { z } from 'zod';
import db from '@/lib/db/connection';
import { resolveSession } from '@/lib/auth/session';
import { SCHEDULE_C_CATEGORIES } from '@/lib/constants';

const bodySchema = z.object({
  ids: z.string().min(1),
  category: z.string().min(1).optional(),
  entity: z.enum(['chris', 'kate', 'big_picture']).optional(),
  vendor: z.string().min(1).optional(),
  description: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = await request.formData();
  const parsed = bodySchema.safeParse(Object.fromEntries(form.entries()));

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const ids = parsed.data.ids
    .split(',')
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter(Number.isFinite);

  if (ids.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid IDs' }), { status: 400 });
  }

  const updates: string[] = [];
  const params: Array<string | number> = [];

  if (parsed.data.category) {
    if (!SCHEDULE_C_CATEGORIES.includes(parsed.data.category as (typeof SCHEDULE_C_CATEGORIES)[number])) {
      return new Response(JSON.stringify({ error: 'Invalid category' }), { status: 400 });
    }
    updates.push('category = ?');
    params.push(parsed.data.category);
  }

  if (parsed.data.entity) {
    updates.push('entity = ?');
    params.push(parsed.data.entity);
  }

  if (parsed.data.vendor) {
    updates.push('vendor = ?');
    params.push(parsed.data.vendor.trim());
  }

  if (parsed.data.description !== undefined) {
    updates.push('description = ?');
    params.push(parsed.data.description.trim());
  }

  if (parsed.data.category || parsed.data.entity) {
    updates.push("confidence = 'high'");
  }

  if (updates.length === 0) {
    return new Response(JSON.stringify({ error: 'No update fields provided' }), { status: 400 });
  }

  const placeholders = ids.map(() => '?').join(',');
  const sql = `UPDATE transactions SET ${updates.join(', ')} WHERE tenant_id = ? AND id IN (${placeholders})`;
  const result = await db.run(sql, [...params, session.tenantId, ...ids]);

  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, updated: result.changes }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  const referer = request.headers.get('referer');
  const target = referer ? new URL(referer) : new URL('/needs-review', request.url);
  target.searchParams.set('updated', String(result.changes));
  return redirect(target.pathname + target.search, 303);
};
