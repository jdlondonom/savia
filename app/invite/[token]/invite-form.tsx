'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { acceptInvitationAction, type InvitationPreview } from '@/app/auth-actions';
import { authClient } from '@/lib/auth-client';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyMessage } from '@/lib/password-policy';
import { Turnstile } from '@/app/turnstile';

export function InviteForm({ token, invitation, turnstileSiteKey }: { token: string; invitation: InvitationPreview; turnstileSiteKey: string | null }) {
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const passwordError = passwordPolicyMessage(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setError('');
    startTransition(async () => {
      try {
        window.sessionStorage.setItem('savia_return_to', invitation.platformRole ? '/platform' : '/');
        const account = await acceptInvitationAction({ token, name: String(form.get('name') ?? ''), password });
        const login = await authClient.signIn.email(
          { email: account.email, password, rememberMe: false },
          captchaToken ? { headers: { 'x-captcha-response': captchaToken } } : undefined,
        );
        if (login.error) throw new Error(login.error.message || 'No fue posible iniciar sesión.');
        window.location.assign('/mfa-enroll');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No fue posible aceptar la invitación.');
      }
    });
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-xl bg-[#f4f7f4] p-4"><p className="text-xs font-black uppercase tracking-[.1em] text-[#65776e]">Acceso asignado</p><p className="mt-2 text-sm font-extrabold">{invitation.email}</p><p className="mt-1 text-xs text-[#718078]">Rol: {invitation.tenantRole ?? invitation.platformRole}</p></div>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Nombre completo</span><input required name="name" defaultValue={invitation.name} autoComplete="name" className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-sm" /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Crea una contraseña</span><input required name="password" type="password" autoComplete="new-password" placeholder="Mínimo 12 caracteres" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-sm" /></label>
      <Turnstile siteKey={turnstileSiteKey} onToken={setCaptchaToken} />
      {error ? <p role="alert" className="rounded-xl border border-[#efc4be] bg-[#fff3f1] p-3 text-sm font-semibold text-[#9b3428]">{error}</p> : null}
      <button disabled={pending || Boolean(turnstileSiteKey && !captchaToken)} className="w-full rounded-xl bg-[#173f34] px-5 py-3.5 text-sm font-black text-white disabled:opacity-60">{pending ? 'Creando acceso…' : 'Aceptar y configurar MFA'}</button>
    </form>
  );
}
