import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addGroceryReceiptFromText, deleteGroceryReceipt, updateGroceryReceipt } from '@/lib/services/pillars';

const createSchema = z.object({
  store_name: z.string().optional(),
  purchased_on: z.string().min(10),
  total_amount: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(0).optional()),
  source_type: z.enum(['manual', 'ocr_text', 'integration']).optional(),
  raw_text: z.string().min(1),
  notes: z.string().optional(),
  year: z.string().optional()
});

const updateSchema = z.object({
  id: z.coerce.number().int().positive(),
  store_name: z.string().optional(),
  purchased_on: z.string().min(10),
  total_amount: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(0).optional()),
  source_type: z.enum(['manual', 'ocr_text', 'integration']).optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

const deleteSchema = z.object({
  id: z.coerce.number().int().positive(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = Object.fromEntries((await request.formData()).entries());
  const mode = typeof form.mode === 'string' ? form.mode : 'create';
  const session = resolveSession(locals, cookies);

  if (mode === 'delete') {
    const parsed = deleteSchema.safeParse(form);
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    const year = normalizeReportYear(parsed.data.year);
    await deleteGroceryReceipt({ tenantId: session.tenantId, id: parsed.data.id, autoDeleteEmptyItems: false });
    return redirect(`/home-groceries?year=${year}&saved=receipt_deleted`, 303);
  }

  if (mode === 'update') {
    const parsed = updateSchema.safeParse(form);
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    const year = normalizeReportYear(parsed.data.year);
    await updateGroceryReceipt({
      tenantId: session.tenantId,
      id: parsed.data.id,
      storeName: parsed.data.store_name || null,
      purchasedOn: parsed.data.purchased_on,
      totalAmount: parsed.data.total_amount,
      sourceType: parsed.data.source_type ?? 'manual',
      notes: parsed.data.notes || null
    });
    return redirect(`/home-groceries?year=${year}&saved=receipt_updated`, 303);
  }

  const parsed = createSchema.safeParse(form);
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const year = normalizeReportYear(parsed.data.year);
  const result = await addGroceryReceiptFromText({
    tenantId: session.tenantId,
    storeName: parsed.data.store_name || null,
    purchasedOn: parsed.data.purchased_on,
    totalAmount: parsed.data.total_amount,
    rawText: parsed.data.raw_text,
    sourceType: parsed.data.source_type ?? 'ocr_text',
    notes: parsed.data.notes || null
  });

  return redirect(`/home-groceries?year=${year}&saved=receipt_${result.parsedCount}`, 303);
};
