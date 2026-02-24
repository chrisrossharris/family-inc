import type { APIRoute } from 'astro';
import { z } from 'zod';
import db from '@/lib/db/connection';
import { applyRuleRetroactively } from '@/lib/services/categorizer';

const bodySchema = z.object({
  match_type: z.enum(['exact', 'contains', 'regex']),
  match_value: z.string().min(1),
  entity: z.enum(['chris', 'kate', 'big_picture']),
  category: z.string().min(1),
  deductible_flag: z.coerce.number().transform((v) => (v ? 1 : 0)),
  notes: z.string().optional().nullable(),
  apply_retroactively: z.coerce.number().optional().default(1)
});

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const parsed = bodySchema.safeParse(Object.fromEntries(form.entries()));

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const payload = parsed.data;
  const result = await db.run(
    `INSERT INTO vendor_rules (match_type, match_value, entity, category, deductible_flag, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      payload.match_type,
      payload.match_value.toLowerCase().trim(),
      payload.entity,
      payload.category,
      payload.deductible_flag,
      payload.notes ?? null
    ]
  );

  const ruleId = result.lastInsertRowid ?? 0;
  const updatedRows = payload.apply_retroactively ? await applyRuleRetroactively(ruleId) : 0;

  return new Response(JSON.stringify({ ok: true, ruleId, updatedRows }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};
