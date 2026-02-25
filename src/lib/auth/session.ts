export const TENANT_COOKIE = 'fi_tenant';
export const USER_COOKIE = 'fi_user';

export interface SessionContext {
  tenantId: string;
  userId: string;
}

export const DEFAULT_SESSION: SessionContext = {
  tenantId: 'demo_workspace',
  userId: 'demo_user'
};

function normalizeId(input: string | undefined | null, fallback: string): string {
  if (!input) return fallback;
  const value = input.trim();
  return value.length > 0 ? value : fallback;
}

export function resolveSessionFromCookies(cookies: {
  get: (name: string) => { value: string } | undefined;
}): SessionContext {
  return {
    tenantId: normalizeId(cookies.get(TENANT_COOKIE)?.value, DEFAULT_SESSION.tenantId),
    userId: normalizeId(cookies.get(USER_COOKIE)?.value, DEFAULT_SESSION.userId)
  };
}

export function resolveSession(locals: Partial<SessionContext> | undefined, cookies: { get: (name: string) => { value: string } | undefined }): SessionContext {
  if (locals?.tenantId && locals?.userId) {
    return {
      tenantId: locals.tenantId,
      userId: locals.userId
    };
  }

  return resolveSessionFromCookies(cookies);
}
