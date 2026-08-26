import { AuthShell } from '@/app/auth-shell';
import { ResetPasswordForm } from '@/app/reset-password/reset-password-form';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  const token = query.token ?? '';
  return (
    <AuthShell eyebrow="Enlace de un solo uso" title="Crea una nueva contraseña." description="Al completar el cambio se cerrarán las sesiones anteriores. Después ingresarás nuevamente con MFA.">
      <ResetPasswordForm token={token} invalid={Boolean(query.error || !token)} />
    </AuthShell>
  );
}
