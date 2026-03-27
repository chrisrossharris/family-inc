import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addHouseAsset, deleteHouseAsset, updateHouseAsset } from '@/lib/services/pillars';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalInt, formOptionalNumber, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  id: formOptionalInt({ positive: true }),
  asset_name: formTrimmedString(),
  asset_type: z.enum(['system', 'appliance', 'fixture', 'exterior', 'safety', 'other']),
  category: formTrimmedString(),
  location: z.string().optional(),
  install_date: z.string().optional(),
  purchase_date: z.string().optional(),
  warranty_expires: z.string().optional(),
  expected_lifespan_years: formOptionalInt({ min: 0 }),
  condition_status: z.enum(['good', 'watch', 'repair_now', 'replace_soon']).optional(),
  replacement_priority: z.enum(['low', 'medium', 'high']).optional(),
  vendor_name: z.string().optional(),
  model_number: z.string().optional(),
  serial_number: z.string().optional(),
  replacement_cost: formOptionalNumber({ min: 0 }),
  notes: z.string().optional(),
  year: z.string().optional()
});

const deleteSchema = z.object({
  id: formOptionalInt({ positive: true }),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const values = Object.fromEntries((await request.formData()).entries());
  const mode = typeof values.mode === 'string' ? values.mode : 'create';
  if (mode === 'delete') {
    const parsedDelete = deleteSchema.safeParse(values);
    if (!parsedDelete.success || !parsedDelete.data.id) return new Response(JSON.stringify({ error: parsedDelete.error?.flatten() }), { status: 400 });

    const session = resolveSession(locals, cookies);
    const year = normalizeReportYear(parsedDelete.data.year);
    await deleteHouseAsset({ tenantId: session.tenantId, id: parsedDelete.data.id });
    return redirect(`/house?year=${year}&saved=house_asset_deleted`, 303);
  }

  const parsed = schema.safeParse(values);
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  const payload = {
    tenantId: session.tenantId,
    assetName: parsed.data.asset_name,
    assetType: parsed.data.asset_type,
    category: parsed.data.category,
    location: parsed.data.location || null,
    installDate: parsed.data.install_date || null,
    purchaseDate: parsed.data.purchase_date || null,
    warrantyExpires: parsed.data.warranty_expires || null,
    expectedLifespanYears: parsed.data.expected_lifespan_years ?? null,
    conditionStatus: parsed.data.condition_status,
    replacementPriority: parsed.data.replacement_priority,
    vendorName: parsed.data.vendor_name || null,
    modelNumber: parsed.data.model_number || null,
    serialNumber: parsed.data.serial_number || null,
    replacementCost: parsed.data.replacement_cost ?? null,
    notes: parsed.data.notes || null
  };

  if (parsed.data.id) {
    await updateHouseAsset({ ...payload, id: parsed.data.id });
    return redirect(`/house?year=${year}&saved=house_asset_updated`, 303);
  }

  await addHouseAsset(payload);
  return redirect(`/house?year=${year}&saved=house_asset_created`, 303);
};
