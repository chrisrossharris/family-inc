import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addFinanceEntity } from '@/lib/services/finance-entities';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalNumber, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  name: formTrimmedString(),
  kind: z.enum(['person', 'business']),
  ownership_type: z.string().optional(),
  ownership_percent: formOptionalNumber({ min: 0, max: 100 }),
  tax_classification: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  await addFinanceEntity({
    tenantId: session.tenantId,
    name: parsed.data.name.trim(),
    kind: parsed.data.kind,
    ownershipType: parsed.data.ownership_type || null,
    ownershipPercent: parsed.data.ownership_percent,
    taxClassification: parsed.data.tax_classification || null,
    notes: parsed.data.notes || null
  });

  return redirect(`/settings?year=${year}&saved=finance_entity`, 303);
};
