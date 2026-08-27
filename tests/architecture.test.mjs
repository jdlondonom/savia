import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('producción falla cerrada si un tenant no tiene recursos dedicados', async () => {
  const source = await read('lib/tenant-database.ts');
  const environment = await read('lib/environment.ts');
  assert.match(source, /requiresDedicatedTenantData/);
  assert.match(environment, /SAVIA_ENVIRONMENT/);
  assert.match(environment, /SAVIA_REQUIRE_DEDICATED_TENANT_DATA/);
  assert.match(source, /no está aprovisionado en recursos dedicados/);
  assert.match(source, /no tiene un registro de recursos dedicados/);
  assert.match(source, /índice vectorial dedicado/);
});

test('los servicios de negocio usan el plano de datos del tenant', async () => {
  for (const path of [
    'lib/repository.ts',
    'lib/rag.ts',
    'lib/assistant.ts',
    'lib/conversation-service.ts',
  ]) {
    const source = await read(path);
    assert.match(source, /tenantDb(All|First|Run|Batch)/, `${path} debe usar acceso por tenant`);
    assert.doesNotMatch(source, /from '@\/lib\/database'.*db(All|First|Run|Batch)/s, `${path} no debe saltar el plano de datos`);
  }
});

test('la aceptación de invitaciones mantiene separados control y datos del tenant', async () => {
  const actions = await read('app/auth-actions.ts');
  const inviteForm = await read('app/invite/[token]/invite-form.tsx');
  const start = actions.indexOf('export async function acceptInvitationAction');
  const end = actions.indexOf('async function assertAppEmailAvailable');
  const acceptance = actions.slice(start, end);
  assert.match(acceptance, /platformAudit/);
  assert.match(acceptance, /tenantDbRun/);
  assert.match(acceptance, /invitation\.tenant_audit\.deferred/);
  assert.doesNotMatch(acceptance, /writes\.push\(\{\s*sql: `INSERT INTO audit_logs/s);
  assert.match(inviteForm, /passwordPolicyMessage/);
  assert.match(inviteForm, /minLength=\{PASSWORD_MIN_LENGTH\}/);
});

test('el webhook verifica firma antes de interpretar el JSON', async () => {
  const source = await read('app/api/webhooks/whatsapp/[webhookKey]/route.ts');
  const signature = source.indexOf('verifyMetaSignature');
  const parse = source.indexOf('JSON.parse');
  assert.ok(signature >= 0 && parse > signature);
  assert.match(source, /integration_events/);
  assert.match(source, /SAVIA_EVENTS/);
  assert.match(source, /MAX_WEBHOOK_BYTES/);
  assert.match(source, /readBodyWithLimit/);
});

test('MFA, Turnstile y recuperación permanecen habilitados', async () => {
  const auth = await read('lib/auth.ts');
  assert.match(auth, /twoFactor\(/);
  assert.match(auth, /accountLockout/);
  assert.match(auth, /cloudflare-turnstile/);
  assert.match(auth, /sendResetPassword/);
  assert.match(auth, /revokeSessionsOnPasswordReset: true/);
  assert.match(auth, /BETTER_AUTH_SECRET de al menos 32 caracteres es obligatorio fuera del entorno local/);
  assert.match(auth, /cf-connecting-ip/);
  const actions = await read('app/auth-actions.ts');
  assert.match(actions, /SAVIA_BOOTSTRAP_TOKEN/);
  assert.match(actions, /constantTimeEqual/);
});

test('las sesiones vencidas se recuperan sin exponer errores internos', async () => {
  const session = await read('lib/session.ts');
  const dashboard = await read('app/dashboard.tsx');
  const platform = await read('app/platform/platform-dashboard.tsx');
  const login = await read('app/login/page.tsx');
  const errorPage = await read('app/error.tsx');
  const maintenance = await read('workers/maintenance.ts');
  assert.match(session, /buildLoginUrl/);
  assert.match(dashboard, /useSessionExpiry/);
  assert.match(dashboard, /redirectIfCurrentSessionExpired/);
  assert.match(platform, /useSessionExpiry/);
  assert.match(platform, /redirectIfCurrentSessionExpired/);
  assert.match(login, /Tu sesión terminó por seguridad/);
  assert.match(errorPage, /Volver a iniciar sesión/);
  assert.match(maintenance, /purgeExpiredAuthSessions/);
  assert.match(maintenance, /auth\.sessions\.expired_purged/);
});

test('los encabezados de seguridad se aplican en la capa de petición', async () => {
  const proxy = await read('proxy.ts');
  const headers = await read('lib/security-headers.ts');
  assert.match(proxy, /securityHeaders\(\)/);
  assert.match(proxy, /matcher: '\/:path\*'/);
  assert.match(headers, /Content-Security-Policy/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Strict-Transport-Security/);
});

test('migraciones de control y tenant incluyen las defensas críticas', async () => {
  const controlBase = await read('migrations/control/0001_control_plane.sql');
  const control = await read('migrations/control/0002_production_control_plane.sql');
  const tenant = await read('migrations/tenant/0001_data_plane.sql');
  assert.match(controlBase, /CREATE TABLE auth_users/);
  assert.doesNotMatch(controlBase, /CREATE TABLE (contacts|messages|appointments)/);
  for (const table of ['tenant_resources', 'tenant_channel_settings', 'integration_events', 'tenant_retention_settings']) {
    assert.match(control, new RegExp(`CREATE TABLE ${table}`));
  }
  for (const table of ['appointment_slots', 'calendar_blackouts', 'catalog_chunks', 'privacy_requests', 'outbox_events']) {
    assert.match(tenant, new RegExp(`CREATE TABLE ${table}`));
  }
});

test('las migraciones crean planos nuevos, completos y físicamente separados', async () => {
  const control = new DatabaseSync(':memory:');
  control.exec(await read('migrations/control/0001_control_plane.sql'));
  control.exec(await read('migrations/control/0002_production_control_plane.sql'));
  assert.equal(control.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_resources'").get()?.name, 'tenant_resources');
  assert.equal(control.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").get(), undefined);
  assert.ok(control.prepare("SELECT name FROM pragma_table_info('tenant_ai_settings') WHERE name='monthly_cost_limit_cents'").get());
  control.close();

  const tenant = new DatabaseSync(':memory:');
  tenant.exec(await read('migrations/tenant/0001_data_plane.sql'));
  assert.equal(tenant.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").get()?.name, 'messages');
  assert.equal(tenant.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_users'").get(), undefined);
  tenant.close();
});

test('producción no crea ni modifica el esquema durante una petición', async () => {
  const source = await read('lib/database.ts');
  const environment = await read('lib/environment.ts');
  const guard = source.indexOf('if (!allowRuntimeMigrations)');
  const schema = source.indexOf('const schemaStatements');
  assert.ok(guard >= 0 && schema > guard);
  assert.match(source, /allowsRuntimeMigrations/);
  assert.match(environment, /SAVIA_ALLOW_RUNTIME_MIGRATIONS/);
});

test('staging aplica controles de despliegue y no se comporta como local', async () => {
  const environment = await read('lib/environment.ts');
  const authActions = await read('app/auth-actions.ts');
  const setup = await read('app/setup/page.tsx');
  const runtime = await read('lib/runtime.ts');
  const platform = await read('lib/platform.ts');
  const platformActions = await read('app/platform/actions.ts');
  const dashboard = await read('app/dashboard.tsx');
  const operations = await read('app/platform/operations-panel.tsx');
  assert.match(environment, /!== 'local'/);
  assert.match(environment, /APP_URL es obligatorio/);
  assert.match(environment, /parsed\.protocol !== 'https:'/);
  assert.match(authActions, /isDeployedEnvironment/);
  assert.match(setup, /isDeployedEnvironment/);
  assert.match(runtime, /webhookUrl: new URL/);
  assert.match(platform, /whatsappWebhookUrl: new URL/);
  assert.match(platformActions, /const baseUrl = getPublicAppUrl\(\)/);
  assert.match(dashboard, /data\.runtime\.webhookUrl/);
  assert.match(operations, /tenant\.whatsappWebhookUrl/);
  assert.doesNotMatch(dashboard, /http:\/\/localhost:3000\{data\.runtime\.webhookPath\}/);
  assert.doesNotMatch(dashboard, /sin sincronización con GitHub/);
  assert.doesNotMatch(platformActions, /env\.BETTER_AUTH_URL \|\| 'http:\/\/localhost:3000'/);
});

test('la salida de WhatsApp usa outbox y reclama el mensaje antes de enviarlo', async () => {
  const actions = await read('app/actions.ts');
  const conversation = await read('lib/conversation-service.ts');
  const consumer = await read('workers/events-consumer.ts');
  const outbox = await read('lib/outbox.ts');
  assert.ok(actions.indexOf('INSERT INTO messages') < actions.indexOf('await deliverPersistedWhatsAppText'));
  assert.match(conversation, /whatsappOutboxItem/);
  assert.match(outbox, /status = 'pending'/);
  assert.match(outbox, /SAVIA_EVENTS\.send/);
  assert.match(consumer, /status = 'sending'/);
  assert.match(consumer, /message\.attempts >= 5/);
});

test('privacidad elimina también generaciones y payloads salientes', async () => {
  const actions = await read('app/actions.ts');
  const retention = await read('lib/retention.ts');
  assert.match(actions, /UPDATE ai_generations/);
  assert.match(actions, /DELETE FROM outbox_events/);
  assert.match(retention, /DELETE FROM ai_generations/);
  assert.match(retention, /DELETE FROM outbox_events/);
});

test('los manifiestos disponibles son plantillas y no publican el servicio', async () => {
  const app = await read('cloudflare/wrangler.app.production.example.jsonc');
  const events = await read('cloudflare/wrangler.events.production.example.jsonc');
  assert.match(app, /REPLACE_CONTROL_D1_ID/);
  assert.match(app, /SAVIA_REQUIRE_DEDICATED_TENANT_DATA/);
  assert.match(app, /\.\.\/dist\/server\/index\.js/);
  assert.match(app, /\.\.\/dist\/client/);
  assert.match(app, /"no_bundle": true/);
  assert.match(events, /"server-only"/);
});
