import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { AuthShell } from '@/app/auth-shell';
import { platformSetupRequired } from '@/app/auth-actions';
import { LoginForm } from '@/app/login/login-form';
import { getOptionalSaviaSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  if (await platformSetupRequired()) redirect('/setup');
  const session = await getOptionalSaviaSession();
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith('/') && !query.returnTo.startsWith('//') ? query.returnTo : '/';
  if (session?.mfaEnabled) redirect(returnTo);
  if (session) redirect('/mfa-enroll');

  return (
    <AuthShell eyebrow="Acceso seguro" title="Tu operación, protegida desde el primer mensaje." description="Cada usuario entra únicamente a los clientes que tiene asignados. El segundo factor es obligatorio en cada nueva sesión.">
      <LoginForm returnTo={returnTo} turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null} />
    </AuthShell>
  );
}
