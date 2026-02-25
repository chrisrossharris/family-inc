import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addSupportContact } from '@/lib/services/children';

const schema = z.object({
  member_id: z.coerce.number().min(1),
  contact_name: z.string().min(1),
  role: z.string().min(1),
  organization: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await addSupportContact({
    tenantId: session.tenantId,
    memberId: parsed.data.member_id,
    contactName: parsed.data.contact_name,
    role: parsed.data.role,
    organization: parsed.data.organization || null,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    notes: parsed.data.notes || null
  });

  return redirect(`/children?year=${year}&saved=contact`, 303);
};
