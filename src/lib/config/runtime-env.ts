import { z } from 'zod';

type EnvMap = Record<string, string | undefined>;

const clerkPublishableSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('pk_'), 'must start with pk_');

const clerkSecretSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('sk_'), 'must start with sk_');

const stripeSecretSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('sk_'), 'must start with sk_');

const stripePriceSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('price_'), 'must start with price_');

const dbUrlSchema = z.string().min(1);

function normalize(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  return trimmed.length > 0 ? trimmed : null;
}

function envValue(env: EnvMap, key: string): string | null {
  return normalize(env[key]);
}

function readFirst(env: EnvMap, keys: string[]): string | null {
  for (const key of keys) {
    const value = envValue(env, key);
    if (value) return value;
  }
  return null;
}

function getRuntimeEnv(): EnvMap {
  return process.env as EnvMap;
}

function isProductionLike(env: EnvMap): boolean {
  return env.NODE_ENV === 'production' || env.NETLIFY === 'true';
}

export interface RuntimeEnvReport {
  mode: 'development' | 'production';
  ok: boolean;
  missingCore: string[];
  invalidCore: string[];
  missingBilling: string[];
  invalidBilling: string[];
  billingRequired: boolean;
  dbProvider: 'postgres' | 'libsql' | 'sqlite-file' | 'unknown';
}

function detectDbProvider(url: string | null): RuntimeEnvReport['dbProvider'] {
  if (!url) return 'unknown';
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres';
  if (url.startsWith('libsql://') || url.startsWith('https://')) return 'libsql';
  if (url.startsWith('file:') || url.endsWith('.sqlite') || url.endsWith('.db')) return 'sqlite-file';
  return 'unknown';
}

export function evaluateRuntimeEnv(envInput: EnvMap = getRuntimeEnv()): RuntimeEnvReport {
  const env = envInput;
  const missingCore: string[] = [];
  const invalidCore: string[] = [];
  const missingBilling: string[] = [];
  const invalidBilling: string[] = [];

  const publishableKey = readFirst(env, ['PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_PUBLISHABLE_KEY']);
  const clerkSecret = readFirst(env, ['CLERK_SECRET_KEY']);
  const databaseUrl = readFirst(env, [
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'NETLIFY_DATABASE_URL_UNPOOLED',
    'NETLIFY_DATABASE_URL',
    'TURSO_DATABASE_URL'
  ]);

  if (!publishableKey) missingCore.push('PUBLIC_CLERK_PUBLISHABLE_KEY');
  else if (!clerkPublishableSchema.safeParse(publishableKey).success) invalidCore.push('PUBLIC_CLERK_PUBLISHABLE_KEY');

  if (!clerkSecret) missingCore.push('CLERK_SECRET_KEY');
  else if (!clerkSecretSchema.safeParse(clerkSecret).success) invalidCore.push('CLERK_SECRET_KEY');

  if (!databaseUrl) missingCore.push('DATABASE_URL|DATABASE_URL_UNPOOLED|NETLIFY_DATABASE_URL_UNPOOLED|NETLIFY_DATABASE_URL|TURSO_DATABASE_URL');
  else if (!dbUrlSchema.safeParse(databaseUrl).success) invalidCore.push('DATABASE_URL');

  const stripeSecret = readFirst(env, ['STRIPE_SECRET_KEY', 'STRIPE_SECRET', 'NETLIFY_STRIPE_SECRET_KEY']);
  const stripePlus = readFirst(env, ['STRIPE_PRICE_FAMILY_PLUS', 'STRIPE_PRICE_ID_FAMILY_PLUS', 'STRIPE_FAMILY_PLUS_PRICE_ID']);
  const stripePro = readFirst(env, ['STRIPE_PRICE_FAMILY_PRO', 'STRIPE_PRICE_ID_FAMILY_PRO', 'STRIPE_FAMILY_PRO_PRICE_ID']);
  const billingFlag = readFirst(env, ['REQUIRE_STRIPE_BILLING']);
  const billingRequired = billingFlag === '1' || !!stripeSecret || !!stripePlus || !!stripePro;

  if (billingRequired) {
    if (!stripeSecret) missingBilling.push('STRIPE_SECRET_KEY');
    else if (!stripeSecretSchema.safeParse(stripeSecret).success) invalidBilling.push('STRIPE_SECRET_KEY');

    if (!stripePlus) missingBilling.push('STRIPE_PRICE_FAMILY_PLUS');
    else if (!stripePriceSchema.safeParse(stripePlus).success) invalidBilling.push('STRIPE_PRICE_FAMILY_PLUS');

    if (!stripePro) missingBilling.push('STRIPE_PRICE_FAMILY_PRO');
    else if (!stripePriceSchema.safeParse(stripePro).success) invalidBilling.push('STRIPE_PRICE_FAMILY_PRO');
  }

  const mode = isProductionLike(env) ? 'production' : 'development';
  const ok = missingCore.length === 0 && invalidCore.length === 0 && missingBilling.length === 0 && invalidBilling.length === 0;

  return {
    mode,
    ok,
    missingCore,
    invalidCore,
    missingBilling,
    invalidBilling,
    billingRequired,
    dbProvider: detectDbProvider(databaseUrl)
  };
}

export function assertRuntimeEnv(envInput: EnvMap = getRuntimeEnv()) {
  const report = evaluateRuntimeEnv(envInput);
  if (!report.ok) {
    const parts = [
      report.missingCore.length ? `missing core: ${report.missingCore.join(', ')}` : '',
      report.invalidCore.length ? `invalid core: ${report.invalidCore.join(', ')}` : '',
      report.missingBilling.length ? `missing billing: ${report.missingBilling.join(', ')}` : '',
      report.invalidBilling.length ? `invalid billing: ${report.invalidBilling.join(', ')}` : ''
    ].filter(Boolean);
    throw new Error(`Runtime env validation failed (${report.mode}). ${parts.join(' | ')}`);
  }
  return report;
}
