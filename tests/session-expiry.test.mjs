import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLoginUrl,
  buildSessionLoginUrl,
  isSessionExpired,
  millisecondsUntilSessionExpiry,
  safeReturnTo,
} from '../lib/session-expiry.ts';

test('solo admite destinos internos seguros después del inicio de sesión', () => {
  assert.equal(safeReturnTo('/platform?section=security#sessions'), '/platform?section=security#sessions');
  assert.equal(safeReturnTo('https://evil.example/platform'), '/');
  assert.equal(safeReturnTo('//evil.example/platform'), '/');
  assert.equal(safeReturnTo('/\\evil.example'), '/');
  assert.equal(safeReturnTo(''), '/');
});

test('construye una URL de reingreso que conserva el destino seguro', () => {
  assert.equal(buildLoginUrl('/platform'), '/login?returnTo=%2Fplatform');
  assert.equal(
    buildSessionLoginUrl('/platform'),
    '/login?reason=session-expired&returnTo=%2Fplatform',
  );
});

test('calcula el vencimiento sin tratar fechas inválidas como sesiones vencidas', () => {
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  assert.equal(isSessionExpired('2026-08-27T11:59:59.999Z', now), true);
  assert.equal(isSessionExpired('2026-08-27T12:00:00.000Z', now), true);
  assert.equal(isSessionExpired('2026-08-27T12:00:01.000Z', now), false);
  assert.equal(isSessionExpired('invalid', now), false);
  assert.equal(millisecondsUntilSessionExpiry('2026-08-27T12:00:01.000Z', now), 1_000);
  assert.equal(millisecondsUntilSessionExpiry('2026-08-27T11:59:59.000Z', now), 0);
  assert.equal(millisecondsUntilSessionExpiry('invalid', now), null);
});
