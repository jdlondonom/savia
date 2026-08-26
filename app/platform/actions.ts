'use server';

import { env } from 'cloudflare:workers';
import { generateText } from 'ai';
import { createTenantLanguageModel, embedTenantTexts, getTenantAiRuntime } from '@/lib/ai-config';
import { dbAll, dbBatch, dbFirst, dbRun } from '@/lib/database';
import { sendInvitationEmail, sendTransactionalEmail } from '@/lib/email';
import { getPublicAppUrl, requiresDedicatedTenantData } from '@/lib/environment';
import {
  getPlatformData,
  type AccountStatus,
  type AiProvider,
  type AiPurpose,
  type PlatformData,
  type TenantAiSetting,
  type TenantRole,
} from '@/lib/platform';
import {
  activeMasterKeyId,
  decryptSecret,
  encryptSecret,
  secretHint,
  secretNeedsRotation,
} from '@/lib/secrets';
import { requirePlatformUser, type PlatformRole } from '@/lib/session';
import { reindexTenantCatalog, reindexTenantKnowledge } from '@/lib/rag';
import { tenantDbRun, validateDedicatedTenantResources } from '@/lib/tenant-database';
import { getWhatsAppChannelByTenantId } from '@/lib/whatsapp-config';

const tenantRoles: TenantRole[] = ['owner', 'admin', 'advisor'];
const platformRoles: PlatformRole[] = ['superadmin', 'support'];
const providers: AiProvider[] = ['openai', 'anthropic', 'huggingface', 'voyage', 'openai_compatible'];
const purposes: AiPurpose[] = ['llm', 'embedding', 'both'];

export type AccessResult = {
  data: PlatformData;
  invitationUrl: string | null;
  message: string;
};

export type RecoveryResult = {
  data: PlatformData;
  recoveryUrl: string;
};

export async function refreshPlatformAction(): Promise<PlatformData> {
  return getPlatformData();
}

