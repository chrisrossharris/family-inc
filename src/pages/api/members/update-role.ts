import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { countOwners, updateMemberRole } from '@/lib/services/members';
import db from '@/lib/db/connection';
import { requireAnyRole } from '@/lib/auth/authorization';

const schema = z.object({
  user_id: z.string().min(1),
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
  returnTo: z.string().optional().default('/members')
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const forbidden = await requireAnyRole(session.tenantId, session.userId, ['owner', 'admin']);
  if (forbidden) return forbidden;
  const membership = await db.get<{ role: string }>('SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?', [session.tenantId, parsed.data.user_id]);
  if (!membership) {
    return new Response(JSON.stringify({ error: 'Member not found in tenant' }), { status: 404 });
  }

  if (membership.role === 'owner' && parsed.data.role !== 'owner') {
    const owners = await countOwners(session.tenantId);
    if (owners <= 1) {
      const target = new URL(parsed.data.returnTo, request.url);
      target.searchParams.set('error', 'last-owner');
      return redirect(target.pathname + target.search, 303);
    }
  }

  await updateMemberRole(session.tenantId, parsed.data.user_id, parsed.data.role);
  const target = new URL(parsed.data.returnTo, request.url);
  target.searchParams.set('updated', parsed.data.user_id);
  return redirect(target.pathname + target.search, 303);
};
