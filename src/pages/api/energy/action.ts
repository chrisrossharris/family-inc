import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import db from '@/lib/db/connection';
import { addEnergyAction, updateEnergyActionStatus } from '@/lib/services/energy';
import { normalizeReportYear } from '@/lib/utils/year';

const createSchema = z.object({
  year: z.string().optional(),
  action_name: z.string().min(1),
  category: z.enum(['efficiency', 'solar', 'renewable', 'behavior', 'upgrade']),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  estimated_annual_kwh_savings: z.coerce.number().min(0).optional(),
  estimated_annual_cost_savings: z.coerce.number().min(0).optional(),
  estimated_upfront_cost: z.coerce.number().min(0).optional(),
  notes: z.string().optional()
});

const statusSchema = z.object({
  year: z.string().optional(),
  action_id: z.coerce.number().int().min(1),
  status: z.enum(['planned', 'in_progress', 'done', 'skipped'])
});

const recommendationSchema = z.object({
  year: z.string().optional(),
  action_name: z.string().min(1),
  category: z.enum(['efficiency', 'solar', 'renewable', 'behavior', 'upgrade']),
  priority: z.enum(['low', 'medium', 'high']),
  estimated_annual_kwh_savings: z.coerce.number().min(0),
  estimated_annual_cost_savings: z.coerce.number().min(0),
  estimated_upfront_cost: z.coerce.number().min(0),
  notes: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = Object.fromEntries((await request.formData()).entries());
  const mode = String(form.mode || 'create');

  if (mode === 'status') {
    const parsed = statusSchema.safeParse(form);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const session = resolveSession(locals, cookies);
    const year = normalizeReportYear(parsed.data.year);
    await updateEnergyActionStatus({
      tenantId: session.tenantId,
      actionId: parsed.data.action_id,
      status: parsed.data.status
    });

    return redirect(`/energy?year=${year}&saved=action_status`, 303);
  }

  if (mode === 'recommendation') {
    const parsed = recommendationSchema.safeParse(form);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const session = resolveSession(locals, cookies);
    const year = normalizeReportYear(parsed.data.year);

    const existing = await db.get<{ id: number }>(
      `SELECT id
       FROM energy_actions
       WHERE tenant_id = ? AND action_name = ? AND category = ?
       LIMIT 1`,
      [session.tenantId, parsed.data.action_name, parsed.data.category]
    );

    if (!existing) {
      await addEnergyAction({
        tenantId: session.tenantId,
        actionName: parsed.data.action_name,
        category: parsed.data.category,
        priority: parsed.data.priority,
        estimatedAnnualKwhSavings: parsed.data.estimated_annual_kwh_savings,
        estimatedAnnualCostSavings: parsed.data.estimated_annual_cost_savings,
        estimatedUpfrontCost: parsed.data.estimated_upfront_cost,
        notes: parsed.data.notes || null
      });
      return redirect(`/energy?year=${year}&saved=recommendation_added`, 303);
    }

    return redirect(`/energy?year=${year}&saved=recommendation_exists`, 303);
  }

  const parsed = createSchema.safeParse(form);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);

  await addEnergyAction({
    tenantId: session.tenantId,
    actionName: parsed.data.action_name,
    category: parsed.data.category,
    priority: parsed.data.priority,
    estimatedAnnualKwhSavings: parsed.data.estimated_annual_kwh_savings,
    estimatedAnnualCostSavings: parsed.data.estimated_annual_cost_savings,
    estimatedUpfrontCost: parsed.data.estimated_upfront_cost,
    notes: parsed.data.notes || null
  });

  return redirect(`/energy?year=${year}&saved=action`, 303);
};
