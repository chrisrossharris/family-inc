import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { createOrUpdateFamilyMember } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';

const schema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().min(1),
  relation: z.string().min(1),
  birth_date: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.coerce.number().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await createOrUpdateFamilyMember({
    tenantId: session.tenantId,
    id: parsed.data.id,
    name: parsed.data.name,
    relation: parsed.data.relation,
    birthDate: parsed.data.birth_date || null,
    notes: parsed.data.notes || null,
    isActive: parsed.data.is_active ? 1 : 0
  });

  return redirect(`/health?year=${year}&saved=member`, 303);
};