export async function createPlatformTenantAction(input: {
  name: string;
  industry: string;
  slug?: string;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const name = requiredText(input.name, 'Nombre del cliente', 160);
  const industry = requiredText(input.industry, 'Sector', 160);
  const slug = toSlug(optionalText(input.slug, 80) || name);
  if (slug.length < 3) throw new Error('El identificador debe tener al menos 3 caracteres.');
  if (await dbFirst('SELECT id FROM tenants WHERE slug = ?', slug)) {
    throw new Error('Ya existe un cliente con ese identificador.');
  }

  const id = `tenant_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const dedicated = requiresDedicatedTenantData();
  await dbBatch([
    {
      sql: `INSERT INTO tenants
              (id, slug, name, industry, timezone, assistant_name, assistant_tone,
               assistant_prompt, business_hours_json, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'America/Bogota', 'Savia',
                    'cálido, claro y profesional', '', ?, 'active', ?, ?)`,
      bindings: [id, slug, name, industry, defaultBusinessHours(), now, now],
    },
    {
      sql: `INSERT INTO tenant_resources
              (tenant_id, isolation_mode, provisioning_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)`,
      bindings: [
        id,
        dedicated ? 'dedicated' : 'shared_local',
        dedicated ? 'pending' : 'local',
        now,
        now,
      ],
    },
    {
      sql: `INSERT INTO tenant_channel_settings (tenant_id, webhook_key, created_at, updated_at)
            VALUES (?, ?, ?, ?)`,
      bindings: [id, crypto.randomUUID().replaceAll('-', ''), now, now],
    },
    {
      sql: `INSERT INTO tenant_retention_settings (tenant_id, updated_by, updated_at)
            VALUES (?, ?, ?)`,
      bindings: [id, session.user.id, now],
    },
    platformAudit(session.user.id, 'tenant.created', 'tenant', id, `Cliente ${name} creado.`, now),
  ]);
  return getPlatformData();
}

export async function setTenantStatusAction(
  tenantId: string,
  status: AccountStatus,
): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  if (!['active', 'suspended'].includes(status)) throw new Error('Estado inválido.');
  const tenant = await dbFirst<{ name: string }>('SELECT name FROM tenants WHERE id = ?', tenantId);
  if (!tenant) throw new Error('El cliente no existe.');
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: 'UPDATE tenants SET status = ?, updated_at = ? WHERE id = ?',
      bindings: [status, now, tenantId],
    },
    platformAudit(
      session.user.id,
      'tenant.status_changed',
      'tenant',
      tenantId,
      `${tenant.name}: ${status === 'active' ? 'activo' : 'suspendido'}.`,
      now,
    ),
  ]);
  return getPlatformData();
}

export async function inviteAccessAction(input: {
  name: string;
  email: string;
  tenantId?: string | null;
  tenantRole?: TenantRole | null;
  platformRole?: PlatformRole | null;
}): Promise<AccessResult> {
  const session = await requirePlatformUser({ mutation: true });
  const name = requiredText(input.name, 'Nombre', 120);
  const email = validEmail(input.email);
  const tenantId = optionalText(input.tenantId, 100);
  const tenantRole = input.tenantRole ?? null;
  const platformRole = input.platformRole ?? null;

  if (Boolean(tenantId) === Boolean(platformRole)) {
    throw new Error('Selecciona un acceso de tenant o un rol global, pero no ambos.');
  }
  if (tenantId && (!tenantRole || !tenantRoles.includes(tenantRole))) {
    throw new Error('Selecciona un rol válido para el tenant.');
  }
  if (platformRole && !platformRoles.includes(platformRole)) {
    throw new Error('Selecciona un rol global válido.');
  }

  let scopeName = 'la plataforma';
  if (tenantId) {
    const tenant = await dbFirst<{ name: string }>('SELECT name FROM tenants WHERE id = ?', tenantId);
    if (!tenant) throw new Error('El cliente seleccionado no existe.');
    scopeName = tenant.name;
  }

  const existingUser = await dbFirst<{ id: string; status: AccountStatus; has_credentials: number }>(
    `SELECT u.id, u.status, CASE WHEN au.id IS NULL THEN 0 ELSE 1 END AS has_credentials
     FROM users u LEFT JOIN auth_users au ON au.id = u.id
     WHERE lower(u.email) = lower(?)`,
    email,
  );
  const now = new Date().toISOString();
  if (existingUser) {
    if (!existingUser.has_credentials) {
      throw new Error('Ese correo pertenece a un registro de demostración sin acceso. Usa otro correo para crear una cuenta real.');
    }
    const writes: Array<{ sql: string; bindings?: unknown[] }> = [];
    if (tenantId && tenantRole) {
      writes.push({
        sql: `INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = excluded.role`,
        bindings: [tenantId, existingUser.id, tenantRole, now],
      });
    }
    if (platformRole) {
      writes.push({
        sql: `INSERT INTO platform_roles (user_id, role, status, created_at, updated_at)
              VALUES (?, ?, 'active', ?, ?)
              ON CONFLICT (user_id) DO UPDATE SET role = excluded.role, status = 'active', updated_at = excluded.updated_at`,
        bindings: [existingUser.id, platformRole, now, now],
      });
    }
    writes.push(platformAudit(
      session.user.id,
      'access.assigned',
      'user',
      existingUser.id,
      `${email} recibió acceso a ${scopeName}.`,
      now,
    ));
    await dbBatch(writes);
    return {
      data: await getPlatformData(),
      invitationUrl: null,
      message: existingUser.status === 'suspended'
        ? 'El acceso fue asignado, pero la cuenta continúa suspendida hasta que la reactives.'
        : 'El usuario ya existía y el acceso quedó asignado inmediatamente.',
    };
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const invitationId = `invite_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1_000).toISOString();
  const revokeSql = tenantId
    ? `UPDATE tenant_invitations SET revoked_at = ?
       WHERE lower(email) = lower(?) AND tenant_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`
    : `UPDATE tenant_invitations SET revoked_at = ?
       WHERE lower(email) = lower(?) AND platform_role IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL`;
  const revokeBindings = tenantId ? [now, email, tenantId] : [now, email];

  await dbBatch([
    { sql: revokeSql, bindings: revokeBindings },
    {
      sql: `INSERT INTO tenant_invitations
              (id, tenant_id, email, name, tenant_role, platform_role, token_hash,
               expires_at, invited_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bindings: [
        invitationId,
        tenantId,
        email,
        name,
        tenantRole,
        platformRole,
        tokenHash,
        expiresAt,
        session.user.id,
        now,
      ],
    },
    platformAudit(
      session.user.id,
      'invitation.created',
      'invitation',
      invitationId,
      `Invitación creada para ${email} en ${scopeName}.`,
      now,
    ),
  ]);

  const baseUrl = getPublicAppUrl();
  const invitationUrl = `${baseUrl}/invite/${token}`;
  const delivery = await sendInvitationEmail({ email, name, scopeName, invitationUrl });
  return {
    data: await getPlatformData(),
    invitationUrl,
    message: delivery.sent
      ? 'Invitación enviada por correo. El enlace también se muestra una sola vez y vence en 72 horas.'
      : `Invitación creada. El correo no se envió (${delivery.error}); comparte el enlace de un solo uso.`,
  };
}

export async function generatePasswordRecoveryAction(userId: string): Promise<RecoveryResult> {
  const session = await requirePlatformUser({ mutation: true });
  const target = await dbFirst<{ id: string; email: string; status: AccountStatus; has_credentials: number }>(
    `SELECT u.id, u.email, u.status, CASE WHEN au.id IS NULL THEN 0 ELSE 1 END AS has_credentials
     FROM users u LEFT JOIN auth_users au ON au.id = u.id WHERE u.id = ?`,
    userId,
  );
  if (!target?.has_credentials) throw new Error('El usuario no tiene credenciales activas.');
  if (target.status !== 'active') throw new Error('Reactiva la cuenta antes de generar una recuperación.');

  const token = randomToken();
  const identifier = await sha256Base64Url(`reset-password:${token}`);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60_000).toISOString();
  await dbBatch([
    {
      sql: `INSERT INTO auth_verifications (id, identifier, value, expiresAt, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)`,
      bindings: [crypto.randomUUID(), identifier, userId, expiresAt, now.toISOString(), now.toISOString()],
    },
    { sql: 'DELETE FROM auth_sessions WHERE userId = ?', bindings: [userId] },
    platformAudit(
      session.user.id,
      'user.password_recovery_created',
      'user',
      userId,
      `Se generó una recuperación de una hora para ${target.email}; se revocaron sus sesiones.`,
      now.toISOString(),
    ),
  ]);
  const baseUrl = getPublicAppUrl();
  return {
    data: await getPlatformData(),
    recoveryUrl: `${baseUrl}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent('/reset-password')}`,
  };
}

export async function resetUserMfaAction(userId: string): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  if (userId === session.user.id) {
    throw new Error('Por seguridad no puedes reiniciar tu propio MFA desde una sesión activa.');
  }
  const target = await dbFirst<{ email: string; mfa_enabled: number }>(
    `SELECT u.email, COALESCE(au.twoFactorEnabled, 0) AS mfa_enabled
     FROM users u JOIN auth_users au ON au.id = u.id WHERE u.id = ?`,
    userId,
  );
  if (!target) throw new Error('El usuario no tiene una cuenta de acceso.');
  const now = new Date().toISOString();
  await dbBatch([
    { sql: 'DELETE FROM auth_two_factor WHERE userId = ?', bindings: [userId] },
    { sql: 'UPDATE auth_users SET twoFactorEnabled = 0, updatedAt = ? WHERE id = ?', bindings: [now, userId] },
    { sql: 'DELETE FROM auth_sessions WHERE userId = ?', bindings: [userId] },
    platformAudit(
      session.user.id,
      'user.mfa_reset',
      'user',
      userId,
      `MFA reiniciado para ${target.email}; deberá enrolarlo nuevamente.`,
      now,
    ),
  ]);
  return getPlatformData();
}

export async function revokeInvitationAction(invitationId: string): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const now = new Date().toISOString();
  const result = await dbRun(
    `UPDATE tenant_invitations SET revoked_at = ?
     WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
    now,
    invitationId,
  );
  if (!result.meta.changes) throw new Error('La invitación ya no está activa.');
  await dbRun(
    platformAuditSql(),
    ...platformAuditBindings(
      session.user.id,
      'invitation.revoked',
      'invitation',
      invitationId,
      'Invitación revocada.',
      now,
    ),
  );
  return getPlatformData();
}

export async function setMembershipRoleAction(input: {
  tenantId: string;
  userId: string;
  role: TenantRole;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  if (!tenantRoles.includes(input.role)) throw new Error('Rol inválido.');
  const membership = await requireMembership(input.tenantId, input.userId);
  await assertOwnerContinuity(input.tenantId, membership.role, input.role);
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: 'UPDATE tenant_memberships SET role = ? WHERE tenant_id = ? AND user_id = ?',
      bindings: [input.role, input.tenantId, input.userId],
    },
    platformAudit(
      session.user.id,
      'membership.role_changed',
      'user',
      input.userId,
      `Rol en ${membership.tenant_name}: ${input.role}.`,
      now,
    ),
  ]);
  return getPlatformData();
}

