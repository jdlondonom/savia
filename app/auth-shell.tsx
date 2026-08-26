import Image from 'next/image';
import type { ReactNode } from 'react';

export function AuthShell({ eyebrow, title, description, children }: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f4f6f1] px-5 py-10 text-[#17362d] sm:py-16">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-[#d9e3dc] bg-white shadow-[0_30px_90px_rgba(23,63,52,.12)] lg:grid-cols-[.9fr_1.1fr]">
        <section className="relative overflow-hidden bg-[#173f34] p-8 text-white sm:p-12">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[44px] border-[#d8f45f]/10" />
          <div className="relative flex min-h-[260px] flex-col justify-between lg:min-h-[560px]">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d8f45f] shadow-lg">
                <Image src="/savia-mark.png" alt="Savia" width={34} height={34} priority />
              </span>
              <div><p className="text-lg font-black tracking-tight">Savia</p><p className="text-xs text-[#a8c6bb]">Conversaciones que hacen crecer</p></div>
            </div>
            <div className="mt-16">
              <p className="text-xs font-extrabold uppercase tracking-[.22em] text-[#d8f45f]">{eyebrow}</p>
              <h1 className="mt-4 max-w-md text-4xl font-black leading-[1.05] tracking-[-.04em] sm:text-5xl">{title}</h1>
              <p className="mt-5 max-w-md text-sm leading-7 text-[#c2d7cf]">{description}</p>
            </div>
          </div>
        </section>
        <section className="flex items-center p-7 sm:p-12">
          <div className="w-full">{children}</div>
        </section>
      </div>
    </main>
  );
}
