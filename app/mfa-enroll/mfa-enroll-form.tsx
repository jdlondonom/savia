'use client';

import { useState, useTransition, type FormEvent } from 'react';
import QRCode from 'react-qr-code';
import { authClient } from '@/lib/auth-client';

export function MfaEnrollForm({ email }: { email: string }) {
  const [password, setPassword] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await authClient.twoFactor.enable({ password, method: 'totp', issuer: 'Savia' });
      if (result.error || !result.data || result.data.method !== 'totp') {
        setError(result.error?.message || 'No fue posible preparar el autenticador.');
        return;
      }
      setTotpUri(result.data.totpURI);
      setBackupCodes(result.data.backupCodes);
    });
  }

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    startTransition(async () => {
      const result = await authClient.twoFactor.verifyTotp({ code: String(form.get('code') ?? ''), trustDevice: false });
      if (result.error) {
        setError(result.error.message || 'El código no es válido.');
        return;
      }
      const returnTo = window.sessionStorage.getItem('savia_return_to') ?? '/';
      window.sessionStorage.removeItem('savia_return_to');
      window.location.assign(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/');
    });
  }

  if (!totpUri) {
    return (
      <form onSubmit={begin} className="space-y-5">
        <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#648073]">Paso 2 de 2</p><h2 className="mt-2 text-2xl font-black tracking-tight">Activar MFA</h2><p className="mt-2 text-sm text-[#718078]">Cuenta: {email}</p></div>
        <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Confirma tu contraseña</span><input required value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-sm shadow-sm" /></label>
        {error ? <ErrorNotice text={error} /> : null}
        <button disabled={pending} className="w-full rounded-xl bg-[#173f34] px-5 py-3.5 text-sm font-black text-white">{pending ? 'Preparando…' : 'Generar código QR'}</button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#648073]">Escanea y confirma</p><h2 className="mt-2 text-2xl font-black tracking-tight">Vincula tu autenticador</h2></div>
      <div className="mx-auto w-fit rounded-2xl border border-[#d9e3dc] bg-white p-4"><QRCode value={totpUri} size={190} /></div>
      <details className="rounded-xl border border-[#d9e3dc] p-3 text-xs text-[#64746c]"><summary className="cursor-pointer font-bold">No puedo escanear el QR</summary><p className="mt-2 break-all leading-5">{totpUri}</p></details>
      <form onSubmit={verify} className="space-y-4">
        <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.08em] text-[#687970]">Código de 6 dígitos</span><input required name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" className="w-full rounded-xl border border-[#d6e1da] px-4 py-3 text-center text-xl font-black tracking-[.35em]" /></label>
        {error ? <ErrorNotice text={error} /> : null}
        <button disabled={pending} className="w-full rounded-xl bg-[#173f34] px-5 py-3.5 text-sm font-black text-white">{pending ? 'Verificando…' : 'Activar MFA y entrar'}</button>
      </form>
      <div className="rounded-xl border border-[#eadf9f] bg-[#fffbea] p-4"><p className="text-xs font-black uppercase tracking-[.08em] text-[#7a6510]">Códigos de recuperación</p><p className="mt-1 text-xs leading-5 text-[#786d3d]">Guárdalos ahora en un lugar seguro. Cada código funciona una sola vez.</p><div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs font-bold text-[#413a20]">{backupCodes.map((code) => <span key={code} className="rounded bg-white px-2 py-1.5">{code}</span>)}</div></div>
    </div>
  );
}

function ErrorNotice({ text }: { text: string }) {
  return <p role="alert" className="rounded-xl border border-[#efc4be] bg-[#fff3f1] p-3 text-sm font-semibold text-[#9b3428]">{text}</p>;
}
