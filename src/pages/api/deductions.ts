import type { APIRoute } from 'astro';
import { z } from 'zod';
import { upsertDeduction } from '@/lib/services/deductions';

const bodySchema = z.object({
  entity: z.enum(['chris', 'kate', 'big_picture']),
  type: z.enum(['home_office', 'mileage', 'phone', 'equipment']),
  payload_json: z.string().min(2)
});

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const parsed = bodySchema.safeParse(Object.fromEntries(form.entries()));

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(parsed.data.payload_json);
  } catch {
    return new Response(JSON.stringify({ error: 'payload_json must be valid JSON' }), { status: 400 });
  }

  await upsertDeduction(parsed.data.entity, parsed.data.type, payload);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' }
  });
};
