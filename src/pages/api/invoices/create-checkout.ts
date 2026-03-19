import type { APIRoute } from 'astro';
import { z } from 'zod';
import db from '@/lib/db/connection';
import { resolveSession } from '@/lib/auth/session';
import { normalizeReportYear } from '@/lib/utils/year';
import { getStripeSecretKey } from '@/lib/services/stripe-config';

const schema = z.object({
  year: z.string().optional(),
  invoice_id: z.coerce.number().int().positive()
});

export const POST: APIRoute = async ({ request, redirect, locals, cookies }) => {
  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });

  const stripeSecret = getStripeSecretKey();
  if (!stripeSecret) {
    return new Response(JSON.stringify({ error: 'Missing Stripe secret key env (STRIPE_SECRET_KEY)' }), { status: 500 });
  }

  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(parsed.data.year);
  const invoice = await db.get<{
    id: number;
    invoice_number: string;
    client_name: string;
    project_name: string | null;
    entity: 'chris' | 'kate' | 'big_picture';
    amount_total: number;
    amount_paid: number;
    status: string;
  }>(
    `SELECT
       i.id,
       i.invoice_number,
       i.client_name,
       i.project_name,
       i.entity,
       i.amount_total,
       COALESCE(SUM(p.amount), 0) AS amount_paid,
       i.status
     FROM invoices i
     LEFT JOIN invoice_payments p ON p.invoice_id = i.id
     WHERE i.tenant_id = ? AND i.id = ?
     GROUP BY i.id, i.invoice_number, i.client_name, i.project_name, i.entity, i.amount_total, i.status`,
    [session.tenantId, parsed.data.invoice_id]
  );

  if (!invoice) return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404 });
  if (invoice.status === 'void') return redirect(`/invoices?year=${year}&saved=invoice_void`, 303);

  const outstanding = Math.max(0, invoice.amount_total - invoice.amount_paid);
  if (outstanding <= 0) return redirect(`/invoices?year=${year}&saved=invoice_already_paid`, 303);

  const stripeModule = (await new Function("return import('stripe')")()) as { default: new (key: string) => any };
  const Stripe = stripeModule.default;
  const stripe = new Stripe(stripeSecret);

  const origin = new URL(request.url).origin;
  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: `${origin}/invoices?year=${year}&saved=stripe_checkout_success`,
    cancel_url: `${origin}/invoices?year=${year}&saved=stripe_checkout_cancelled`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(outstanding * 100),
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: `${invoice.client_name}${invoice.project_name ? ` · ${invoice.project_name}` : ''}`
          }
        }
      }
    ],
    metadata: {
      tenant_id: session.tenantId,
      invoice_id: String(invoice.id),
      invoice_number: invoice.invoice_number,
      entity: invoice.entity,
      app_source: 'family_inc'
    },
    payment_intent_data: {
      metadata: {
        tenant_id: session.tenantId,
        invoice_id: String(invoice.id),
        invoice_number: invoice.invoice_number,
        entity: invoice.entity
      }
    }
  });

  if (!checkout.url) return new Response(JSON.stringify({ error: 'Failed to create Stripe Checkout URL' }), { status: 500 });
  return redirect(checkout.url, 303);
};
