import db from '@/lib/db/connection';
import { getStripePriceFamilyPlus, getStripePriceFamilyPro } from '@/lib/services/stripe-config';

export type PlanKey = 'starter' | 'family_plus' | 'family_pro';
export type SubscriptionStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';

export interface PlanSpec {
  key: PlanKey;
  name: string;
  description: string;
  monthlyLabel: string;
  features: string[];
  envPriceKey: string;
}

export const PLAN_SPECS: PlanSpec[] = [
  {
    key: 'starter',
    name: 'Starter',
    description: 'Core family operating dashboard.',
    monthlyLabel: '$0',
    features: ['Core finance + family pillars', 'Manual imports/exports', 'Shared workspace'],
    envPriceKey: ''
  },
  {
    key: 'family_plus',
    name: 'Family Plus',
    description: 'Automation and premium reporting for serious operators.',
    monthlyLabel: '$29/mo',
    features: ['Advanced reports', 'Priority reminders', 'Premium exports + history'],
    envPriceKey: 'STRIPE_PRICE_FAMILY_PLUS'
  },
  {
    key: 'family_pro',
    name: 'Family Pro',
    description: 'Full operating system with growth tooling.',
    monthlyLabel: '$79/mo',
    features: ['Everything in Plus', 'Deep analytics + forecasting', 'Priority support'],
    envPriceKey: 'STRIPE_PRICE_FAMILY_PRO'
  }
];

export interface TenantBillingRow {
  tenant_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_key: PlanKey;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: 0 | 1;
  updated_at: string;
}

export async function getTenantBilling(tenantId: string): Promise<TenantBillingRow> {
  const row = await db.get<TenantBillingRow>(
    `SELECT tenant_id, stripe_customer_id, stripe_subscription_id, plan_key, subscription_status, current_period_end, cancel_at_period_end, updated_at
     FROM tenant_billing
     WHERE tenant_id = ?`,
    [tenantId]
  );
  if (row) return row;

  await db.run(
    `INSERT INTO tenant_billing (tenant_id, plan_key, subscription_status, cancel_at_period_end, updated_at)
     VALUES (?, 'starter', 'inactive', 0, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );

  return (
    (await db.get<TenantBillingRow>(
      `SELECT tenant_id, stripe_customer_id, stripe_subscription_id, plan_key, subscription_status, current_period_end, cancel_at_period_end, updated_at
       FROM tenant_billing
       WHERE tenant_id = ?`,
      [tenantId]
    )) ?? {
      tenant_id: tenantId,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      plan_key: 'starter',
      subscription_status: 'inactive',
      current_period_end: null,
      cancel_at_period_end: 0,
      updated_at: new Date().toISOString()
    }
  );
}

export async function upsertTenantBilling(input: {
  tenantId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  planKey: PlanKey;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: 0 | 1;
}) {
  await db.run(
    `INSERT INTO tenant_billing (tenant_id, stripe_customer_id, stripe_subscription_id, plan_key, subscription_status, current_period_end, cancel_at_period_end, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id)
     DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       plan_key = excluded.plan_key,
       subscription_status = excluded.subscription_status,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.tenantId,
      input.stripeCustomerId ?? null,
      input.stripeSubscriptionId ?? null,
      input.planKey,
      input.subscriptionStatus,
      input.currentPeriodEnd ?? null,
      input.cancelAtPeriodEnd ?? 0
    ]
  );
}

export function hasPremiumAccess(billing: TenantBillingRow): boolean {
  const active = new Set<SubscriptionStatus>(['trialing', 'active', 'past_due']);
  if (billing.plan_key === 'starter') return false;
  return active.has(billing.subscription_status);
}

export function planFromPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  if (getStripePriceFamilyPlus() && priceId === getStripePriceFamilyPlus()) return 'family_plus';
  if (getStripePriceFamilyPro() && priceId === getStripePriceFamilyPro()) return 'family_pro';
  return null;
}
