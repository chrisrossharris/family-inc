import type { APIRoute } from 'astro';
import { z } from 'zod';
import db from '@/lib/db/connection';
import { TENANT_COOKIE } from '@/lib/auth/session';
import { resolveSession } from '@/lib/auth/session';

const schema = z.object({
  tenantId: z.string().min(1),
  returnTo: z.string().optional().default('/')
});

export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const form = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const tenant = await db.get<{ id: string }>(
    'SELECT tenant_id AS id FROM memberships WHERE user_id = ? AND tenant_id = ?',
    [session.userId, parsed.data.tenantId]
  );
  if (!tenant) {
    return new Response(JSON.stringify({ error: 'Unknown tenant' }), { status: 404 });
  }

  const secure = new URL(request.url).protocol === 'https:';
  cookies.set(TENANT_COOKIE, tenant.id, { path: '/', sameSite: 'lax', httpOnly: true, secure });
  return redirect(parsed.data.returnTo, 303);
};
