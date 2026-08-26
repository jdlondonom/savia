import { env, waitUntil } from 'cloudflare:workers';
import { dbRun, ensureDatabase } from '@/lib/database';
import {
  extractWhatsAppProviderEventId,
  processWhatsAppEvent,
  type WhatsAppPayload,
  type WhatsAppQueueEvent,
} from '@/lib/whatsapp-events';
import { getWhatsAppChannelByWebhookKey } from '@/lib/whatsapp-config';
import { verifyMetaSignature } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ webhookKey: string }> };
const MAX_WEBHOOK_BYTES = 1_000_000;

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  await ensureDatabase();
  const { webhookKey } = await context.params;
  const config = await getWhatsAppChannelByWebhookKey(webhookKey);
  if (!config) return new Response('Webhook no configurado', { status: 404 });
  const url = new URL(request.url);
  const valid = url.searchParams.get('hub.mode') === 'subscribe'
    && constantTimeEqual(url.searchParams.get('hub.verify_token') ?? '', config.verifyToken)
    && Boolean(url.searchParams.get('hub.challenge'));
  return valid
    ? new Response(url.searchParams.get('hub.challenge'), { status: 200 })
    : new Response('Verificación rechazada', { status: 403 });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  await ensureDatabase();
  const { webhookKey } = await context.params;
  const config = await getWhatsAppChannelByWebhookKey(webhookKey);
  if (!config) return new Response('Webhook no configurado', { status: 404 });

  let rawBody: ArrayBuffer;
  try {
    rawBody = await readBodyWithLimit(request, MAX_WEBHOOK_BYTES);
  } catch (error) {
    return new Response(
      error instanceof PayloadTooLargeError ? 'Payload demasiado grande' : 'No fue posible leer el payload',
      { status: error instanceof PayloadTooLargeError ? 413 : 400 },
    );
  }
  if (!await verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), config.appSecret)) {
    return new Response('Firma inválida', { status: 401 });
  }

  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody)) as WhatsAppPayload;
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }
  if (payload.object !== 'whatsapp_business_account') return new Response('Evento ignorado', { status: 200 });

  const reportedPhoneIds = (payload.entry ?? []).flatMap((entry) =>
    (entry.changes ?? []).flatMap((change) => change.value?.metadata?.phone_number_id ?? []));
  if (reportedPhoneIds.some((phoneId) => phoneId !== config.phoneNumberId)) {
    return new Response('Número de WhatsApp no autorizado', { status: 403 });
  }

  const payloadHash = await sha256Hex(rawBody);
  const providerEventId = extractWhatsAppProviderEventId(payload, config.tenantId);
  const eventId = `ievt_${crypto.randomUUID()}`;
  const receivedAt = new Date().toISOString();
  const inserted = await dbRun(
    `INSERT OR IGNORE INTO integration_events
      (id, tenant_id, provider, provider_event_id, payload_hash, status, received_at)
     VALUES (?, ?, 'meta_whatsapp', ?, ?, 'received', ?)`,
    eventId,
    config.tenantId,
    providerEventId,
    payloadHash,
    receivedAt,
  );
  if (!inserted.meta.changes) return Response.json({ received: true, duplicate: true });

  const event: WhatsAppQueueEvent = {
    type: 'whatsapp.webhook',
    eventId,
    tenantId: config.tenantId,
    tenantSlug: config.tenantSlug,
    phoneNumberId: config.phoneNumberId,
    payload,
  };
  if (env.SAVIA_EVENTS) {
    try {
      await env.SAVIA_EVENTS.send(event, { contentType: 'json' });
      await dbRun(`UPDATE integration_events SET status = 'queued' WHERE id = ?`, eventId);
    } catch (error) {
      await dbRun(
        `UPDATE integration_events SET status = 'failed', last_error = ? WHERE id = ?`,
        error instanceof Error ? error.message.slice(0, 500) : 'No fue posible publicar en la cola.',
        eventId,
      );
      return new Response('No fue posible encolar el evento', { status: 503 });
    }
  } else {
    waitUntil(processWhatsAppEvent(event));
  }
  return Response.json({ received: true });
}

async function sha256Hex(value: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

class PayloadTooLargeError extends Error {}

async function readBodyWithLimit(request: Request, limit: number): Promise<ArrayBuffer> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new PayloadTooLargeError();
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}
