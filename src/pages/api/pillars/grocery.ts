import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addGroceryItem, updateGroceryItem } from '@/lib/services/pillars';

const schema = z.object({
  id: z.coerce.number().int().positive().optional(),
  item_name: z.string().min(1),
  category: z.string().min(1),
  quantity: z.coerce.number().optional(),
  unit: z.string().optional(),
  needed: z.coerce.number().optional(),
  last_purchased_on: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  if (parsed.data.id) {
    await updateGroceryItem({
      tenantId: session.tenantId,
      id: parsed.data.id,
      itemName: parsed.data.item_name,
      category: parsed.data.category,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit || null,
      needed: parsed.data.needed ? 1 : 0,
      lastPurchasedOn: parsed.data.last_purchased_on || null,
      notes: parsed.data.notes || null
    });
    return redirect(`/home-groceries?year=${year}&saved=grocery_updated`, 303);
  }

  await addGroceryItem({
    tenantId: session.tenantId,
    itemName: parsed.data.item_name,
    category: parsed.data.category,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit || null,
    needed: parsed.data.needed ? 1 : 0,
    lastPurchasedOn: parsed.data.last_purchased_on || null,
    notes: parsed.data.notes || null
  });

  return redirect(`/home-groceries?year=${year}&saved=grocery_created`, 303);
};
