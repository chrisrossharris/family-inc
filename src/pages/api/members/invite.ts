import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { createInvitation } from '@/lib/services/members';
import { requireAnyRole } from '@/lib/auth/authorization';

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

  const target = new URL(parsed.data.returnTo, request.url);
  target.searchParams.set('invited', parsed.data.email);
  return redirect(target.pathname + target.search, 303);
};
