import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addHouseTask, deleteHouseTask, updateHouseTask } from '@/lib/services/pillars';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalInt, formOptionalNumber, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  id: formOptionalInt({ positive: true }),
  asset_id: formOptionalInt({ positive: true }),
  title: formTrimmedString(),
  task_type: z.enum(['inspect', 'service', 'clean', 'repair', 'replace', 'warranty']).optional(),
  cadence_months: formOptionalInt({ min: 0 }),
  last_completed_on: z.string().optional(),
  next_due_on: z.string().optional(),
  status: z.enum(['planned', 'scheduled', 'done', 'skipped']).optional(),
  estimated_cost: formOptionalNumber({ min: 0 }),
  vendor_name: z.string().optional(),
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
    await deleteHouseTask({ tenantId: session.tenantId, id: parsedDelete.data.id });
    return redirect(`/house?year=${year}&saved=house_task_deleted`, 303);
  }

  const parsed = schema.safeParse(values);
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const fallbackYear = parsed.data.next_due_on?.slice(0, 4) || parsed.data.year;
  const year = normalizeReportYear(fallbackYear);
  const payload = {
    tenantId: session.tenantId,
    assetId: parsed.data.asset_id ?? null,
    title: parsed.data.title,
    taskType: parsed.data.task_type,
    cadenceMonths: parsed.data.cadence_months ?? null,
    lastCompletedOn: parsed.data.last_completed_on || null,
    nextDueOn: parsed.data.next_due_on || null,
    status: parsed.data.status,
    estimatedCost: parsed.data.estimated_cost ?? null,
    vendorName: parsed.data.vendor_name || null,
    notes: parsed.data.notes || null
  };

  if (parsed.data.id) {
    await updateHouseTask({ ...payload, id: parsed.data.id });
    return redirect(`/house?year=${year}&saved=house_task_updated`, 303);
  }

  await addHouseTask(payload);
  return redirect(`/house?year=${year}&saved=house_task_created`, 303);
};