export async function revokeMembershipAction(input: {
  tenantId: string;
  userId: string;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const membership = await requireMembership(input.tenantId, input.userId);
  await assertOwnerContinuity(input.tenantId, membership.role, null);
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: 'DELETE FROM tenant_memberships WHERE tenant_id = ? AND user_id = ?',
      bindings: [input.tenantId, input.userId],
    },
    platformAudit(
      session.user.id,
      'membership.revoked',
      'user',
      input.userId,
      `Acceso retirado de ${membership.tenant_name}.`,
      now,
    ),
  ]);
  return getPlatformData();
}

export async function setUserStatusAction(userId: string, status: AccountStatus): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  if (!['active', 'suspended'].includes(status)) throw new Error('Estado inválido.');
  if (userId === session.user.id && status === 'suspended') {
    throw new Error('No puedes suspender tu propia cuenta.');
  }
  const target = await dbFirst<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', userId);
  if (!target) throw new Error('El usuario no existe.');
  if (status === 'suspended') await assertAnotherSuperadmin(userId);

  const now = new Date().toISOString();
  const writes: Array<{ sql: string; bindings?: unknown[] }> = [
    { sql: 'UPDATE users SET status = ?, updated_at = ? WHERE id = ?', bindings: [status, now, userId] },
    { sql: 'UPDATE platform_roles SET status = ?, updated_at = ? WHERE user_id = ?', bindings: [status, now, userId] },
    platformAudit(
      session.user.id,
      'user.status_changed',
      'user',
      userId,
      `${target.email}: ${status === 'active' ? 'activo' : 'suspendido'}.`,
      now,
    ),
  ];
  if (status === 'suspended') {
    writes.push({ sql: 'DELETE FROM auth_sessions WHERE userId = ?', bindings: [userId] });
  }
  await dbBatch(writes);
  return getPlatformData();
}

