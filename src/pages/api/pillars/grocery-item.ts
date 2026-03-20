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
  const form = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  const fallbackYear = normalizeReportYear(String(form.get('year') ?? ''));
  const errorTarget = new URL('/home-groceries', request.url);
  errorTarget.searchParams.set('year', fallbackYear);
  errorTarget.searchParams.set('error', 'grocery_item_invalid');
  if (!parsed.success) return redirect(errorTarget.pathname + errorTarget.search, 303);

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  try {
    await setGroceryItemNeeded({
      tenantId: session.tenantId,
      itemId: parsed.data.id,
      needed: parsed.data.needed ? 1 : 0
    });
  } catch {
    return redirect(errorTarget.pathname + errorTarget.search, 303);
  }

  return redirect(`/home-groceries?year=${year}&saved=grocery_item`, 303);
};
