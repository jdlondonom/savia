import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { AuthShell } from '@/app/auth-shell';
import { platformSetupRequired } from '@/app/auth-actions';
import { SetupForm } from '@/app/setup/setup-form';
import { isDeployedEnvironment } from '@/lib/environment';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (!(await platformSetupRequired())) redirect('/login');
  return (
    <AuthShell
      eyebrow="Configuración inicial"
      title="Crea la cuenta que gobernará Savia."
      description="Esta cuenta podrá crear clientes, entregar accesos y configurar los modelos de IA. El registro se cerrará automáticamente después de este paso."
    >
      <SetupForm
        turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}
        requiresBootstrapToken={isDeployedEnvironment()}
      />
    </AuthShell>
  );
}