export async function setPlatformRoleAction(input: {
  userId: string;
  role: PlatformRole | null;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  if (input.role !== null && !platformRoles.includes(input.role)) throw new Error('Rol global inválido.');
  if (input.userId === session.user.id && input.role !== 'superadmin') {
    throw new Error('No puedes retirar tu propio rol de superadministrador.');
  }
  if (input.role !== 'superadmin') await assertAnotherSuperadmin(input.userId);
  const target = await dbFirst<{ email: string }>('SELECT email FROM users WHERE id = ?', input.userId);
  if (!target) throw new Error('El usuario no existe.');
  const now = new Date().toISOString();
  const writes: Array<{ sql: string; bindings?: unknown[] }> = [];
  if (input.role) {
    writes.push({
      sql: `INSERT INTO platform_roles (user_id, role, status, created_at, updated_at)
            VALUES (?, ?, 'active', ?, ?)
            ON CONFLICT (user_id) DO UPDATE SET role = excluded.role, status = 'active', updated_at = excluded.updated_at`,
      bindings: [input.userId, input.role, now, now],
    });
  } else {
    writes.push({ sql: 'DELETE FROM platform_roles WHERE user_id = ?', bindings: [input.userId] });
  }
  writes.push(platformAudit(
    session.user.id,
    'platform_role.changed',
    'user',
    input.userId,
    `${target.email}: ${input.role ?? 'sin acceso global'}.`,
    now,
  ));
  await dbBatch(writes);
  return getPlatformData();
}

export async function saveProviderConnectionAction(input: {
  id?: string | null;
  name: string;
  provider: AiProvider;
  purpose: AiPurpose;
  baseUrl?: string | null;
  apiKey?: string | null;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const id = optionalText(input.id, 100);
  const name = requiredText(input.name, 'Nombre de la conexión', 120);
  if (!providers.includes(input.provider)) throw new Error('Proveedor no compatible.');
  if (!purposes.includes(input.purpose)) throw new Error('Propósito no válido.');
  assertProviderPurpose(input.provider, input.purpose);
  const baseUrl = validOptionalUrl(input.baseUrl);
  if (input.provider === 'openai_compatible' && !baseUrl) {
    throw new Error('La conexión Compatible OpenAI requiere una URL base.');
  }
  const apiKey = optionalText(input.apiKey, 1_000);
  const existing = id
    ? await dbFirst<{ id: string; provider: AiProvider; encrypted_api_key: string | null }>(
      'SELECT id, provider, encrypted_api_key FROM ai_provider_connections WHERE id = ?',
      id,
    )
    : null;
  if (id && !existing) throw new Error('La conexión ya no existe.');
  if (!apiKey && !existing?.encrypted_api_key && input.provider !== 'openai_compatible') {
    throw new Error('La llave API es obligatoria para este proveedor.');
  }
  if (existing && existing.provider !== input.provider && !apiKey && input.provider !== 'openai_compatible') {
    throw new Error('Ingresa una llave nueva al cambiar de proveedor.');
  }

  const encrypted = apiKey ? await encryptSecret(apiKey) : existing?.encrypted_api_key ?? null;
  const hint = apiKey
    ? secretHint(apiKey)
    : await dbFirst<{ key_hint: string | null }>(
      'SELECT key_hint FROM ai_provider_connections WHERE id = ?',
      id,
    ).then((row) => row?.key_hint ?? null);
  const connectionId = id ?? `aic_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `INSERT INTO ai_provider_connections
              (id, name, provider, purpose, base_url, encrypted_api_key, key_hint,
               status, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
              name = excluded.name,
              provider = excluded.provider,
              purpose = excluded.purpose,
              base_url = excluded.base_url,
              encrypted_api_key = excluded.encrypted_api_key,
              key_hint = excluded.key_hint,
              status = 'active',
              last_test_status = NULL,
              last_test_message = NULL,
              updated_at = excluded.updated_at`,
      bindings: [
        connectionId,
        name,
        input.provider,
        input.purpose,
        baseUrl,
        encrypted,
        hint,
        session.user.id,
        now,
        now,
      ],
    },
    platformAudit(
      session.user.id,
      id ? 'ai_connection.updated' : 'ai_connection.created',
      'ai_connection',
      connectionId,
      `${name} (${input.provider}) guardada sin exponer la credencial.`,
      now,
    ),
  ]);
  return getPlatformData();
}

export async function setProviderStatusAction(
  connectionId: string,
  status: 'active' | 'disabled',
): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  if (!['active', 'disabled'].includes(status)) throw new Error('Estado inválido.');
  const connection = await dbFirst<{ name: string }>(
    'SELECT name FROM ai_provider_connections WHERE id = ?',
    connectionId,
  );
  if (!connection) throw new Error('La conexión no existe.');
  if (status === 'disabled') {
    const used = await dbFirst<{ count: number }>(
      `SELECT COUNT(*) AS count FROM tenant_ai_settings
       WHERE llm_connection_id = ? OR llm_fallback_connection_id = ? OR embedding_connection_id = ?`,
      connectionId,
      connectionId,
      connectionId,
    );
    if ((used?.count ?? 0) > 0) {
      throw new Error('La conexión está asignada a uno o más tenants. Cámbiala antes de desactivarla.');
    }
  }
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: 'UPDATE ai_provider_connections SET status = ?, updated_at = ? WHERE id = ?',
      bindings: [status, now, connectionId],
    },
    platformAudit(
      session.user.id,
      'ai_connection.status_changed',
      'ai_connection',
      connectionId,
      `${connection.name}: ${status}.`,
      now,
    ),
  ]);
  return getPlatformData();
}

export async function updateTenantAiSettingsAction(input: {
  tenantId: string;
  llmConnectionId?: string | null;
  llmModel?: string | null;
  llmTemperatureMilli: number;
  llmMaxTokens: number;
  llmFallbackConnectionId?: string | null;
  llmFallbackModel?: string | null;
  embeddingConnectionId?: string | null;
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
  retrievalMode: TenantAiSetting['retrievalMode'];
  dailyRequestLimit: number;
  monthlyTokenLimit: number;
  monthlyCostLimitCents: number;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const tenant = await dbFirst<{ name: string }>('SELECT name FROM tenants WHERE id = ?', input.tenantId);
  if (!tenant) throw new Error('El cliente no existe.');

  const llmConnectionId = optionalText(input.llmConnectionId, 100);
  const llmModel = optionalText(input.llmModel, 200);
  const fallbackConnectionId = optionalText(input.llmFallbackConnectionId, 100);
  const fallbackModel = optionalText(input.llmFallbackModel, 200);
  const embeddingConnectionId = optionalText(input.embeddingConnectionId, 100);
  const embeddingModel = optionalText(input.embeddingModel, 200);
  if (Boolean(llmConnectionId) !== Boolean(llmModel)) {
    throw new Error('Selecciona conexión y modelo principal, o deja ambos vacíos.');
  }
  if (Boolean(fallbackConnectionId) !== Boolean(fallbackModel)) {
    throw new Error('Selecciona conexión y modelo de respaldo, o deja ambos vacíos.');
  }
  if (Boolean(embeddingConnectionId) !== Boolean(embeddingModel)) {
    throw new Error('Selecciona conexión y modelo de embeddings, o deja ambos vacíos.');
  }
  if (llmConnectionId) await assertConnectionSupports(llmConnectionId, 'llm');
  if (fallbackConnectionId) await assertConnectionSupports(fallbackConnectionId, 'llm');
  if (embeddingConnectionId) await assertConnectionSupports(embeddingConnectionId, 'embedding');
  if (!['keyword', 'semantic', 'hybrid'].includes(input.retrievalMode)) throw new Error('Modo RAG inválido.');
  if (input.retrievalMode !== 'keyword' && !embeddingConnectionId) {
    throw new Error('El modo semántico o híbrido requiere un modelo de embeddings.');
  }

  const temperature = clampInteger(input.llmTemperatureMilli, 0, 2_000, 'Temperatura');
  const maxTokens = clampInteger(input.llmMaxTokens, 64, 8_192, 'Máximo de tokens');
  const dimensions = input.embeddingDimensions === null || input.embeddingDimensions === undefined
    ? null
    : clampInteger(input.embeddingDimensions, 1, 8_192, 'Dimensiones');
  const dailyRequestLimit = clampInteger(input.dailyRequestLimit, 1, 1_000_000, 'Límite diario');
  const monthlyTokenLimit = clampInteger(input.monthlyTokenLimit, 1_000, 2_000_000_000, 'Límite mensual de tokens');
  const monthlyCostLimitCents = clampInteger(input.monthlyCostLimitCents, 1, 100_000_000, 'Límite mensual de costo');
  const previous = await dbFirst<{
    embedding_connection_id: string | null;
    embedding_model: string | null;
    embedding_dimensions: number | null;
    config_version: number;
  }>('SELECT embedding_connection_id, embedding_model, embedding_dimensions, config_version FROM tenant_ai_settings WHERE tenant_id = ?', input.tenantId);
  const embeddingChanged =
    previous?.embedding_connection_id !== embeddingConnectionId
    || previous?.embedding_model !== embeddingModel
    || Number(previous?.embedding_dimensions ?? 0) !== Number(dimensions ?? 0);
  const version = Number(previous?.config_version ?? 0) + 1;
  const now = new Date().toISOString();
  const writes: Array<{ sql: string; bindings?: unknown[] }> = [
    {
      sql: `INSERT INTO tenant_ai_settings
              (tenant_id, llm_connection_id, llm_model, llm_temperature_milli,
               llm_max_tokens, llm_fallback_connection_id, llm_fallback_model,
               embedding_connection_id, embedding_model, embedding_dimensions,
                retrieval_mode, config_version, daily_request_limit, monthly_token_limit,
                monthly_cost_limit_cents, updated_by, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (tenant_id) DO UPDATE SET
              llm_connection_id = excluded.llm_connection_id,
              llm_model = excluded.llm_model,
              llm_temperature_milli = excluded.llm_temperature_milli,
              llm_max_tokens = excluded.llm_max_tokens,
              llm_fallback_connection_id = excluded.llm_fallback_connection_id,
              llm_fallback_model = excluded.llm_fallback_model,
              embedding_connection_id = excluded.embedding_connection_id,
              embedding_model = excluded.embedding_model,
              embedding_dimensions = excluded.embedding_dimensions,
              retrieval_mode = excluded.retrieval_mode,
              config_version = excluded.config_version,
              daily_request_limit = excluded.daily_request_limit,
              monthly_token_limit = excluded.monthly_token_limit,
              monthly_cost_limit_cents = excluded.monthly_cost_limit_cents,
              updated_by = excluded.updated_by,
              updated_at = excluded.updated_at`,
      bindings: [
        input.tenantId,
        llmConnectionId,
        llmModel,
        temperature,
        maxTokens,
        fallbackConnectionId,
        fallbackModel,
        embeddingConnectionId,
        embeddingModel,
        dimensions,
        input.retrievalMode,
        version,
        dailyRequestLimit,
        monthlyTokenLimit,
        monthlyCostLimitCents,
        session.user.id,
        now,
      ],
    },
    platformAudit(
      session.user.id,
      'tenant.ai_config_updated',
      'tenant',
      input.tenantId,
      `Configuración de IA actualizada para ${tenant.name}. Versión ${version}.`,
      now,
    ),
  ];
  await dbBatch(writes);
  if (embeddingChanged) {
    await tenantDbRun(
      input.tenantId,
      `UPDATE knowledge_chunks SET status = 'stale', updated_at = ?
       WHERE tenant_id = ? AND status != 'failed'`,
      now,
      input.tenantId,
    );
    await tenantDbRun(
      input.tenantId,
      `UPDATE catalog_chunks SET status = 'stale', updated_at = ?
       WHERE tenant_id = ? AND status != 'failed'`,
      now,
      input.tenantId,
    );
    await reindexTenantKnowledge(input.tenantId, 'embedding_config_changed');
    await reindexTenantCatalog(input.tenantId, 'embedding_config_changed');
  }
  return getPlatformData();
}

export async function testTenantAiAction(
  tenantId: string,
  capability: 'llm' | 'embedding',
): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const runtime = await getTenantAiRuntime(tenantId);
  const target = capability === 'llm' ? runtime?.llm : runtime?.embedding;
  if (!runtime || !target) {
    throw new Error(`El tenant no tiene ${capability === 'llm' ? 'un LLM' : 'embeddings'} configurados.`);
  }

  const testedAt = new Date().toISOString();
  try {
    if (capability === 'llm') {
      const result = await generateText({
        model: createTenantLanguageModel(target),
        prompt: 'Responde únicamente con la palabra OK.',
        temperature: 0,
        maxOutputTokens: 12,
        abortSignal: AbortSignal.timeout(30_000),
      });
      if (!result.text.trim()) throw new Error('El modelo no devolvió texto.');
    } else {
      const vectors = await embedTenantTexts(runtime, ['prueba de conexión Savia'], 'query');
      if (!vectors[0]?.length) throw new Error('El modelo no devolvió un vector.');
    }
    await dbBatch([
      {
        sql: `UPDATE ai_provider_connections
              SET last_tested_at = ?, last_test_status = 'ok', last_test_message = ?, updated_at = ?
              WHERE id = ?`,
        bindings: [testedAt, capability === 'llm' ? 'Generación de texto correcta.' : 'Embedding generado correctamente.', testedAt, target.connection.id],
      },
      platformAudit(session.user.id, 'ai_connection.test_ok', 'ai_connection', target.connection.id, `Prueba ${capability} exitosa.`, testedAt),
    ]);
  } catch (error) {
    const message = safeProviderError(error);
    await dbBatch([
      {
        sql: `UPDATE ai_provider_connections
              SET last_tested_at = ?, last_test_status = 'error', last_test_message = ?, updated_at = ?
              WHERE id = ?`,
        bindings: [testedAt, message, testedAt, target.connection.id],
      },
      platformAudit(session.user.id, 'ai_connection.test_error', 'ai_connection', target.connection.id, `Prueba ${capability} fallida: ${message}`, testedAt),
    ]);
    throw new Error(`La prueba falló: ${message}`);
  }
  return getPlatformData();
}

export async function saveTenantResourceBindingsAction(input: {
  tenantId: string;
  databaseBinding: string;
  filesBinding: string;
  vectorBinding: string;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const tenant = await dbFirst<{ name: string }>('SELECT name FROM tenants WHERE id = ?', input.tenantId);
  if (!tenant) throw new Error('El cliente no existe.');
  const databaseBinding = validBindingName(input.databaseBinding, 'D1');
  const filesBinding = validBindingName(input.filesBinding, 'R2');
  const vectorBinding = validBindingName(input.vectorBinding, 'Vectorize');
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `UPDATE tenant_resources
            SET isolation_mode = 'dedicated', database_binding = ?, files_binding = ?,
                vector_binding = ?, provisioning_status = 'pending', last_error = NULL, updated_at = ?
            WHERE tenant_id = ?`,
      bindings: [databaseBinding, filesBinding, vectorBinding, now, input.tenantId],
    },
    platformAudit(
      session.user.id,
      'tenant.resources_configured',
      'tenant',
      input.tenantId,
      `Bindings dedicados preparados para ${tenant.name}; falta validarlos en el entorno.`,
      now,
    ),
  ]);
  return getPlatformData();
}

export async function validateTenantResourcesAction(tenantId: string): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const now = new Date().toISOString();
  try {
    await validateDedicatedTenantResources(tenantId);
    await dbBatch([
      {
        sql: `UPDATE tenant_resources SET provisioning_status = 'ready', last_error = NULL, updated_at = ?
              WHERE tenant_id = ?`,
        bindings: [now, tenantId],
      },
      platformAudit(session.user.id, 'tenant.resources_validated', 'tenant', tenantId, 'D1, R2 y Vectorize dedicados validados.', now),
    ]);
  } catch (error) {
    const message = safeProviderError(error);
    await dbBatch([
      {
        sql: `UPDATE tenant_resources SET provisioning_status = 'error', last_error = ?, updated_at = ?
              WHERE tenant_id = ?`,
        bindings: [message, now, tenantId],
      },
      platformAudit(session.user.id, 'tenant.resources_validation_failed', 'tenant', tenantId, `Validación fallida: ${message}`, now),
    ]);
    throw new Error(`Los recursos no están listos: ${message}`);
  }
  return getPlatformData();
}

export async function saveWhatsAppSettingsAction(input: {
  tenantId: string;
  phoneNumberId: string;
  whatsappBusinessAccountId?: string | null;
  accessToken?: string | null;
  appSecret?: string | null;
  verifyToken?: string | null;
  graphVersion: string;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const phoneNumberId = requiredText(input.phoneNumberId, 'ID del número', 80);
  if (!/^\d+$/.test(phoneNumberId)) throw new Error('El ID del número de WhatsApp debe contener solo dígitos.');
  const wabaId = optionalText(input.whatsappBusinessAccountId, 80);
  if (wabaId && !/^\d+$/.test(wabaId)) throw new Error('El ID de la cuenta de WhatsApp debe contener solo dígitos.');
  const graphVersion = requiredText(input.graphVersion, 'Versión de Graph', 20).replace(/^v/i, 'v');
  if (!/^v\d+\.\d+$/.test(graphVersion)) throw new Error('Usa una versión Graph como v23.0.');
  const existing = await dbFirst<{
    encrypted_access_token: string | null;
    encrypted_app_secret: string | null;
    encrypted_verify_token: string | null;
    access_token_hint: string | null;
  }>(`SELECT encrypted_access_token, encrypted_app_secret, encrypted_verify_token
             , access_token_hint
      FROM tenant_channel_settings WHERE tenant_id = ?`, input.tenantId);
  if (!existing) throw new Error('La configuración del cliente no existe.');
  const accessToken = optionalText(input.accessToken, 2_000);
  const appSecret = optionalText(input.appSecret, 1_000);
  const verifyToken = optionalText(input.verifyToken, 1_000);
  const encryptedAccessToken = accessToken ? await encryptSecret(accessToken) : existing.encrypted_access_token;
  const encryptedAppSecret = appSecret ? await encryptSecret(appSecret) : existing.encrypted_app_secret;
  const encryptedVerifyToken = verifyToken ? await encryptSecret(verifyToken) : existing.encrypted_verify_token;
  if (!encryptedAccessToken || !encryptedAppSecret || !encryptedVerifyToken) {
    throw new Error('Token de acceso, secreto de la app y token de verificación son obligatorios la primera vez.');
  }
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `UPDATE tenant_channel_settings
            SET phone_number_id = ?, whatsapp_business_account_id = ?, encrypted_access_token = ?,
                access_token_hint = ?, encrypted_app_secret = ?, encrypted_verify_token = ?,
                graph_version = ?, status = 'active', last_test_status = NULL,
                last_test_message = NULL, updated_by = ?, updated_at = ?
            WHERE tenant_id = ?`,
      bindings: [
        phoneNumberId,
        wabaId,
        encryptedAccessToken,
        accessToken ? secretHint(accessToken) : existing.access_token_hint,
        encryptedAppSecret,
        encryptedVerifyToken,
        graphVersion,
        session.user.id,
        now,
        input.tenantId,
      ],
    },
    platformAudit(session.user.id, 'tenant.whatsapp_configured', 'tenant', input.tenantId, 'Credenciales de WhatsApp cifradas y activadas.', now),
  ]);
  return getPlatformData();
}

export async function testWhatsAppSettingsAction(tenantId: string): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const config = await getWhatsAppChannelByTenantId(tenantId);
  if (!config) throw new Error('Completa y activa la configuración de WhatsApp.');
  const testedAt = new Date().toISOString();
  let status: 'ok' | 'error' = 'ok';
  let message = 'Meta reconoció el número configurado.';
  try {
    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}?fields=id,display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw new Error(`Meta respondió ${response.status}.`);
  } catch (error) {
    status = 'error';
    message = safeProviderError(error);
  }
  await dbBatch([
    {
      sql: `UPDATE tenant_channel_settings
            SET last_tested_at = ?, last_test_status = ?, last_test_message = ?,
                status = ?, updated_at = ? WHERE tenant_id = ?`,
      bindings: [testedAt, status, message, status === 'ok' ? 'active' : 'error', testedAt, tenantId],
    },
    platformAudit(session.user.id, `tenant.whatsapp_test_${status}`, 'tenant', tenantId, message, testedAt),
  ]);
  if (status === 'error') throw new Error(`La prueba falló: ${message}`);
  return getPlatformData();
}

export async function saveEmailSettingsAction(input: {
  provider: 'resend' | 'postmark';
  fromEmail: string;
  fromName: string;
  apiKey?: string | null;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  if (!['resend', 'postmark'].includes(input.provider)) throw new Error('Proveedor de correo inválido.');
  const fromEmail = validEmail(input.fromEmail);
  const fromName = requiredText(input.fromName, 'Nombre del remitente', 120);
  const existing = await dbFirst<{ encrypted_api_key: string | null; key_hint: string | null }>(
    `SELECT encrypted_api_key, key_hint FROM platform_email_settings WHERE id = 'default'`,
  );
  const apiKey = optionalText(input.apiKey, 1_000);
  const encryptedApiKey = apiKey ? await encryptSecret(apiKey) : existing?.encrypted_api_key ?? null;
  if (!encryptedApiKey) throw new Error('La llave API es obligatoria la primera vez.');
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `INSERT INTO platform_email_settings
              (id, provider, from_email, from_name, encrypted_api_key, key_hint,
               status, updated_by, created_at, updated_at)
            VALUES ('default', ?, ?, ?, ?, ?, 'active', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET provider = excluded.provider,
              from_email = excluded.from_email, from_name = excluded.from_name,
              encrypted_api_key = excluded.encrypted_api_key, key_hint = excluded.key_hint,
              status = 'active', last_test_status = NULL, last_test_message = NULL,
              updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      bindings: [
        input.provider,
        fromEmail,
        fromName,
        encryptedApiKey,
        apiKey ? secretHint(apiKey) : existing?.key_hint ?? null,
        session.user.id,
        now,
        now,
      ],
    },
    platformAudit(session.user.id, 'email.configured', 'platform', 'email', `Correo ${input.provider} configurado.`, now),
  ]);
  return getPlatformData();
}

export async function testEmailSettingsAction(): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const testedAt = new Date().toISOString();
  const delivery = await sendTransactionalEmail({
    to: session.user.email,
    subject: 'Prueba de correo de Savia',
    text: 'La configuración de correo transaccional de Savia funciona correctamente.',
    html: '<p>La configuración de correo transaccional de <strong>Savia</strong> funciona correctamente.</p>',
  });
  await dbBatch([
    {
      sql: `UPDATE platform_email_settings SET last_tested_at = ?, last_test_status = ?,
              last_test_message = ?, status = ?, updated_at = ? WHERE id = 'default'`,
      bindings: [testedAt, delivery.sent ? 'ok' : 'error', delivery.error ?? 'Mensaje de prueba enviado.', delivery.sent ? 'active' : 'error', testedAt],
    },
    platformAudit(session.user.id, delivery.sent ? 'email.test_ok' : 'email.test_error', 'platform', 'email', delivery.error ?? 'Mensaje de prueba enviado.', testedAt),
  ]);
  if (!delivery.sent) throw new Error(delivery.error || 'La prueba de correo falló.');
  return getPlatformData();
}

export async function updateRetentionSettingsAction(input: {
  tenantId: string;
  messageRetentionDays: number;
  documentRetentionDays: number;
  auditRetentionDays: number;
  automaticCleanup: boolean;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const messageDays = clampInteger(input.messageRetentionDays, 30, 3_650, 'Retención de mensajes');
  const documentDays = clampInteger(input.documentRetentionDays, 30, 3_650, 'Retención de documentos');
  const auditDays = clampInteger(input.auditRetentionDays, 365, 3_650, 'Retención de auditoría');
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `UPDATE tenant_retention_settings SET message_retention_days = ?,
              document_retention_days = ?, audit_retention_days = ?, automatic_cleanup = ?,
              updated_by = ?, updated_at = ? WHERE tenant_id = ?`,
      bindings: [messageDays, documentDays, auditDays, input.automaticCleanup ? 1 : 0, session.user.id, now, input.tenantId],
    },
    platformAudit(session.user.id, 'tenant.retention_updated', 'tenant', input.tenantId, 'Política de retención actualizada.', now),
  ]);
  return getPlatformData();
}

