import type { APIRoute } from 'astro';
import { resolveSession } from '@/lib/auth/session';
import { getTenantBilling } from '@/lib/services/billing';
import { getStripeSecretKey } from '@/lib/services/stripe-config';

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const stripeSecret = getStripeSecretKey();
  if (!stripeSecret) return new Response(JSON.stringify({ error: 'Missing Stripe secret key env (STRIPE_SECRET_KEY)' }), { status: 500 });

  const session = resolveSession(locals, cookies);
  const billing = await getTenantBilling(session.tenantId);
  if (!billing.stripe_customer_id) return redirect('/pricing?saved=no_stripe_customer', 303);

  const stripeModule = (await new Function("return import('stripe')")()) as { default: new (key: string) => any };
  const Stripe = stripeModule.default;
  const stripe = new Stripe(stripeSecret);
  const origin = new URL(request.url).origin;

  const portal = await stripe.billingPortal.sessions.create({
    customer: billing.stripe_customer_id,
    return_url: `${origin}/pricing?saved=portal_return`
  });

  return redirect(portal.url, 303);
};
