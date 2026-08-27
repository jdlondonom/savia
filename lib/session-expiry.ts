export const SESSION_EXPIRED_REASON = 'session-expired';

export function safeReturnTo(value?: string | null, fallback = '/'): string {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback;
  }

  try {
    const base = new URL('https://savia.invalid');
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function buildSessionLoginUrl(returnTo?: string | null): string {
  const safeDestination = safeReturnTo(returnTo);
  return `/login?reason=${SESSION_EXPIRED_REASON}&returnTo=${encodeURIComponent(safeDestination)}`;
}

export function buildLoginUrl(returnTo?: string | null): string {
  return `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

export function isSessionExpired(expiresAt: string, now = Date.now()): boolean {
  const expiration = Date.parse(expiresAt);
  return Number.isFinite(expiration) && expiration <= now;
}

export function millisecondsUntilSessionExpiry(expiresAt: string, now = Date.now()): number | null {
  const expiration = Date.parse(expiresAt);
  return Number.isFinite(expiration) ? Math.max(0, expiration - now) : null;
}