export async function updateTenantAiLimitsAction(input: {
  tenantId: string;
  dailyRequestLimit: number;
  monthlyTokenLimit: number;
  monthlyCostLimitCents: number;
  inputCostCentsPerMillion: number;
  outputCostCentsPerMillion: number;
}): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const daily = clampInteger(input.dailyRequestLimit, 1, 1_000_000, 'Límite diario');
  const tokens = clampInteger(input.monthlyTokenLimit, 1_000, 2_000_000_000, 'Límite mensual de tokens');
  const cost = clampInteger(input.monthlyCostLimitCents, 1, 100_000_000, 'Límite mensual de costo');
  const inputRate = clampInteger(input.inputCostCentsPerMillion, 0, 100_000_000, 'Costo de entrada');
  const outputRate = clampInteger(input.outputCostCentsPerMillion, 0, 100_000_000, 'Costo de salida');
  const now = new Date().toISOString();
  await dbBatch([
    {
      sql: `INSERT INTO tenant_ai_settings
              (tenant_id, daily_request_limit, monthly_token_limit, monthly_cost_limit_cents,
               input_cost_cents_per_million, output_cost_cents_per_million, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tenant_id) DO UPDATE SET daily_request_limit = excluded.daily_request_limit,
              monthly_token_limit = excluded.monthly_token_limit,
              monthly_cost_limit_cents = excluded.monthly_cost_limit_cents,
              input_cost_cents_per_million = excluded.input_cost_cents_per_million,
              output_cost_cents_per_million = excluded.output_cost_cents_per_million,
              updated_by = ?, updated_at = excluded.updated_at`,
      bindings: [input.tenantId, daily, tokens, cost, inputRate, outputRate, now, session.user.id],
    },
    platformAudit(session.user.id, 'tenant.ai_limits_updated', 'tenant', input.tenantId, 'Límites de consumo de IA actualizados.', now),
  ]);
  return getPlatformData();
}

