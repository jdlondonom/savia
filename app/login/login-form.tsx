'use client';

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { Turnstile } from '@/app/turnstile';
import { authClient } from '@/lib/auth-client';

export function LoginForm({ returnTo, turnstileSiteKey }: { returnTo: string; turnstileSiteKey: string | null }) {
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    window.sessionStorage.setItem('savia_return_to', returnTo);
    setError('');
    startTransition(async () => {
      const result = await authClient.signIn.email({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        rememberMe: false,
        callbackURL: returnTo,
      }, captchaToken ? { headers: { 'x-captcha-response': captchaToken } } : undefined);
      setCaptchaToken('');
      setCaptchaAttempt((value) => value + 1);
      if (result.error) {
        setError('Correo o contraseña incorrectos. Verifica los datos e inténtalo nuevamente.');
        return;
      }
      const needsSecondFactor = result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect === true;
      if (!needsSecondFactor) window.location.assign('/mfa-enroll');
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#648073]">Bienvenido</p><h2 className="mt-2 text-2xl font-black tracking-tight">Inicia sesión en Savia</h2></div>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Correo</span><input required name="email" type="email" autoComplete="email" className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-sm shadow-sm focus:border-[#628c76]" /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Contraseña</span><input required name="password" type="password" autoComplete="current-password" className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-sm shadow-sm focus:border-[#628c76]" /></label>
      <Turnstile key={captchaAttempt} siteKey={turnstileSiteKey} onToken={setCaptchaToken} />
      {error ? <p role="alert" className="rounded-xl border border-[#efc4be] bg-[#fff3f1] p-3 text-sm font-semibold text-[#9b3428]">{error}</p> : null}
      <button disabled={pending || Boolean(turnstileSiteKey && !captchaToken)} className="w-full rounded-xl bg-[#173f34] px-5 py-3.5 text-sm font-black text-white hover:bg-[#205445] disabled:opacity-60">{pending ? 'Verificando…' : 'Continuar'}</button>
      <Link href="/forgot-password" className="block text-center text-xs font-extrabold text-[#426d5d] hover:underline">¿Olvidaste tu contraseña?</Link>
      <p className="text-center text-xs leading-5 text-[#7a8981]">No hay registro público. Las cuentas se crean desde una invitación del administrador.</p>
    </form>
  );
}
