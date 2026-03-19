import { evaluateRuntimeEnv } from '@/lib/config/runtime-env';
import fs from 'node:fs';
import path from 'node:path';

type CheckResult = {
  name: string;
  ok: boolean;
  details: string;
};

function loadDotEnvFiles() {
  const cwd = process.cwd();
  const candidates = ['.env', '.env.local'];
  for (const file of candidates) {
    const filePath = path.join(cwd, file);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

async function checkUrl(url: string, name: string, allowStatuses: number[]): Promise<CheckResult> {
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    const ok = allowStatuses.includes(response.status);
    return {
      name,
      ok,
      details: `status=${response.status} url=${url}`
    };
  } catch (error) {
    return {
      name,
      ok: false,
      details: `request failed for ${url}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function printResults(results: CheckResult[]) {
  for (const result of results) {
    const tag = result.ok ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${result.name} - ${result.details}`);
  }
}

function usage() {
  console.log('Usage: npm run smoke:deploy -- [base-url]');
  console.log('Example: npm run smoke:deploy -- https://your-site.netlify.app');
}

async function main() {
  loadDotEnvFiles();

  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  const baseUrlRaw = args[0];
  const baseUrl = baseUrlRaw ? baseUrlRaw.replace(/\/+$/, '') : null;
  const results: CheckResult[] = [];

  const env = evaluateRuntimeEnv();
  results.push({
    name: 'Core environment',
    ok: env.missingCore.length === 0 && env.invalidCore.length === 0,
    details:
      env.missingCore.length || env.invalidCore.length
        ? `missing=[${env.missingCore.join(', ')}] invalid=[${env.invalidCore.join(', ')}]`
        : `${env.mode} env configured`
  });

  results.push({
    name: 'Billing environment',
    ok: !env.billingRequired || (env.missingBilling.length === 0 && env.invalidBilling.length === 0),
    details:
      !env.billingRequired
        ? 'billing not required'
        : env.missingBilling.length || env.invalidBilling.length
          ? `missing=[${env.missingBilling.join(', ')}] invalid=[${env.invalidBilling.join(', ')}]`
          : 'billing env configured'
  });

  if (baseUrl) {
    const targets: Array<Promise<CheckResult>> = [
      checkUrl(`${baseUrl}/api/system/health`, 'Health endpoint (core)', [200]),
      checkUrl(`${baseUrl}/api/system/health?strict=1`, 'Health endpoint (strict)', [200]),
      checkUrl(`${baseUrl}/sign-in`, 'Sign-in page', [200]),
      checkUrl(`${baseUrl}/pricing`, 'Pricing page', [200, 302])
    ];
    const webResults = await Promise.all(targets);
    results.push(...webResults);
  } else {
    results.push({
      name: 'Remote URL checks',
      ok: true,
      details: 'skipped (pass a base URL to run remote checks)'
    });
  }

  printResults(results);
  const failed = results.some((r) => !r.ok);
  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log('Smoke checks passed.');
}

await main();