export async function rotateEncryptedSecretsAction(): Promise<PlatformData> {
  const session = await requirePlatformUser({ mutation: true });
  const activeKey = activeMasterKeyId();
  if (!activeKey) throw new Error('Configura SAVIA_ACTIVE_MASTER_KEY_ID y SAVIA_MASTER_KEYS_JSON antes de rotar.');
  const [connections, channels, emails] = await Promise.all([
    dbAll<{ id: string; encrypted_api_key: string | null }>(
      'SELECT id, encrypted_api_key FROM ai_provider_connections WHERE encrypted_api_key IS NOT NULL',
    ),
    dbAll<{
      tenant_id: string;
      encrypted_access_token: string | null;
      encrypted_app_secret: string | null;
      encrypted_verify_token: string | null;
    }>(`SELECT tenant_id, encrypted_access_token, encrypted_app_secret, encrypted_verify_token
        FROM tenant_channel_settings`),
    dbAll<{ id: string; encrypted_api_key: string | null }>(
      'SELECT id, encrypted_api_key FROM platform_email_settings WHERE encrypted_api_key IS NOT NULL',
    ),
  ]);
  const writes: Array<{ sql: string; bindings?: unknown[] }> = [];
  for (const connection of connections) {
    if (!secretNeedsRotation(connection.encrypted_api_key)) continue;
    const plain = await decryptSecret(connection.encrypted_api_key);
    if (plain) writes.push({
      sql: 'UPDATE ai_provider_connections SET encrypted_api_key = ?, updated_at = ? WHERE id = ?',
      bindings: [await encryptSecret(plain), new Date().toISOString(), connection.id],
    });
  }
  for (const channel of channels) {
    const access = await rotateEnvelope(channel.encrypted_access_token);
    const appSecret = await rotateEnvelope(channel.encrypted_app_secret);
    const verify = await rotateEnvelope(channel.encrypted_verify_token);
    if (access === channel.encrypted_access_token && appSecret === channel.encrypted_app_secret && verify === channel.encrypted_verify_token) continue;
    writes.push({
      sql: `UPDATE tenant_channel_settings SET encrypted_access_token = ?, encrypted_app_secret = ?,
              encrypted_verify_token = ?, updated_at = ? WHERE tenant_id = ?`,
      bindings: [access, appSecret, verify, new Date().toISOString(), channel.tenant_id],
    });
  }
  for (const email of emails) {
    if (!secretNeedsRotation(email.encrypted_api_key)) continue;
    const plain = await decryptSecret(email.encrypted_api_key);
    if (plain) writes.push({
      sql: 'UPDATE platform_email_settings SET encrypted_api_key = ?, updated_at = ? WHERE id = ?',
      bindings: [await encryptSecret(plain), new Date().toISOString(), email.id],
    });
  }
  const now = new Date().toISOString();
  writes.push(platformAudit(
    session.user.id,
    'secrets.rotated',
    'platform',
    activeKey,
    `${writes.length} registro(s) migrados a la llave ${activeKey}.`,
    now,
  ));
  await dbBatch(writes);
  return getPlatformData();
}

