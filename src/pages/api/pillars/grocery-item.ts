import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { setGroceryItemNeeded } from '@/lib/services/pillars';

const schema = z.object({
  id: z.coerce.number().int().min(1),
  needed: z.coerce.number().min(0).max(1),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  await setGroceryItemNeeded({
    tenantId: session.tenantId,
    itemId: parsed.data.id,
    needed: parsed.data.needed ? 1 : 0
  });

  return redirect(`/home-groceries?year=${year}&saved=grocery_item`, 303);
};
