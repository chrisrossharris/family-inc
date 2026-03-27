import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import { addHouseAssetDocument, deleteHouseAssetDocument } from '@/lib/services/integrations';
import { normalizeReportYear } from '@/lib/utils/year';
import { formOptionalInt } from '@/lib/validation/form';

const deleteSchema = z.object({
  id: formOptionalInt({ positive: true }),
  year: z.string().optional()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = await request.formData();
  const mode = String(form.get('mode') ?? 'create');
  const session = resolveSession(locals, cookies);
  const fallbackYear = normalizeReportYear(String(form.get('year') ?? ''));

  if (mode === 'delete') {
    const parsedDelete = deleteSchema.safeParse(Object.fromEntries(form.entries()));
    if (!parsedDelete.success || !parsedDelete.data.id) return redirect(`/house?year=${fallbackYear}&error=document_invalid`, 303);
    await deleteHouseAssetDocument({ tenantId: session.tenantId, id: parsedDelete.data.id });
    return redirect(`/house?year=${normalizeReportYear(parsedDelete.data.year)}&saved=document_deleted`, 303);
  }

  const assetId = Number(form.get('asset_id') ?? 0);
  const notes = String(form.get('notes') ?? '').trim();
  const year = normalizeReportYear(String(form.get('year') ?? ''));
  const file = form.get('file');

  if (!assetId || !(file instanceof File) || file.size === 0) {
    return redirect(`/house?year=${year}&error=document_invalid`, 303);
  }
  if (file.size > 8 * 1024 * 1024) {
    return redirect(`/house?year=${year}&error=document_too_large`, 303);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  await addHouseAssetDocument({
    tenantId: session.tenantId,
    assetId,
    fileName: file.name,
    mimeType: file.type || null,
    fileSize: file.size,
    blobData: bytes,
    notes: notes || null
  });

  return redirect(`/house?year=${year}&saved=document_uploaded`, 303);
};
