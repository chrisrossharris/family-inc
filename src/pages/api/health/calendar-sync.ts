import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { syncHealthCalendarFeed } from '@/lib/services/integrations';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalInt } from '@/lib/validation/form';

const schema = z.object({
  feed_id: formOptionalInt({ positive: true }),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const values = Object.fromEntries((await request.formData()).entries());
  const parsed = schema.safeParse(values);
  const fallbackYear = normalizeReportYear(typeof values.year === 'string' ? values.year : undefined);
  if (!parsed.success || !parsed.data.feed_id) return redirect(`/health?year=${fallbackYear}&error=calendar_sync_invalid`, 303);

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  try {
    const result = await syncHealthCalendarFeed({ tenantId: session.tenantId, feedId: parsed.data.feed_id });
    return redirect(`/health?year=${year}&saved=calendar_sync_${result.inserted}_${result.updated}`, 303);
  } catch {
    return redirect(`/health?year=${year}&error=calendar_sync_failed`, 303);
  }
};
