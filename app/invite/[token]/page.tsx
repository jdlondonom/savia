import { AuthShell } from '@/app/auth-shell';
import { env } from 'cloudflare:workers';
import { getInvitationPreview } from '@/app/auth-actions';
import { InviteForm } from '@/app/invite/[token]/invite-form';

export const dynamic = 'force-dynamic';

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationPreview(token);
  if (!invitation) {
    return <AuthShell eyebrow="Invitación" title="Este enlace ya no está disponible." description="La invitación pudo expirar, ser revocada o haber sido utilizada. Solicita un nuevo enlace al administrador."><a href="/login" className="block w-full rounded-xl bg-[#173f34] px-5 py-3.5 text-center text-sm font-black text-white">Ir al inicio de sesión</a></AuthShell>;
  }
  return (
    <AuthShell eyebrow="Invitación privada" title={`Únete a ${invitation.tenantName ?? 'la administración de Savia'}.`} description="Tu cuenta quedará limitada al acceso indicado en esta invitación y requerirá MFA antes de mostrar cualquier información.">
      <InviteForm token={token} invitation={invitation} turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null} />
    </AuthShell>
  );
}
