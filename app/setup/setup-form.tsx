'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { bootstrapPlatformAction } from '@/app/auth-actions';
import { authClient } from '@/lib/auth-client';
import { Turnstile } from '@/app/turnstile';

export function SetupForm({
  turnstileSiteKey,
  requiresBootstrapToken,
}: {
  turnstileSiteKey: string | null;
  requiresBootstrapToken: boolean;
}) {
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      bootstrapToken: String(form.get('bootstrapToken') ?? ''),
    };
    setError('');
    startTransition(async () => {
      try {
        window.sessionStorage.setItem('savia_return_to', '/platform');
        const created = await bootstrapPlatformAction(input);
        const signedIn = await authClient.signIn.email({
          email: created.email,
          password: input.password,
          rememberMe: false,
        }, captchaToken ? { headers: { 'x-captcha-response': captchaToken } } : undefined);
        if (signedIn.error) throw new Error(signedIn.error.message || 'No fue posible iniciar sesión.');
        window.location.assign('/mfa-enroll');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No fue posible crear la cuenta.');
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#648073]">Paso 1 de 2</p><h2 className="mt-2 text-2xl font-black tracking-tight">Superadministrador global</h2><p className="mt-2 text-sm leading-6 text-[#718078]">Después configurarás el autenticador MFA obligatorio.</p></div>
      <Field label="Nombre completo" name="name" autoComplete="name" placeholder="Juan Londoño" />
      <Field label="Correo" name="email" type="email" autoComplete="email" placeholder="admin@tuempresa.com" />
      <Field label="Contraseña" name="password" type="password" autoComplete="new-password" placeholder="Mínimo 12 caracteres" />
      {requiresBootstrapToken
        ? <Field label="Token de inicialización" name="bootstrapToken" type="password" autoComplete="off" placeholder="Token temporal de producción" />
        : null}
      <p className="rounded-xl bg-[#f4f7f4] p-3 text-xs leading-5 text-[#607168]">Usa letras, al menos un número y un símbolo. Savia no permitirá el acceso sin configurar MFA.</p>
      <Turnstile siteKey={turnstileSiteKey} onToken={setCaptchaToken} />
      {error ? <p role="alert" className="rounded-xl border border-[#efc4be] bg-[#fff3f1] p-3 text-sm font-semibold text-[#9b3428]">{error}</p> : null}
      <button disabled={pending || Boolean(turnstileSiteKey && !captchaToken)} className="w-full rounded-xl bg-[#173f34] px-5 py-3.5 text-sm font-black text-white shadow-[0_12px_28px_rgba(23,63,52,.18)] hover:bg-[#205445] disabled:opacity-60">{pending ? 'Creando cuenta…' : 'Crear cuenta y configurar MFA'}</button>
    </form>
  );
}

function Field({ label, name, type = 'text', autoComplete, placeholder }: { label: string; name: string; type?: string; autoComplete: string; placeholder: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">{label}</span><input required name={name} type={type} autoComplete={autoComplete} placeholder={placeholder} className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-sm shadow-sm focus:border-[#628c76]" /></label>;
}
