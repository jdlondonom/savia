'use client';

import Link from 'next/link';
import { useState, useTransition, type FormEvent } from 'react';
import { Turnstile } from '@/app/turnstile';
import { authClient } from '@/lib/auth-client';

export function ForgotPasswordForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [captchaToken, setCaptchaToken] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    startTransition(async () => {
      await authClient.requestPasswordReset(
        { email, redirectTo: '/reset-password' },
        captchaToken ? { headers: { 'x-captcha-response': captchaToken } } : undefined,
      );
      setSent(true);
    });
  }
  if (sent) return <div className="space-y-5"><p className="rounded-xl bg-[#eef7ef] p-4 text-sm leading-6 text-[#315f47]">Si existe una cuenta activa para ese correo, recibirás un enlace durante los próximos minutos.</p><Link href="/login" className="block text-center text-sm font-black text-[#315f47]">Volver al inicio de sesión</Link></div>;
  return <form onSubmit={submit} className="space-y-5"><label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Correo</span><input required name="email" type="email" autoComplete="email" className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-sm" /></label><Turnstile siteKey={turnstileSiteKey} onToken={setCaptchaToken} /><button disabled={pending || Boolean(turnstileSiteKey && !captchaToken)} className="w-full rounded-xl bg-[#173f34] px-5 py-3.5 text-sm font-black text-white disabled:opacity-60">{pending ? 'Procesando…' : 'Enviar enlace seguro'}</button><Link href="/login" className="block text-center text-xs font-bold text-[#65776e]">Cancelar</Link></form>;
}
