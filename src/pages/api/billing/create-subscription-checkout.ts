import type { APIRoute } from 'astro';
import { z } from 'zod';
import { resolveSession } from '@/lib/auth/session';
import db from '@/lib/db/connection';
import { getTenantBilling } from '@/lib/services/billing';
import { getStripePriceFamilyPlus, getStripePriceFamilyPro, getStripeSecretKey } from '@/lib/services/stripe-config';

const schema = z.object({
  plan: z.enum(['family_plus', 'family_pro']),
  returnTo: z.string().optional().default('/pricing')
});

function priceForPlan(plan: 'family_plus' | 'family_pro'): string | null {
  if (plan === 'family_plus') return getStripePriceFamilyPlus();
  if (plan === 'family_pro') return getStripePriceFamilyPro();
  return null;
}

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const stripeSecret = getStripeSecretKey();
  if (!stripeSecret) return new Response(JSON.stringify({ error: 'Missing Stripe secret key env (STRIPE_SECRET_KEY)' }), { status: 500 });

  const priceId = priceForPlan(parsed.data.plan);
  if (!priceId) {
    const expected =
      parsed.data.plan === 'family_plus'
        ? 'STRIPE_PRICE_FAMILY_PLUS (or STRIPE_PRICE_ID_FAMILY_PLUS)'
        : 'STRIPE_PRICE_FAMILY_PRO (or STRIPE_PRICE_ID_FAMILY_PRO)';
    return new Response(JSON.stringify({ error: `Missing Stripe price for ${parsed.data.plan}. Set ${expected}` }), { status: 500 });
  }

  const session = resolveSession(locals, cookies);
  const billing = await getTenantBilling(session.tenantId);
  const tenant = await db.get<{ name: string }>('SELECT name FROM tenants WHERE id = ?', [session.tenantId]);

  const stripeModule = (await new Function("return import('stripe')")()) as { default: new (key: string) => any };
  const Stripe = stripeModule.default;
  const stripe = new Stripe(stripeSecret);

  const origin = new URL(request.url).origin;
  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: billing.stripe_customer_id ?? undefined,
    success_url: `${origin}/pricing?saved=subscription_checkout_success`,
    cancel_url: `${origin}/pricing?saved=subscription_checkout_cancelled`,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      app_source: 'family_inc_subscription',
      tenant_id: session.tenantId,
      plan_key: parsed.data.plan
    },
    subscription_data: {
      metadata: {
        app_source: 'family_inc_subscription',
        tenant_id: session.tenantId,
        plan_key: parsed.data.plan
      }
    },
    client_reference_id: session.tenantId,
    custom_text: {
      submit: {
        message: `Workspace: ${tenant?.name ?? session.tenantId}`
      }
    }
  });

  if (!checkout.url) return new Response(JSON.stringify({ error: 'Failed to create Stripe Checkout session' }), { status: 500 });
  return redirect(checkout.url, 303);
};
