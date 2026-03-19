import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { createInvitation } from '@/lib/services/members';
import { requireAnyRole } from '@/lib/auth/authorization';
import db from '@/lib/db/connection';
import { sendWorkspaceInviteEmail } from '@/lib/services/invite-email';

const schema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
  returnTo: z.string().optional().default('/members')
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const forbidden = await requireAnyRole(session.tenantId, session.userId, ['owner', 'admin']);
  if (forbidden) return forbidden;
  await createInvitation(session.tenantId, session.userId, parsed.data.email, parsed.data.role);

  const [tenant, inviter] = await Promise.all([
    db.get<{ name: string }>('SELECT name FROM tenants WHERE id = ?', [session.tenantId]),
    db.get<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', [session.userId])
  ]);
  const emailResult = await sendWorkspaceInviteEmail({
    to: parsed.data.email,
    workspaceName: tenant?.name ?? session.tenantId,
    role: parsed.data.role,
    inviterName: inviter?.display_name ?? 'A workspace owner'
  });

  const target = new URL(parsed.data.returnTo, request.url);
  target.searchParams.set('invited', parsed.data.email);
  if (!emailResult.sent) {
    target.searchParams.set('inviteEmail', 'failed');
    target.searchParams.set('inviteError', emailResult.reason);
    console.error('[invite-email] send failed', emailResult.reason);
  } else {
    target.searchParams.set('inviteEmail', 'sent');
  }
  return redirect(target.pathname + target.search, 303);
};
