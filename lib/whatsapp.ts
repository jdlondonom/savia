import { env } from 'cloudflare:workers';
import { isDeployedEnvironment } from '@/lib/environment';
import { getWhatsAppChannelByTenantId } from '@/lib/whatsapp-config';
import { finishLocalOutboxEvent, publishTenantOutboxEvent } from '@/lib/outbox';
import { tenantDbRun } from '@/lib/tenant-database';

export type OutboundDelivery = {
  externalId: string | null;
  status: 'queued' | 'sent' | 'simulated' | 'failed';
  error?: string;
  retryable?: boolean;
};

export async function deliverPersistedWhatsAppText(input: {
  tenantId: string;
  tenantSlug: string;
  messageId: string;
  outboxId: string;
  to: string;
  body: string;
}): Promise<OutboundDelivery> {
  let delivery: OutboundDelivery;
  if (env.SAVIA_EVENTS) {
    try {
      await publishTenantOutboxEvent(input.tenantId, input.outboxId);
      delivery = { externalId: null, status: 'queued' };
    } catch (error) {
      delivery = {
        externalId: null,
        status: 'queued',
        retryable: true,
        error: error instanceof Error ? error.message.slice(0, 300) : 'El mensaje quedó pendiente de publicación.',
      };
    }
  } else {
    delivery = await deliverWhatsAppTextNow(input);
    await finishLocalOutboxEvent(
      input.tenantId,
      input.outboxId,
      delivery.status === 'failed',
      delivery.error,
    );
  }
  await tenantDbRun(
    input.tenantId,
    `UPDATE messages SET status = ?, external_id = ?, metadata_json = ?
     WHERE tenant_id = ? AND id = ?`,
    delivery.status,
    delivery.externalId,
    JSON.stringify({ deliveryError: delivery.error }),
    input.tenantId,
    input.messageId,
  );
  return delivery;
}

export async function deliverWhatsAppTextNow(input: {
  tenantId: string;
  tenantSlug: string;
  to: string;
  body: string;
}): Promise<OutboundDelivery> {
  const config = await getWhatsAppChannelByTenantId(input.tenantId);

  if (!config) {
    if (isDeployedEnvironment()) {
      return {
        externalId: null,
        status: 'failed',
        retryable: false,
        error: 'WhatsApp no está configurado o activo para este tenant.',
      };
    }
    return { externalId: null, status: 'simulated' };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizePhone(input.to),
          type: 'text',
          text: { preview_url: false, body: input.body },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      return {
        externalId: null,
        status: 'failed',
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        error: `Meta respondió ${response.status}: ${detail.slice(0, 180)}`,
      };
    }

    const payload = await response.json() as { messages?: Array<{ id?: string }> };
    return {
      externalId: payload.messages?.[0]?.id ?? null,
      status: 'sent',
    };
  } catch (error) {
    return {
      externalId: null,
      status: 'failed',
      retryable: true,
      error: error instanceof Error ? error.message : 'No fue posible conectar con Meta.',
    };
  }
}

export async function verifyMetaSignature(
  rawBody: ArrayBuffer,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret.trim() || !signatureHeader?.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, rawBody);
  const expected = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const received = signatureHeader.slice('sha256='.length).toLowerCase();
  return constantTimeEqual(expected, received);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}
