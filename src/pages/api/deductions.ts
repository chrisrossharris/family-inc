import type { APIRoute } from 'astro';
import { z } from 'zod';
import { upsertDeduction } from '@/lib/services/deductions';
import { resolveSession } from '@/lib/auth/session';
import { entityExists } from '@/lib/services/finance-entities';

const bodySchema = z.object({
  entity: z.string().min(1),
  type: z.enum(['home_office', 'mileage', 'phone', 'equipment']),
  payload_json: z.string().min(2).optional(),
  return_to: z.string().min(1).optional()
});

function numericField(form: FormData, key: string, fallback = 0): number {
  const raw = String(form.get(key) ?? '').trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function buildPayloadFromFields(type: 'home_office' | 'mileage' | 'phone' | 'equipment', form: FormData): Record<string, unknown> {
  if (type === 'home_office') {
    return {
      totalSqft: numericField(form, 'totalSqft', 0),
      businessSqft: numericField(form, 'businessSqft', 0),
      mortgageInterest: numericField(form, 'mortgageInterest', 0),
      utilities: numericField(form, 'utilities', 0),
      insurance: numericField(form, 'insurance', 0),
      repairs: numericField(form, 'repairs', 0)
    };
  }
  if (type === 'mileage') {
    return {
      businessMiles: numericField(form, 'businessMiles', 0),
      irsRate: numericField(form, 'irsRate', 0.67)
    };
  }
  if (type === 'phone') {
    return {
      annualCost: numericField(form, 'annualCost', 0),
      businessPct: numericField(form, 'businessPct', 0)
    };
  }
  return {
    totalCost: numericField(form, 'totalCost', 0),
    section179: form.get('section179') === 'on' || form.get('section179') === '1' || form.get('section179') === 'true'
  };
}

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const form = await request.formData();
  const parsed = bodySchema.safeParse(Object.fromEntries(form.entries()));

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  let payload: Record<string, unknown>;
  if (parsed.data.payload_json && parsed.data.payload_json.trim().length > 0) {
    try {
      payload = JSON.parse(parsed.data.payload_json);
    } catch {
      return new Response(JSON.stringify({ error: 'payload_json must be valid JSON' }), { status: 400 });
    }
  } else {
    payload = buildPayloadFromFields(parsed.data.type, form);
  }

  const session = resolveSession(locals, cookies);
  const validEntity = await entityExists(session.tenantId, parsed.data.entity);
  if (!validEntity) {
    return new Response(JSON.stringify({ error: 'Invalid entity' }), { status: 400 });
  }
  await upsertDeduction(session.tenantId, parsed.data.entity, parsed.data.type, payload);

  if (parsed.data.return_to) {
    return redirect(parsed.data.return_to, 303);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' }
  });
};
