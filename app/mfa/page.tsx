import { redirect } from 'next/navigation';
import { AuthShell } from '@/app/auth-shell';
import { MfaChallengeForm } from '@/app/mfa/mfa-challenge-form';
import { getOptionalSaviaSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MfaPage() {
  const session = await getOptionalSaviaSession();
  if (session?.mfaEnabled) redirect('/');
  if (session) redirect('/mfa-enroll');
  return (
    <AuthShell eyebrow="Segundo factor" title="Confirma que realmente eres tú." description="Introduce el código que aparece en tu aplicación autenticadora. No se recordarán dispositivos: cada sesión nueva exige MFA.">
      <MfaChallengeForm />
    </AuthShell>
  );
}
