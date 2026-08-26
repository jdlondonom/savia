import assert from 'node:assert/strict';

const baseUrl = process.env.SAVIA_TEST_URL ?? 'http://localhost:3000';

const health = await fetch(`${baseUrl}/api/health`);
assert.equal(health.status, 200, 'El endpoint de salud debe responder 200.');
assert.equal((await health.json()).status, 'healthy', 'La base local debe estar saludable.');

const home = await fetch(`${baseUrl}/`, { redirect: 'manual' });
assert.equal(home.status, 307, 'El CRM debe exigir una sesión.');
assert.match(home.headers.get('location') ?? '', /^\/login\?returnTo=/, 'El CRM debe redirigir al acceso seguro.');

const platform = await fetch(`${baseUrl}/platform`, { redirect: 'manual' });
assert.equal(platform.status, 307, 'El panel global debe exigir una sesión.');
assert.match(platform.headers.get('location') ?? '', /^\/login\?returnTo=/, 'El panel global debe preservar la ruta solicitada.');

const publicSignup = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'Registro público bloqueado',
    email: 'public-signup-test@example.invalid',
    password: 'Prueba-Segura-123!',
  }),
});
assert.equal(publicSignup.status, 403, 'El registro público debe permanecer deshabilitado.');

const setup = await fetch(`${baseUrl}/setup`, { redirect: 'manual' });
assert.ok([200, 307].includes(setup.status), 'La configuración debe estar disponible o cerrada después del primer administrador.');
if (setup.status === 200) {
  assert.match(await setup.text(), /Superadministrador global/, 'La configuración inicial debe crear un administrador global.');
} else {
  assert.equal(setup.headers.get('location'), '/login', 'La configuración debe cerrarse después del primer administrador.');
}

const demo = await fetch(`${baseUrl}/api/demo/inbound`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ conversationId: 'conv_laura', body: 'Prueba sin sesión.' }),
  redirect: 'manual',
});
assert.equal(demo.status, 307, 'El simulador local no debe aceptar mensajes sin una sesión MFA.');

const webhook = await fetch(`${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=test`);
assert.equal(webhook.status, 410, 'El webhook global debe permanecer deshabilitado.');

const unknownTenantWebhook = await fetch(`${baseUrl}/api/webhooks/whatsapp/no-configurado?hub.mode=subscribe&hub.challenge=test`);
assert.equal(unknownTenantWebhook.status, 404, 'Un webhook de tenant desconocido debe permanecer cerrado.');

const forgotPassword = await fetch(`${baseUrl}/forgot-password`);
assert.equal(forgotPassword.status, 200, 'La recuperación de acceso debe estar disponible.');

assert.match(health.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/, 'Las respuestas deben incluir CSP.');

console.log('Savia OK: salud, autenticación cerrada, recuperación, CSP, panel global y webhooks por tenant.');