async function rotateEnvelope(envelope: string | null): Promise<string | null> {
  if (!secretNeedsRotation(envelope)) return envelope;
  const plain = await decryptSecret(envelope);
  return plain ? encryptSecret(plain) : null;
}

async function requireMembership(tenantId: string, userId: string): Promise<{
  role: TenantRole;
  tenant_name: string;
}> {
  const membership = await dbFirst<{ role: TenantRole; tenant_name: string }>(
    `SELECT m.role, t.name AS tenant_name
     FROM tenant_memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.tenant_id = ? AND m.user_id = ?`,
    tenantId,
    userId,
  );
  if (!membership) throw new Error('La membresía ya no existe.');
  return membership;
}

async function assertOwnerContinuity(
  tenantId: string,
  currentRole: TenantRole,
  nextRole: TenantRole | null,
): Promise<void> {
  if (currentRole !== 'owner' || nextRole === 'owner') return;
  const owners = await dbFirst<{ count: number }>(
    "SELECT COUNT(*) AS count FROM tenant_memberships WHERE tenant_id = ? AND role = 'owner'",
    tenantId,
  );
  if ((owners?.count ?? 0) <= 1) {
    throw new Error('Asigna otro propietario antes de retirar al último propietario del tenant.');
  }
}

async function assertAnotherSuperadmin(targetUserId: string): Promise<void> {
  const target = await dbFirst<{ role: PlatformRole; status: AccountStatus }>(
    'SELECT role, status FROM platform_roles WHERE user_id = ?',
    targetUserId,
  );
  if (target?.role !== 'superadmin' || target.status !== 'active') return;
  const others = await dbFirst<{ count: number }>(
    `SELECT COUNT(*) AS count FROM platform_roles
     WHERE role = 'superadmin' AND status = 'active' AND user_id != ?`,
    targetUserId,
  );
  if ((others?.count ?? 0) === 0) throw new Error('La plataforma debe conservar al menos un superadministrador activo.');
}

