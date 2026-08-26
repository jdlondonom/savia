import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Savia — Conversaciones que hacen crecer',
    template: '%s · Savia',
  },
  description: 'Atención inteligente por WhatsApp, CRM y agenda en un solo lugar.',
  applicationName: 'Savia',
  icons: { icon: '/savia-mark.png', apple: '/savia-mark.png' },
  openGraph: {
    title: 'Savia — Conversaciones que hacen crecer',
    description: 'Atención inteligente por WhatsApp, CRM y agenda en un solo lugar.',
    type: 'website',
    locale: 'es_CO',
    images: [{ url: '/og.png', width: 1672, height: 943, alt: 'Savia — Conversaciones que hacen crecer' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Savia — Conversaciones que hacen crecer',
    description: 'Atención inteligente por WhatsApp, CRM y agenda en un solo lugar.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
