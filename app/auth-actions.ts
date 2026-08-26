'use server';

import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { provisionCredentialUser } from '@/lib/auth';
import { dbBatch, dbFirst, dbRun, ensureDatabase } from '@/lib/database';

export type InvitationPreview = {
  email: string;
  name: string;
  tenantName: string | null;
  tenantRole: 'owner' | 'admin' | 'advisor' | null;
  platformRole: 'superadmin' | 'support' | null;
  expiresAt: string;
};

export async function platformSetupRequired(): Promise<boolean> {
  await ensureDatabase();
  const row = await dbFirst<{ count: number }>(
    "SELECT COUNT(*) AS count FROM platform_roles WHERE role = 'superadmin' AND status = 'active'",
  );
  return (row?.count ?? 0) === 0;
}

export async function bootstrapPlatformAction(input: {
  name: string;
  email: string;
  password: string;
  bootstrapToken?: string;
}): Promise<{ email: string }> {
  await ensureDatabase();
  await requireBootstrapRequest(input.bootstrapToken);
  if (!(await platformSetupRequired())) throw new Error('Savia ya tiene un superadministrador configurado.');

  const name = requiredText(input.name, 'Nombre', 120);
  const email = validEmail(input.email);
  validatePassword(input.password);
  await assertAppEmailAvailable(email);

  const authUser = await provisionCredentialUser({ name, email, password: input.password });
  const now = new Date().toISOString();
  try {
    await dbBatch([
      {
        sql: `INSERT INTO users (id, email, name, status, created_at, updated_at)
              VALUES (?, ?, ?, 'active', ?, ?)`,
        bindings: [authUser.id, authUser.email, authUser.name, now, now],
      },
      {
        sql: `INSERT INTO platform_roles (user_id, role, status, created_at, updated_at)
              VALUES (?, 'superadmin', 'active', ?, ?)`,
        bindings: [authUser.id, now, now],
      },
      platformAudit(authUser.id, 'platform.bootstrapped', 'user', authUser.id, 'Primer superadministrador creado.', now),
    ]);
  } catch (error) {
    await removeProvisionedAuthUser(authUser.id);
    throw error;
  }

  return { email: authUser.email };
}

export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  await ensureDatabase();
  const tokenHash = await sha256(token);
  const invitation = await dbFirst<{
    email: string;
    name: string;
    tenant_name: string | null;
    tenant_role: InvitationPreview['tenantRole'];
    platform_role: InvitationPreview['platformRole'];
    expires_at: string;
  }>(
    `SELECT i.email, i.name, t.name AS tenant_name, i.tenant_role, i.platform_role, i.expires_at
     FROM tenant_invitations i
     LEFT JOIN tenants t ON t.id = i.tenant_id
     WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL
       AND i.expires_at > ?`,
    tokenHash,
    new Date().toISOString(),
  );
  if (!invitation) return null;
  return {
    email: invitation.email,
    name: invitation.name,
    tenantName: invitation.tenant_name,
    tenantRole: invitation.tenant_role,
    platformRole: invitation.platform_role,
    expiresAt: invitation.expires_at,
  };
}

