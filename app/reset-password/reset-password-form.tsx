'use client';

import Link from 'next/link';
import { useState, useTransition, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordForm({ token, invalid }: { token: string; invalid: boolean }) {
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [pending, startTransition] = useTransition();
  if (invalid) return <div className="space-y-4"><p className="rounded-xl bg-[#fff3f1] p-4 text-sm text-[#8f3d31]">El enlace es inválido o ya venció.</p><Link href="/forgot-password" className="block text-center text-sm font-black text-[#315f47]">Solicitar uno nuevo</Link></div>;
  if (complete) return <div className="space-y-4"><p className="rounded-xl bg-[#eef7ef] p-4 text-sm text-[#315f47]">La contraseña fue actualizada y las sesiones anteriores quedaron revocadas.</p><Link href="/login" className="block rounded-xl bg-[#173f34] px-5 py-3 text-center text-sm font-black text-white">Ingresar con MFA</Link></div>;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirmation') ?? '');
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setError('');
    startTransition(async () => {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) { setError('El enlace ya no es válido. Solicita uno nuevo.'); return; }
      setComplete(true);
    });
  }
  return <form onSubmit={submit} className="space-y-5"><label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Nueva contraseña</span><input required minLength={12} maxLength={128} name="password" type="password" autoComplete="new-password" className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-sm" /></label><label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Confirmación</span><input required minLength={12} maxLength={128} name="confirmation" type="password" autoComplete="new-password" className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-sm" /></label>{error ? <p role="alert" className="rounded-xl bg-[#fff3f1] p-3 text-sm text-[#8f3d31]">{error}</p> : null}<button disabled={pending} className="w-full rounded-xl bg-[#173f34] px-5 py-3.5 text-sm font-black text-white">{pending ? 'Actualizando…' : 'Cambiar contraseña'}</button></form>;
}
