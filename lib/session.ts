import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { dbFirst, dbRun, ensureDatabase } from '@/lib/database';

export type PlatformRole = 'superadmin' | 'support';

export type SaviaSession = {
  auth: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  user: {
    id: string;
    email: string;
    name: string;
    status: 'active' | 'suspended';
  };
  platformRole: PlatformRole | null;
  mfaEnabled: boolean;
};

export async function getOptionalSaviaSession(): Promise<SaviaSession | null> {
  await ensureDatabase();
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) return null;

  const appUser = await dbFirst<{
    id: string;
    email: string;
    name: string;
    status: 'active' | 'suspended';
    last_login_at: string | null;
  }>(
    'SELECT id, email, name, status, last_login_at FROM users WHERE id = ? AND lower(email) = lower(?)',
    authSession.user.id,
    authSession.user.email,
  );
  if (!appUser || appUser.status !== 'active') return null;

  if (!appUser.last_login_at || Date.now() - new Date(appUser.last_login_at).getTime() > 15 * 60_000) {
    const now = new Date().toISOString();
    await dbRun('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', now, now, appUser.id).catch(() => undefined);
  }

  const platform = await dbFirst<{ role: PlatformRole }>(
    `SELECT role FROM platform_roles
     WHERE user_id = ? AND status = 'active'`,
    appUser.id,
  );

  return {
    auth: authSession,
    user: {
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      status: appUser.status,
    },
    platformRole: platform?.role ?? null,
    mfaEnabled: Boolean(authSession.user.twoFactorEnabled),
  };
}

export async function requireSaviaSession(options: {
  allowMfaEnrollment?: boolean;
  returnTo?: string;
} = {}): Promise<SaviaSession> {
  const session = await getOptionalSaviaSession();
  if (!session) redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo(options.returnTo))}`);
  if (!session.mfaEnabled && !options.allowMfaEnrollment) redirect('/mfa-enroll');
  return session;
}

export async function requirePlatformUser(options: {
  mutation?: boolean;
} = {}): Promise<SaviaSession> {
  const session = await requireSaviaSession({ returnTo: '/platform' });
  if (!session.platformRole) throw new Error('No tienes acceso a la administración de la plataforma.');
  if (options.mutation && session.platformRole !== 'superadmin') {
    throw new Error('Esta acción requiere el rol de superadministrador global.');
  }
  return session;
}

function safeReturnTo(value?: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
