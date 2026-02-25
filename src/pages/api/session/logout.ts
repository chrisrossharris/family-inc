import type { APIRoute } from 'astro';
import { TENANT_COOKIE, USER_COOKIE } from '@/lib/auth/session';

export const POST: APIRoute = async ({ cookies, redirect, request }) => {
  cookies.delete(TENANT_COOKIE, { path: '/' });
  cookies.delete(USER_COOKIE, { path: '/' });
  const next = new URL('/', request.url);
  return redirect(next.pathname, 303);
};
