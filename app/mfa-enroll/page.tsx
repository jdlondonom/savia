import { redirect } from 'next/navigation';
import { AuthShell } from '@/app/auth-shell';
import { MfaEnrollForm } from '@/app/mfa-enroll/mfa-enroll-form';
import { requireSaviaSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MfaEnrollPage() {
  const session = await requireSaviaSession({ allowMfaEnrollment: true, returnTo: '/mfa-enroll' });
  if (session.mfaEnabled) redirect('/');
  return (
    <AuthShell eyebrow="Seguridad obligatoria" title="Protege tu cuenta con un segundo factor." description="Escanea el código con Google Authenticator, Microsoft Authenticator, 1Password u otra aplicación compatible con TOTP.">
      <MfaEnrollForm email={session.user.email} />
    </AuthShell>
  );
}
