function normalizeSecret(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^['\"]|['\"]$/g, '');
  return trimmed.length > 0 ? trimmed : null;
}

function envValue(key: string): string | undefined {
  const processValue = process.env[key];
  if (typeof processValue === 'string' && processValue.length > 0) return processValue;
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  return viteEnv[key];
}

function readFirst(keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeSecret(envValue(key));
    if (value) return value;
  }
  return null;
}

export function getStripeSecretKey(): string | null {
  return readFirst(['STRIPE_SECRET_KEY', 'STRIPE_SECRET', 'NETLIFY_STRIPE_SECRET_KEY']);
}

export function getStripeWebhookSecret(): string | null {
  return readFirst(['STRIPE_WEBHOOK_SECRET', 'STRIPE_ENDPOINT_SECRET', 'NETLIFY_STRIPE_WEBHOOK_SECRET']);
}

export function getStripePriceFamilyPlus(): string | null {
  return readFirst(['STRIPE_PRICE_FAMILY_PLUS', 'STRIPE_PRICE_ID_FAMILY_PLUS', 'STRIPE_FAMILY_PLUS_PRICE_ID']);
}

export function getStripePriceFamilyPro(): string | null {
  return readFirst(['STRIPE_PRICE_FAMILY_PRO', 'STRIPE_PRICE_ID_FAMILY_PRO', 'STRIPE_FAMILY_PRO_PRICE_ID']);
}
