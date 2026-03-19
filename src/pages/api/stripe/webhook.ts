import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';
import { addInvoicePayment } from '@/lib/services/invoices';
import { insertIgnore } from '@/lib/db/sql-dialect';
import { getTenantBilling, planFromPriceId, upsertTenantBilling, type PlanKey, type SubscriptionStatus } from '@/lib/services/billing';
import { getStripeSecretKey, getStripeWebhookSecret } from '@/lib/services/stripe-config';

export const prerender = false;

function isoFromUnix(ts: number | null | undefined): string {
  if (!ts) return new Date().toISOString().slice(0, 10);
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function hasProcessedEvent(eventId: string): Promise<boolean> {
  const row = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM stripe_webhook_events WHERE event_id = ?', [eventId]);
  return (row?.count ?? 0) > 0;
}

async function markEventProcessed(eventId: string, eventType: string): Promise<boolean> {
  const result = await db.run(
    insertIgnore(
      `INSERT OR IGNORE INTO stripe_webhook_events (event_id, event_type, processed_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      `INSERT INTO stripe_webhook_events (event_id, event_type, processed_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (event_id) DO NOTHING`
    ),
    [eventId, eventType]
  );
  return result.changes > 0;
}

async function resolveTenantIdForSubscription(customerId: string | null, subscriptionId: string | null): Promise<string | null> {
  if (subscriptionId) {
    const bySub = await db.get<{ tenant_id: string }>('SELECT tenant_id FROM tenant_billing WHERE stripe_subscription_id = ?', [subscriptionId]);
    if (bySub?.tenant_id) return bySub.tenant_id;
  }
  if (customerId) {
    const byCustomer = await db.get<{ tenant_id: string }>('SELECT tenant_id FROM tenant_billing WHERE stripe_customer_id = ?', [customerId]);
    if (byCustomer?.tenant_id) return byCustomer.tenant_id;
  }
  return null;
}

function normalizeSubscriptionStatus(value: string): SubscriptionStatus {
  const valid: SubscriptionStatus[] = ['inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'];
  return (valid.includes(value as SubscriptionStatus) ? value : 'inactive') as SubscriptionStatus;
}

export const POST: APIRoute = async ({ request }) => {
  const stripeSecret = getStripeSecretKey();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripeSecret || !webhookSecret) {
    return new Response('Stripe is not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const payload = await request.text();
  const stripeModule = (await new Function("return import('stripe')")()) as { default: new (key: string) => any };
  const Stripe = stripeModule.default;
  const stripe = new Stripe(stripeSecret);

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    return new Response(`Invalid signature: ${String(error)}`, { status: 400 });
  }

  const alreadyProcessed = await hasProcessedEvent(event.id);
  if (alreadyProcessed) return new Response(JSON.stringify({ ok: true, deduped: true }), { headers: { 'content-type': 'application/json' } });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as {
      id: string;
      mode?: string;
      amount_total?: number | null;
      created?: number | null;
      customer?: string | null;
      subscription?: string | null;
      payment_intent?: string | null;
      metadata?: Record<string, string>;
    };

    if (session.metadata?.app_source === 'family_inc_subscription') {
      const tenantId = session.metadata?.tenant_id;
      if (tenantId) {
        const plan = (session.metadata?.plan_key as PlanKey | undefined) ?? 'family_plus';
        await upsertTenantBilling({
          tenantId,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
          stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
          planKey: plan,
          subscriptionStatus: 'active',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: 0
        });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    }

    const tenantId = session.metadata?.tenant_id;
    const invoiceIdRaw = session.metadata?.invoice_id;
    const invoiceId = Number(invoiceIdRaw ?? NaN);

    if (tenantId && Number.isFinite(invoiceId) && invoiceId > 0) {
      const amount = (session.amount_total ?? 0) / 100;
      if (amount > 0) {
        await addInvoicePayment({
          tenantId,
          invoiceId,
          receivedOn: isoFromUnix(session.created),
          amount,
          method: 'stripe',
          reference: session.id,
          notes: 'Stripe Checkout',
          stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null
        });
      }
    }
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as {
      id: string;
      customer?: string | null;
      status: string;
      cancel_at_period_end?: boolean;
      current_period_end?: number | null;
      metadata?: Record<string, string>;
      items?: { data?: Array<{ price?: { id?: string | null } }> };
    };

    const customerId = typeof sub.customer === 'string' ? sub.customer : null;
    const subscriptionId = sub.id;
    const tenantFromMeta = sub.metadata?.tenant_id ?? null;
    const tenantId = tenantFromMeta || (await resolveTenantIdForSubscription(customerId, subscriptionId));
    if (tenantId) {
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      const fromPrice = planFromPriceId(priceId);
      const existing = await getTenantBilling(tenantId);
      const planKey: PlanKey =
        (sub.metadata?.plan_key as PlanKey | undefined) ??
        fromPrice ??
        (event.type === 'customer.subscription.deleted' ? 'starter' : existing.plan_key);
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : normalizeSubscriptionStatus(sub.status);
      await upsertTenantBilling({
        tenantId,
        stripeCustomerId: customerId ?? existing.stripe_customer_id,
        stripeSubscriptionId: event.type === 'customer.subscription.deleted' ? null : subscriptionId,
        planKey: status === 'canceled' ? 'starter' : planKey,
        subscriptionStatus: status,
        currentPeriodEnd: isoFromUnix(sub.current_period_end),
        cancelAtPeriodEnd: sub.cancel_at_period_end ? 1 : 0
      });
    }
  }

  await markEventProcessed(event.id, event.type);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
