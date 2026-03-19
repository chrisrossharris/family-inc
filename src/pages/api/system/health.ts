import type { APIRoute } from 'astro';
import { evaluateRuntimeEnv } from '@/lib/config/runtime-env';
import db from '@/lib/db/connection';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const strict = url.searchParams.get('strict') === '1';
  const env = evaluateRuntimeEnv();

  let databaseOk = false;
  let databaseError: string | null = null;
  try {
    const row = await db.get<{ ok: number }>('SELECT 1 as ok');
    databaseOk = (row?.ok ?? 0) === 1;
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error);
  }

  const envOk = strict ? env.ok : env.missingCore.length === 0 && env.invalidCore.length === 0;
  const ok = envOk && databaseOk;
  const status = ok ? 200 : 503;

  return new Response(
    JSON.stringify(
      {
        status: ok ? 'ok' : 'error',
        checkedAt: new Date().toISOString(),
        mode: env.mode,
        checks: {
          env: {
            ok: envOk,
            strict,
            missingCore: env.missingCore,
            invalidCore: env.invalidCore,
            billingRequired: env.billingRequired,
            missingBilling: env.missingBilling,
            invalidBilling: env.invalidBilling
          },
          database: {
            ok: databaseOk,
            provider: env.dbProvider,
            error: databaseError
          }
        }
      },
      null,
      2
    ),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  );
};
