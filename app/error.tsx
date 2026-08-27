'use client';

import { buildSessionLoginUrl } from '@/lib/session-expiry';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2] p-6 text-[#173f34]">
      <section className="max-w-md rounded-3xl border border-[#dbe4de] bg-white p-8 text-center shadow-[0_20px_70px_rgba(31,55,43,.09)]">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0c5] text-xl">!</div>
        <h1 className="text-2xl font-bold tracking-[-0.04em]">Savia no pudo abrir este espacio</h1>
        <p className="mt-3 text-sm leading-6 text-[#6f7d76]">No fue posible completar la carga. Puedes volver a iniciar sesión o intentarlo nuevamente.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button onClick={() => window.location.assign(buildSessionLoginUrl(window.location.pathname))} className="rounded-xl bg-[#173f34] px-5 py-2.5 text-sm font-bold text-white">Volver a iniciar sesión</button>
          <button onClick={reset} className="rounded-xl border border-[#d7e1db] bg-white px-5 py-2.5 text-sm font-bold text-[#284b3f]">Intentar de nuevo</button>
        </div>
      </section>
    </main>
  );
}
