import assert from 'node:assert/strict';
import test from 'node:test';
import { isStrongPassword, passwordPolicyMessage } from '../lib/password-policy.ts';

test('rechaza contraseñas fuera del rango permitido', () => {
  assert.match(passwordPolicyMessage('Corta1!') ?? '', /entre 12 y 128/);
  assert.match(passwordPolicyMessage(`${'a'.repeat(128)}1!`) ?? '', /entre 12 y 128/);
});

test('exige letras, número y símbolo', () => {
  assert.match(passwordPolicyMessage('solo-letras-largas') ?? '', /número y un símbolo/);
  assert.match(passwordPolicyMessage('123456789012!') ?? '', /letras/);
});

test('acepta una contraseña que cumple toda la política', () => {
  assert.equal(passwordPolicyMessage('Savia-Segura-2026!'), null);
  assert.equal(isStrongPassword('Savia-Segura-2026!'), true);
});