export async function acceptInvitationAction(input: {
  token: string;
  name: string;
  password: string;
}): Promise<{ email: string }> {
  await ensureDatabase();
  const tokenHash = await sha256(requiredText(input.token, 'Invitación', 300));
  const invitation = await dbFirst<{
    id: string;
    tenant_id: string | null;
    email: string;
    name: string;
    tenant_role: InvitationPreview['tenantRole'];
    platform_role: InvitationPreview['platformRole'];
    invited_by: string;
    expires_at: string;
  }>(
    `SELECT id, tenant_id, email, name, tenant_role, platform_role, invited_by, expires_at
     FROM tenant_invitations
     WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
    tokenHash,
  );
  if (!invitation || invitation.expires_at <= new Date().toISOString()) {
    throw new Error('La invitación no existe, expiró o ya fue utilizada.');
  }

  const name = requiredText(input.name || invitation.name, 'Nombre', 120);
  validatePassword(input.password);
  await assertAppEmailAvailable(invitation.email);
  const existingAuth = await dbFirst<{ id: string }>('SELECT id FROM auth_users WHERE lower(email) = lower(?)', invitation.email);
  if (existingAuth) throw new Error('Esta cuenta ya existe. Inicia sesión y solicita que te asignen el acceso directamente.');

  const authUser = await provisionCredentialUser({
    name,
    email: invitation.email,
    password: input.password,
  });
  const now = new Date().toISOString();
  const writes: Array<{ sql: string; bindings?: unknown[] }> = [
    {
      sql: `INSERT INTO users (id, email, name, status, created_at, updated_at)
            VALUES (?, ?, ?, 'active', ?, ?)`,
      bindings: [authUser.id, authUser.email, authUser.name, now, now],
    },
    {
      sql: 'UPDATE tenant_invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL',
      bindings: [now, invitation.id],
    },
  ];

  if (invitation.tenant_id && invitation.tenant_role) {
    writes.push({
      sql: `INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at)
            VALUES (?, ?, ?, ?)`,
      bindings: [invitation.tenant_id, authUser.id, invitation.tenant_role, now],
    });
    writes.push({
      sql: `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, detail, created_at)
            VALUES (?, ?, ?, 'member.joined', 'user', ?, ?, ?)`,
      bindings: [`audit_${crypto.randomUUID()}`, invitation.tenant_id, authUser.id, authUser.id, `${authUser.email} aceptó su invitación.`, now],
    });
  }
  if (invitation.platform_role) {
    writes.push({
      sql: `INSERT INTO platform_roles (user_id, role, status, created_at, updated_at)
            VALUES (?, ?, 'active', ?, ?)`,
      bindings: [authUser.id, invitation.platform_role, now, now],
    });
  }
  writes.push(platformAudit(authUser.id, 'invitation.accepted', 'invitation', invitation.id, `${authUser.email} activó su cuenta.`, now));

  try {
    await dbBatch(writes);
  } catch (error) {
    await removeProvisionedAuthUser(authUser.id);
    throw error;
  }
  return { email: authUser.email };
}

async function assertAppEmailAvailable(email: string): Promise<void> {
  const existing = await dbFirst<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower(?)', email);
  if (existing) throw new Error('Ya existe un usuario operativo con ese correo. Usa otro correo o gestiona su acceso desde la plataforma.');
}

async function removeProvisionedAuthUser(userId: string): Promise<void> {
  await dbRun('DELETE FROM auth_users WHERE id = ?', userId).catch(() => undefined);
}

async function requireBootstrapRequest(providedToken?: string): Promise<void> {
  if (env.SAVIA_ENVIRONMENT === 'production') {
    const expectedToken = env.SAVIA_BOOTSTRAP_TOKEN?.trim();
    if (!expectedToken || expectedToken.length < 32) {
      throw new Error('SAVIA_BOOTSTRAP_TOKEN no está configurado de forma segura.');
    }
    if (!constantTimeEqual(String(providedToken ?? ''), expectedToken)) {
      throw new Error('El token de inicialización productiva no es válido.');
    }
    return;
  }
  const requestHeaders = await headers();
  const host = (requestHeaders.get('host') ?? '').split(':')[0].replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('La creación del primer administrador solo está disponible desde este PC.');
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function platformAudit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
  createdAt: string,
): { sql: string; bindings: unknown[] } {
  return {
    sql: `INSERT INTO platform_audit_logs (id, user_id, action, entity_type, entity_id, detail, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    bindings: [`paudit_${crypto.randomUUID()}`, userId, action, entityType, entityId, detail, createdAt],
  };
}

function validEmail(value: unknown): string {
  const email = requiredText(value, 'Correo', 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('El correo no parece válido.');
  return email;
}

function validatePassword(value: unknown): asserts value is string {
  const password = String(value ?? '');
  if (password.length < 12 || password.length > 128) {
    throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
  }
  if (!/[a-záéíóúñ]/i.test(password) || !/\d/.test(password) || !/[^\p{L}\p{N}]/u.test(password)) {
    throw new Error('Incluye letras, al menos un número y un símbolo.');
  }
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const text = String(value ?? '').trim().replace(/\u0000/g, '');
  if (!text) throw new Error(`${label} es obligatorio.`);
  return text.slice(0, maxLength);
}
