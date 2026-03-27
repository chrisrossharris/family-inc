import type { APIRoute } from 'astro';
import { resolveSession } from '@/lib/auth/session';
import { getHouseAssetDocument } from '@/lib/services/integrations';

export const GET: APIRoute = async ({ url, locals, cookies }) => {
  const id = Number(url.searchParams.get('id') ?? 0);
  if (!id) return new Response('Not found', { status: 404 });

  const session = resolveSession(locals, cookies);
  const doc = await getHouseAssetDocument({ tenantId: session.tenantId, id });
  if (!doc) return new Response('Not found', { status: 404 });

  const bytes = doc.blob_data instanceof Uint8Array ? doc.blob_data : new Uint8Array(doc.blob_data);
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': doc.mime_type || 'application/octet-stream',
      'Content-Length': String(doc.file_size),
      'Content-Disposition': `inline; filename="${doc.file_name.replace(/"/g, '')}"`
    }
  });
};
