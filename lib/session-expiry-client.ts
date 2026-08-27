'use client';

import { useEffect } from 'react';
import {
  buildSessionLoginUrl,
  isSessionExpired,
  millisecondsUntilSessionExpiry,
} from '@/lib/session-expiry';

const MAX_TIMEOUT_MS = 2_147_000_000;

export function useSessionExpiry(expiresAt: string, returnTo: string): void {
  useEffect(() => {
    const loginUrl = buildSessionLoginUrl(returnTo);
    const redirect = () => window.location.replace(loginUrl);
    const check = () => {
      if (isSessionExpired(expiresAt)) redirect();
    };
    const remaining = millisecondsUntilSessionExpiry(expiresAt);

    if (remaining === null || remaining === 0) {
      redirect();
      return;
    }

    const timer = window.setTimeout(redirect, Math.min(remaining + 100, MAX_TIMEOUT_MS));
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [expiresAt, returnTo]);
}

export function redirectIfCurrentSessionExpired(expiresAt: string, returnTo: string): boolean {
  if (!isSessionExpired(expiresAt)) return false;
  window.location.replace(buildSessionLoginUrl(returnTo));
  return true;
}
