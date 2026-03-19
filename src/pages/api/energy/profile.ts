import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { upsertEnergyProfile } from '@/lib/services/energy';
import { normalizeReportYear } from '@/lib/utils/year';

const optionalNumber = (min: number) =>
  z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(min).optional()
  );

const optionalInt = (min: number) =>
  z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(min).optional()
  );

const schema = z.object({
  year: z.string().optional(),
  home_sqft: optionalNumber(0),
  occupants: optionalInt(0),
  utility_rate_per_kwh: optionalNumber(0),
  target_monthly_kwh: optionalNumber(0),
  roof_solar_score: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).max(10).optional()
  ),
  owns_home: z.coerce.number().optional(),
  has_solar: z.coerce.number().optional(),
  green_utility_plan: z.coerce.number().optional(),
  notes: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  await upsertEnergyProfile({
    tenantId: session.tenantId,
    homeSqft: parsed.data.home_sqft,
    occupants: parsed.data.occupants,
    utilityRatePerKwh: parsed.data.utility_rate_per_kwh,
    targetMonthlyKwh: parsed.data.target_monthly_kwh,
    roofSolarScore: parsed.data.roof_solar_score,
    ownsHome: parsed.data.owns_home ? 1 : 0,
    hasSolar: parsed.data.has_solar ? 1 : 0,
    greenUtilityPlan: parsed.data.green_utility_plan ? 1 : 0,
    notes: parsed.data.notes || null
  });

  return redirect(`/energy?year=${year}&saved=profile`, 303);
};
