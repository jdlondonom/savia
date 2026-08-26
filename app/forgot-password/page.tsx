import { env } from 'cloudflare:workers';
import { AuthShell } from '@/app/auth-shell';
import { ForgotPasswordForm } from '@/app/forgot-password/forgot-password-form';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <AuthShell eyebrow="Recuperación segura" title="Restablece tu contraseña." description="Si el correo pertenece a una cuenta activa, enviaremos un enlace de un solo uso. Tu MFA seguirá siendo obligatorio.">
      <ForgotPasswordForm turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null} />
    </AuthShell>
  );
}
