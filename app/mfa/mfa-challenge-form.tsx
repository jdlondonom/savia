'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

export function MfaChallengeForm() {
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('code') ?? '').trim();
    setError('');
    startTransition(async () => {
      const result = useBackup
        ? await authClient.twoFactor.verifyBackupCode({ code: value, disableSession: false, trustDevice: false })
        : await authClient.twoFactor.verifyTotp({ code: value, trustDevice: false });
      if (result.error) {
        setError(result.error.status === 429 ? 'Demasiados intentos. La cuenta está bloqueada temporalmente.' : 'El código no es válido o ya expiró.');
        return;
      }
      window.location.assign(safeReturnTo());
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#648073]">Verificación</p><h2 className="mt-2 text-2xl font-black tracking-tight">{useBackup ? 'Código de recuperación' : 'Código del autenticador'}</h2></div>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Código</span><input required name="code" inputMode={useBackup ? 'text' : 'numeric'} autoComplete="one-time-code" className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-center text-xl font-black tracking-[.25em]" /></label>
      {error ? <p role="alert" className="rounded-xl border border-[#efc4be] bg-[#fff3f1] p-3 text-sm font-semibold text-[#9b3428]">{error}</p> : null}
      <button disabled={pending} className="w-full rounded-xl bg-[#173f34] px-5 py-3.5 text-sm font-black text-white">{pending ? 'Verificando…' : 'Entrar a Savia'}</button>
      <button type="button" onClick={() => { setUseBackup((value) => !value); setError(''); }} className="w-full text-sm font-bold text-[#456b5b] underline decoration-[#b8c8c0] underline-offset-4">{useBackup ? 'Usar el autenticador' : 'Usar un código de recuperación'}</button>
    </form>
  );
}

function safeReturnTo(): string {
  const value = window.sessionStorage.getItem('savia_return_to') ?? '/';
  window.sessionStorage.removeItem('savia_return_to');
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
