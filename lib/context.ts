import { cookies } from 'next/headers';
import { dbAll, dbFirst, ensureDatabase } from '@/lib/database';
import { requireSaviaSession, type PlatformRole } from '@/lib/session';
import type { AppUser, MemberTenant, Tenant } from '@/lib/types';

const TENANT_COOKIE = 'savia_tenant';

type UserRow = { id: string; email: string; name: string };
type MembershipRow = MemberTenant;
type TenantRow = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  timezone: string;
  assistant_name: string;
  assistant_tone: string;
  assistant_prompt: string;
  business_hours_json: string;
};

export type AppContext = {
  user: AppUser;
  tenant: Tenant;
  tenants: MemberTenant[];
  platformRole: PlatformRole | null;
};

export async function getAppContext(): Promise<AppContext> {
  await ensureDatabase();
  const session = await requireSaviaSession();
  const user: UserRow = session.user;
  const memberships = session.platformRole === 'superadmin'
    ? await dbAll<MembershipRow>(
      `SELECT t.id, t.slug, t.name, COALESCE(m.role, 'owner') AS role
       FROM tenants t
       LEFT JOIN tenant_memberships m ON m.tenant_id = t.id AND m.user_id = ?
       WHERE t.status = 'active'
       ORDER BY t.name`,
      user.id,
    )
    : await dbAll<MembershipRow>(
      `SELECT t.id, t.slug, t.name, m.role
       FROM tenant_memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = ? AND t.status = 'active'
       ORDER BY t.name`,
      user.id,
    );

  if (memberships.length === 0) {
    throw new Error('Tu cuenta no tiene espacios de trabajo asignados.');
  }

  const cookieStore = await cookies();
  const requestedSlug = cookieStore.get(TENANT_COOKIE)?.value;
  const membership = memberships.find((item) => item.slug === requestedSlug) ?? memberships[0];
  const tenantRow = await dbFirst<TenantRow>(
    `SELECT id, slug, name, industry, timezone, assistant_name, assistant_tone, assistant_prompt, business_hours_json
     FROM tenants WHERE id = ?`,
    membership.id,
  );

  if (!tenantRow) throw new Error('El espacio de trabajo seleccionado ya no existe.');

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: membership.role,
      platformRole: session.platformRole,
      mfaEnabled: session.mfaEnabled,
      sessionExpiresAt: new Date(session.auth.session.expiresAt).toISOString(),
    },
    tenant: mapTenant(tenantRow),
    tenants: memberships,
    platformRole: session.platformRole,
  };
}

export async function getContextForTenantSlug(slug: string): Promise<AppContext> {
  const context = await getAppContext();
  const membership = context.tenants.find((tenant) => tenant.slug === slug);
  if (!membership) throw new Error('No tienes acceso a ese espacio de trabajo.');

  const tenantRow = await dbFirst<TenantRow>(
    `SELECT id, slug, name, industry, timezone, assistant_name, assistant_tone, assistant_prompt, business_hours_json
     FROM tenants WHERE id = ?`,
    membership.id,
  );
  if (!tenantRow) throw new Error('El espacio de trabajo no existe.');

  return {
    ...context,
    user: { ...context.user, role: membership.role },
    tenant: mapTenant(tenantRow),
  };
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  await ensureDatabase();
  const tenantRow = await dbFirst<TenantRow>(
    `SELECT id, slug, name, industry, timezone, assistant_name, assistant_tone, assistant_prompt, business_hours_json
     FROM tenants WHERE slug = ? AND status = 'active'`,
    slug,
  );
  return tenantRow ? mapTenant(tenantRow) : null;
}

export async function setTenantCookie(slug: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TENANT_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
}

export function mapTenant(row: TenantRow): Tenant {
  let businessHours: Tenant['businessHours'] = {};
  try {
    businessHours = JSON.parse(row.business_hours_json) as Tenant['businessHours'];
  } catch {
    businessHours = {};
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    industry: row.industry,
    timezone: row.timezone,
    assistantName: row.assistant_name,
    assistantTone: row.assistant_tone,
    assistantPrompt: row.assistant_prompt,
    businessHours,
  };
}
