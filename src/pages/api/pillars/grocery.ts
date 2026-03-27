import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addGroceryItem, inferGroceryCategory, updateGroceryItem } from '@/lib/services/pillars';
import { formOptionalFlag, formOptionalInt, formOptionalNumber, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  id: formOptionalInt({ positive: true }),
  item_name: formTrimmedString(),
  category: z.string().optional(),
  quantity: formOptionalNumber(),
  unit: z.string().optional(),
  needed: formOptionalFlag(),
  last_purchased_on: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const values = Object.fromEntries((await request.formData()).entries());
  const parsed = schema.safeParse(values);
  const fallbackYear = normalizeReportYear(typeof values.year === 'string' ? values.year : undefined);
  if (!parsed.success) return redirect(`/home-groceries?year=${fallbackYear}&error=grocery_invalid`, 303);

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  const normalizedCategory = parsed.data.category?.trim() || inferGroceryCategory(parsed.data.item_name);
  const payload = {
    tenantId: session.tenantId,
    itemName: parsed.data.item_name,
    category: normalizedCategory,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit || null,
    needed: (parsed.data.needed ? 1 : 0) as 0 | 1,
    lastPurchasedOn: parsed.data.last_purchased_on || null,
    notes: parsed.data.notes || null
  };

  try {
    if (parsed.data.id) {
      await updateGroceryItem({
        ...payload,
        id: parsed.data.id
      });
      return redirect(`/home-groceries?year=${year}&saved=grocery_updated`, 303);
    }

    await addGroceryItem(payload);
  } catch {
    return redirect(`/home-groceries?year=${year}&error=grocery_failed`, 303);
  }

  return redirect(`/home-groceries?year=${year}&saved=grocery_created`, 303);
};
