import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { DEFAULT_SESSION, TENANT_COOKIE, USER_COOKIE } from '@/lib/auth/session';
import { resolveAppWorkspace } from '@/lib/services/auth-sync';
import { getMembershipRole, type MembershipRole } from '@/lib/auth/authorization';
import { getTenantBilling, hasPremiumAccess } from '@/lib/services/billing';
import { assertRuntimeEnv, evaluateRuntimeEnv } from '@/lib/config/runtime-env';
import { ensureFinanceEntitiesForTenant } from '@/lib/services/finance-entities';

const normalizedClerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim() || process.env.PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
if (normalizedClerkPublishableKey) {
  process.env.CLERK_PUBLISHABLE_KEY = normalizedClerkPublishableKey;
  process.env.PUBLIC_CLERK_PUBLISHABLE_KEY = normalizedClerkPublishableKey;
}

const startupEnv = evaluateRuntimeEnv();
if (startupEnv.mode === 'production') {
  const envForStartup = {
    ...process.env,
    REQUIRE_STRIPE_BILLING: ''
  };
  assertRuntimeEnv(envForStartup);
} else if (!startupEnv.ok) {
  const details = [
    startupEnv.missingCore.length ? `missing core: ${startupEnv.missingCore.join(', ')}` : '',
    startupEnv.invalidCore.length ? `invalid core: ${startupEnv.invalidCore.join(', ')}` : '',
    startupEnv.missingBilling.length ? `missing billing: ${startupEnv.missingBilling.join(', ')}` : '',
    startupEnv.invalidBilling.length ? `invalid billing: ${startupEnv.invalidBilling.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join(' | ');
  if (details) console.warn(`[env] Development env check warnings: ${details}`);
}

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/_astro(.*)',
  '/favicon.ico',
  '/api/system/health',
  '/api/session/logout',
  '/api/stripe/webhook'
]);

function withSecurityHeaders(response: Response, secure: boolean) {
  const next = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });
  next.headers.set('X-Content-Type-Options', 'nosniff');
  next.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next.headers.set('X-Frame-Options', 'DENY');
  next.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (secure) {
    next.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  return next;
}

function requiredWriteRoles(pathname: string): MembershipRole[] | null {
  if (!pathname.startsWith('/api/')) return null;
  if (pathname.startsWith('/api/session/')) return null;
  if (pathname === '/api/import-jobs/run') return null;
  if (pathname === '/api/stripe/webhook') return null;
  if (pathname.startsWith('/api/billing/')) return ['owner', 'admin'];
  if (pathname.startsWith('/api/members/')) return ['owner', 'admin'];
  return ['owner', 'admin', 'editor'];
}

function requiresPremium(pathname: string): boolean {
  if (pathname === '/annual-report') return true;
  if (pathname === '/settings/tenant-health') return true;
  if (pathname.startsWith('/api/exports/')) return true;
  return false;
}

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  const requestMethod = context.request.method.toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(requestMethod);
  const csrfExemptPaths = new Set(['/api/stripe/webhook', '/api/session/switch-tenant', '/api/session/accessibility', '/api/session/logout']);
  const csrfExempt = csrfExemptPaths.has(context.url.pathname);
  if (isMutation) {
    const origin = context.request.headers.get('origin');
    const referer = context.request.headers.get('referer');
    const secFetchSite = context.request.headers.get('sec-fetch-site');
    const sameOrigin =
      origin === context.url.origin ||
      (!!referer && referer.startsWith(context.url.origin)) ||
      secFetchSite === 'same-origin' ||
      secFetchSite === 'same-site';
    if (csrfExempt) {
      // webhook requests originate from Stripe, not browser.
    } else if (!sameOrigin) {
      return new Response(JSON.stringify({ error: 'CSRF validation failed' }), { status: 403 });
    }
  }

  const authState = auth();
  const { userId, redirectToSignIn } = authState;
  const secure = context.url.protocol === 'https:';

  if (!userId && !isPublicRoute(context.request)) {
    return redirectToSignIn({ returnBackUrl: context.url.toString() });
  }

  if (!userId) {
    context.locals.tenantId = DEFAULT_SESSION.tenantId;
    context.locals.userId = DEFAULT_SESSION.userId;
    return withSecurityHeaders(await next(), secure);
  }

  const user = await context.locals.currentUser();
  const claimedEmail =
    (authState as { sessionClaims?: { email?: unknown; primary_email_address?: unknown } }).sessionClaims?.email ??
    (authState as { sessionClaims?: { email?: unknown; primary_email_address?: unknown } }).sessionClaims?.primary_email_address;
  const claimEmailString = typeof claimedEmail === 'string' ? claimedEmail : null;
  const email = user?.primaryEmailAddress?.emailAddress ?? claimEmailString ?? `${userId}@users.familyinc.local`;
  const displayName = user?.fullName ?? user?.username ?? 'Family Inc User';
  const orgId = (auth() as { orgId?: string | null }).orgId;
  const orgName = (auth() as { orgName?: string | null }).orgName;

  const cookieTenantId = context.cookies.get(TENANT_COOKIE)?.value ?? null;
  // Prefer the tenant cookie regardless of user-cookie parity; membership checks
  // in resolveAppWorkspace prevent selecting unauthorized workspaces.
  const preferredTenantId = cookieTenantId;

  const workspace = await resolveAppWorkspace({
    userId,
    email,
    displayName,
    clerkOrgId: orgId,
    clerkOrgName: orgName,
    preferredTenantId
  });

  context.locals.tenantId = workspace.tenantId;
  context.locals.userId = workspace.userId;
  await ensureFinanceEntitiesForTenant(workspace.tenantId);

  context.cookies.set(TENANT_COOKIE, workspace.tenantId, { path: '/', sameSite: 'lax', httpOnly: true, secure });
  context.cookies.set(USER_COOKIE, workspace.userId, { path: '/', sameSite: 'lax', httpOnly: true, secure });

  if (requiresPremium(context.url.pathname)) {
    const billing = await getTenantBilling(workspace.tenantId);
    if (!hasPremiumAccess(billing)) {
      if (context.url.pathname.startsWith('/api/')) {
        return withSecurityHeaders(new Response(JSON.stringify({ error: 'Upgrade required', code: 'upgrade_required' }), { status: 402 }), secure);
      }
      const redirectUrl = new URL('/pricing', context.url);
      redirectUrl.searchParams.set('upgrade', '1');
      redirectUrl.searchParams.set('returnTo', context.url.pathname + context.url.search);
      return withSecurityHeaders(Response.redirect(redirectUrl.toString(), 303), secure);
    }
  }

  const rolesRequired = isMutation ? requiredWriteRoles(context.url.pathname) : null;
  if (rolesRequired) {
    const role = await getMembershipRole(workspace.tenantId, workspace.userId);
    if (!role || !rolesRequired.includes(role)) {
      return withSecurityHeaders(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }), secure);
    }
  }

  return withSecurityHeaders(await next(), secure);
});
