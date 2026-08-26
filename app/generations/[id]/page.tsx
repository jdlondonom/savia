import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAppContext } from '@/lib/context';
import { tenantDbFirst } from '@/lib/tenant-database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Detalle de respuesta IA',
};

type GenerationRow = {
  id: string;
  conversation_id: string;
  user_message_id: string;
  provider: string;
  model: string;
  prompt: string;
  result: string | null;
  sources_json: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_cents: number | null;
  status: 'pending' | 'complete' | 'error';
  error: string | null;
  created_at: string;
  updated_at: string;
};

export default async function GenerationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, context] = await Promise.all([params, getAppContext()]);
  const generation = await tenantDbFirst<GenerationRow>(context.tenant.id,
    `SELECT id, conversation_id, user_message_id, provider, model, prompt, result, sources_json,
            input_tokens, output_tokens, estimated_cost_cents, status, error, created_at, updated_at
     FROM ai_generations
     WHERE tenant_id = ? AND id = ?`,
    context.tenant.id,
    id,
  );

  if (!generation) notFound();

  const sources = parseSources(generation.sources_json);

  return (
    <main className="min-h-screen bg-[#f6f7f2] px-4 py-8 text-[#172720] md:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/savia-mark.png" alt="Savia" width={44} height={44} className="h-11 w-11 object-contain" priority />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#718078]">Trazabilidad de IA</p>
              <h1 className="text-2xl font-extrabold tracking-[-.04em]">Detalle de respuesta</h1>
            </div>
          </div>
          <Link href="/" className="rounded-xl border border-[#d7e1db] bg-white px-4 py-2.5 text-sm font-bold text-[#284b3f] shadow-sm transition hover:bg-[#f5f8f5]">
            ← Volver a conversaciones
          </Link>
        </header>

        <section className="overflow-hidden rounded-[24px] border border-[#dbe4de] bg-white shadow-[0_18px_60px_rgba(20,50,40,.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8e3] bg-[#123d31] px-5 py-4 text-white md:px-7">
            <div>
              <p className="text-xs font-bold text-[#b9d2c9]">{context.tenant.name}</p>
              <p className="mt-1 font-mono text-xs text-[#e1eee9]">{generation.id}</p>
            </div>
            <StatusBadge status={generation.status} />
          </div>

          <div className="grid gap-5 p-5 md:p-7">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Proveedor" value={generation.provider} />
              <Fact label="Modelo" value={generation.model} />
              <Fact label="Tokens entrada" value={formatNumber(generation.input_tokens)} />
              <Fact label="Tokens salida" value={formatNumber(generation.output_tokens)} />
            </div>

            <TextPanel title="Mensaje del cliente" content={generation.prompt} />
            <TextPanel title="Respuesta generada" content={generation.result ?? 'La generación todavía no produjo una respuesta.'} accent />

            <div className="rounded-2xl border border-[#e0e7e2] p-4">
              <h2 className="text-xs font-extrabold uppercase tracking-[.1em] text-[#718078]">Fuentes RAG utilizadas</h2>
              {sources.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sources.map((source) => <span key={source} className="rounded-full bg-[#e9efea] px-3 py-1 text-xs font-bold text-[#52685d]">{source}</span>)}
                </div>
              ) : <p className="mt-2 text-sm text-[#718078]">No se recuperaron fuentes para esta respuesta.</p>}
            </div>

            {generation.error && (
              <div className="rounded-2xl border border-[#efc3b9] bg-[#fff4f1] p-4 text-sm text-[#8b3b2f]">
                <strong>Error registrado:</strong> {generation.error}
              </div>
            )}

            <dl className="grid gap-2 border-t border-[#e2e8e3] pt-4 text-xs text-[#718078] sm:grid-cols-2">
              <div><dt className="font-bold">Creada</dt><dd className="mt-1">{formatDate(generation.created_at, context.tenant.timezone)}</dd></div>
              <div><dt className="font-bold">Actualizada</dt><dd className="mt-1">{formatDate(generation.updated_at, context.tenant.timezone)}</dd></div>
            </dl>
          </div>
        </section>

        <p className="mt-4 text-center text-xs leading-5 text-[#718078]">
          El acceso a este registro se valida contra el cliente activo; una empresa no puede consultar generaciones de otra.
        </p>
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f4f6f2] p-4">
      <dt className="text-[10px] font-bold uppercase tracking-[.1em] text-[#718078]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-extrabold text-[#244137]">{value}</dd>
    </div>
  );
}

function TextPanel({ title, content, accent = false }: { title: string; content: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? 'border-[#cfe5c3] bg-[#f2faed]' : 'border-[#e0e7e2] bg-white'}`}>
      <h2 className="text-xs font-extrabold uppercase tracking-[.1em] text-[#718078]">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#29483d]">{content}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: GenerationRow['status'] }) {
  const labels = { pending: 'En proceso', complete: 'Completada', error: 'Con error' };
  const styles = status === 'complete'
    ? 'bg-[#d8f45f] text-[#123d31]'
    : status === 'error'
      ? 'bg-[#ffd7cf] text-[#7e3328]'
      : 'bg-[#fff0b8] text-[#6b5400]';
  return <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${styles}`}>{labels[status]}</span>;
}

function parseSources(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function formatNumber(value: number | null): string {
  return value === null ? 'No reportado' : new Intl.NumberFormat('es-CO').format(value);
}

function formatDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}
