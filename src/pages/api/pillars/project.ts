import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { addFamilyProject, updateFamilyProject } from '@/lib/services/pillars';
import { formOptionalInt, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  id: formOptionalInt({ positive: true }),
  title: formTrimmedString(),
  owner_name: z.string().optional(),
  status: z.enum(['active', 'on_hold', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  if (parsed.data.id) {
    await updateFamilyProject({
      tenantId: session.tenantId,
      id: parsed.data.id,
      title: parsed.data.title,
      ownerName: parsed.data.owner_name || null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      dueDate: parsed.data.due_date || null,
      notes: parsed.data.notes || null
    });
    return redirect(`/goals-projects?year=${year}&saved=project_updated`, 303);
  }

  await addFamilyProject({
    tenantId: session.tenantId,
    title: parsed.data.title,
    ownerName: parsed.data.owner_name || null,
    status: parsed.data.status,
    priority: parsed.data.priority,
    dueDate: parsed.data.due_date || null,
    notes: parsed.data.notes || null
  });

  return redirect(`/goals-projects?year=${year}&saved=project_created`, 303);
};