async function assertConnectionSupports(connectionId: string, purpose: 'llm' | 'embedding'): Promise<void> {
  const connection = await dbFirst<{ provider: AiProvider; purpose: AiPurpose; status: string }>(
    'SELECT provider, purpose, status FROM ai_provider_connections WHERE id = ?',
    connectionId,
  );
  if (!connection || connection.status !== 'active') throw new Error('La conexión de IA no existe o está desactivada.');
  if (connection.purpose !== 'both' && connection.purpose !== purpose) {
    throw new Error(`La conexión seleccionada no admite ${purpose === 'llm' ? 'LLM' : 'embeddings'}.`);
  }
  if (purpose === 'llm' && connection.provider === 'voyage') {
    throw new Error('Voyage está disponible únicamente para embeddings.');
  }
  if (purpose === 'embedding' && connection.provider === 'anthropic') {
    throw new Error('Anthropic no ofrece un modelo de embeddings en esta integración.');
  }
}

function assertProviderPurpose(provider: AiProvider, purpose: AiPurpose): void {
  if (provider === 'anthropic' && purpose !== 'llm') {
    throw new Error('Anthropic debe configurarse como conexión LLM.');
  }
  if (provider === 'voyage' && purpose !== 'embedding') {
    throw new Error('Voyage debe configurarse como conexión de embeddings.');
  }
}

function platformAudit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
  createdAt: string,
): { sql: string; bindings: unknown[] } {
  return { sql: platformAuditSql(), bindings: platformAuditBindings(userId, action, entityType, entityId, detail, createdAt) };
}

function platformAuditSql(): string {
  return `INSERT INTO platform_audit_logs
            (id, user_id, action, entity_type, entity_id, detail, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`;
}

function platformAuditBindings(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
  createdAt: string,
): unknown[] {
  return [`paudit_${crypto.randomUUID()}`, userId, action, entityType, entityId, detail, createdAt];
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const cleaned = String(value ?? '').trim().replace(/\u0000/g, '');
  if (!cleaned) throw new Error(`${label} es obligatorio.`);
  return cleaned.slice(0, maxLength);
}

function validBindingName(value: unknown, label: string): string {
  const binding = requiredText(value, `Binding ${label}`, 64).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(binding)) {
    throw new Error(`El binding ${label} debe usar mayúsculas, números y guiones bajos.`);
  }
  return binding;
}

function optionalText(value: unknown, maxLength: number): string | null {
  const cleaned = String(value ?? '').trim().replace(/\u0000/g, '');
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function validEmail(value: unknown): string {
  const email = requiredText(value, 'Correo', 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('El correo no es válido.');
  return email;
}

function validOptionalUrl(value: unknown): string | null {
  const raw = optionalText(value, 500);
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('La URL base no es válida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('La URL debe usar HTTP o HTTPS.');
  if (parsed.username || parsed.password) throw new Error('La URL base no puede contener credenciales.');
  if (parsed.search || parsed.hash) throw new Error('La URL base no puede contener query ni fragmento.');
  if (env.SAVIA_ENVIRONMENT !== 'local' && parsed.protocol !== 'https:') {
    throw new Error('Fuera del entorno local, la URL base debe usar HTTPS.');
  }
  if (env.SAVIA_ENVIRONMENT !== 'local' && isPrivateHostname(parsed.hostname)) {
    throw new Error('La URL base no puede apuntar a una red privada en este entorno.');
  }
  return raw.replace(/\/$/, '');
}

function isPrivateHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(hostname) || hostname.startsWith('fe80:')) return true;
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 198 && (second === 18 || second === 19));
}

function clampInteger(value: number, min: number, max: number, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} debe estar entre ${min} y ${max}.`);
  }
  return number;
}

function toSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function defaultBusinessHours(): string {
  return JSON.stringify({
    lunes: { open: '08:00', close: '18:00', enabled: true },
    martes: { open: '08:00', close: '18:00', enabled: true },
    miercoles: { open: '08:00', close: '18:00', enabled: true },
    jueves: { open: '08:00', close: '18:00', enabled: true },
    viernes: { open: '08:00', close: '18:00', enabled: true },
    sabado: { open: '09:00', close: '13:00', enabled: true },
    domingo: { open: '09:00', close: '13:00', enabled: false },
  });
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function safeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'El proveedor no respondió correctamente.';
  return message.replace(/sk-[A-Za-z0-9_-]+/g, '[credencial]').slice(0, 300);
}
