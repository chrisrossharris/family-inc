import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { deleteHealthCalendarFeed, upsertHealthCalendarFeed } from '@/lib/services/integrations';
import { ensureFamilyCalendarMember } from '@/lib/services/health';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalFlag, formOptionalInt, formTrimmedString } from '@/lib/validation/form';

const schema = z.object({
  id: formOptionalInt({ positive: true }),
  feed_name: formTrimmedString(),
  ical_url: z.string().trim().url(),
  default_member_id: z.string().trim().min(1),
  active: formOptionalFlag(),
  year: z.string().optional()
});

const deleteSchema = z.object({
  id: formOptionalInt({ positive: true }),
  year: z.string().optional()
});

function normalizeCalendarUrl(url: string) {
  return url.trim().replace(/^webcal:\/\//i, 'https://');
}

export const GET: APIRoute = async ({ redirect, url }) => redirect(`/health?year=${normalizeReportYear(url.searchParams.get('year'))}`, 303);

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  let fallbackYear = normalizeReportYear(undefined);

  try {
    const values = Object.fromEntries((await request.formData()).entries());
    const mode = typeof values.mode === 'string' ? values.mode : 'create';
    fallbackYear = normalizeReportYear(typeof values.year === 'string' ? values.year : undefined);
    const session = resolveSession(locals, cookies);

    if (mode === 'delete') {
      const parsedDelete = deleteSchema.safeParse(values);
      if (!parsedDelete.success || !parsedDelete.data.id) return redirect(`/health?year=${fallbackYear}&error=calendar_feed_invalid`, 303);
      await deleteHealthCalendarFeed({ tenantId: session.tenantId, id: parsedDelete.data.id });
      return redirect(`/health?year=${normalizeReportYear(parsedDelete.data.year)}&saved=calendar_feed_deleted`, 303);
    }

    const parsed = schema.safeParse(values);
    if (!parsed.success) return redirect(`/health?year=${fallbackYear}&error=calendar_feed_invalid`, 303);

    const defaultMemberId =
      parsed.data.default_member_id === 'family_calendar'
        ? await ensureFamilyCalendarMember(session.tenantId)
        : Number(parsed.data.default_member_id);
    if (!Number.isFinite(defaultMemberId) || defaultMemberId <= 0) {
      return redirect(`/health?year=${fallbackYear}&error=calendar_feed_invalid`, 303);
    }

    await upsertHealthCalendarFeed({
      tenantId: session.tenantId,
      id: parsed.data.id,
      feedName: parsed.data.feed_name,
      icalUrl: normalizeCalendarUrl(parsed.data.ical_url),
      defaultMemberId,
      active: parsed.data.active ? 1 : 0
    });

    return redirect(`/health?year=${normalizeReportYear(parsed.data.year)}&saved=calendar_feed_saved`, 303);
  } catch {
    return redirect(`/health?year=${fallbackYear}&error=calendar_feed_failed`, 303);
  }
};
