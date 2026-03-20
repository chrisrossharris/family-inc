import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addEnergyBill } from '@/lib/services/energy';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalNumber, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  year: z.string().optional(),
  bill_month: z.string().trim().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  provider_name: formTrimmedString(),
  source_type: z.enum(['electricity', 'gas', 'water', 'solar', 'other']),
  kwh_used: formOptionalNumber({ min: 0 }),
  cost_amount: formOptionalNumber({ min: 0 }),
  peak_kwh: formOptionalNumber({ min: 0 }),
  off_peak_kwh: formOptionalNumber({ min: 0 }),
  renewable_pct: formOptionalNumber({ min: 0, max: 100 }),
  solar_export_kwh: formOptionalNumber({ min: 0 }),
  notes: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  const fallbackYear = normalizeReportYear(String(form.get('year') ?? ''));
  const errorTarget = new URL('/energy', request.url);
  errorTarget.searchParams.set('year', fallbackYear);
  errorTarget.searchParams.set('error', 'bill_invalid');

  if (!parsed.success) {
    return redirect(errorTarget.pathname + errorTarget.search, 303);
  }

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  try {
    await addEnergyBill({
      tenantId: session.tenantId,
      billMonth: parsed.data.bill_month,
      providerName: parsed.data.provider_name,
      sourceType: parsed.data.source_type,
      kwhUsed: parsed.data.kwh_used,
      costAmount: parsed.data.cost_amount,
      peakKwh: parsed.data.peak_kwh,
      offPeakKwh: parsed.data.off_peak_kwh,
      renewablePct: parsed.data.renewable_pct,
      solarExportKwh: parsed.data.solar_export_kwh,
      notes: parsed.data.notes || null
    });
  } catch {
    return redirect(errorTarget.pathname + errorTarget.search, 303);
  }

  return redirect(`/energy?year=${year}&saved=bill`, 303);
};
