import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { DEFAULT_SESSION, TENANT_COOKIE, USER_COOKIE } from '@/lib/auth/session';
import { resolveAppWorkspace } from '@/lib/services/auth-sync';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/_astro(.*)',
  '/favicon.ico',
  '/api/session/logout'
]);

function withSecurityHeaders(response: Response, secure: boolean) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (secure) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  return response;
}

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  const requestMethod = context.request.method.toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(requestMethod);
  if (isMutation) {
    const origin = context.request.headers.get('origin');
    const referer = context.request.headers.get('referer');
    const sameOrigin = origin === context.url.origin || (!!referer && referer.startsWith(context.url.origin));
    if (!sameOrigin) {
      return new Response(JSON.stringify({ error: 'CSRF validation failed' }), { status: 403 });
    }
  }

  const { userId, redirectToSignIn } = auth();
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
  const email = user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.familyinc.local`;
  const displayName = user?.fullName ?? user?.username ?? 'Family Inc User';
  const orgId = (auth() as { orgId?: string | null }).orgId;
  const orgName = (auth() as { orgName?: string | null }).orgName;

  const tenantId = await resolveAppWorkspace({
    userId,
    email,
    displayName,
    clerkOrgId: orgId,
    clerkOrgName: orgName,
    preferredTenantId: context.cookies.get(TENANT_COOKIE)?.value
  });

  context.locals.tenantId = tenantId;
  context.locals.userId = userId;

  context.cookies.set(TENANT_COOKIE, tenantId, { path: '/', sameSite: 'lax', httpOnly: true, secure });
  context.cookies.set(USER_COOKIE, userId, { path: '/', sameSite: 'lax', httpOnly: true, secure });

  return withSecurityHeaders(await next(), secure);
});
