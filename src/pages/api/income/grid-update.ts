import type { APIRoute } from 'astro';
import { resolveSession } from '@/lib/auth/session';
import { updateIncomeReceipt } from '@/lib/services/income';

const VALID_SOURCE_TYPES = new Set(['client_payment', 'gift', 'unemployment', 'food_stamps', 'interest', 'other']);
const VALID_ALLOCATION_ENTITIES = new Set(['chris', 'kate', 'big_picture']);

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const form = await request.formData();
  const idsRaw = String(form.get('ids') ?? '');
  const ids = idsRaw
    .split(',')
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter(Number.isFinite);

  if (ids.length === 0 || ids.length > 500) {
    return new Response(JSON.stringify({ error: 'No valid IDs' }), { status: 400 });
  }

  const session = resolveSession(locals, cookies);
  let updated = 0;
  let invalid = 0;

  for (const id of ids) {
    const receivedDate = String(form.get(`received_date_${id}`) ?? '').trim();
    const sourceType = String(form.get(`source_type_${id}`) ?? '').trim();
    const payerName = String(form.get(`payer_name_${id}`) ?? '').trim();
    const projectName = String(form.get(`project_name_${id}`) ?? '').trim();
    const notes = String(form.get(`notes_${id}`) ?? '').trim();
    const allocationEntity = String(form.get(`allocation_entity_${id}`) ?? '').trim();
    const grossAmount = Number(form.get(`gross_amount_${id}`) ?? NaN);
    const selectedEntity = VALID_ALLOCATION_ENTITIES.has(allocationEntity) ? allocationEntity : 'big_picture';
    const splitChris = selectedEntity === 'chris' ? 100 : 0;
    const splitKate = selectedEntity === 'kate' ? 100 : 0;
    const splitBigPicture = selectedEntity === 'big_picture' ? 100 : 0;
    const valid =
      receivedDate.length >= 10 &&
      payerName.length > 0 &&
      Number.isFinite(grossAmount) &&
      grossAmount > 0;

    if (!valid) {
      invalid += 1;
      continue;
    }

    await updateIncomeReceipt({
      tenantId: session.tenantId,
      id,
      receivedDate,
      sourceType: (VALID_SOURCE_TYPES.has(sourceType) ? sourceType : 'other') as
        | 'client_payment'
        | 'gift'
        | 'unemployment'
        | 'food_stamps'
        | 'interest'
        | 'other',
      payerName,
      projectName: projectName || null,
      grossAmount,
      notes: notes || null,
      splits: [
        { entity: 'chris', percent: splitChris },
        { entity: 'kate', percent: splitKate },
        { entity: 'big_picture', percent: splitBigPicture }
      ]
    });
    updated += 1;
  }

  const referer = request.headers.get('referer');
  const target = referer ? new URL(referer) : new URL('/income', request.url);
  target.searchParams.set('updated', String(updated));
  target.searchParams.set('invalid', String(invalid));
  return redirect(target.pathname + target.search, 303);
};
