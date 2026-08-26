import { dbRun } from '@/lib/database';
import { getTenantBySlug } from '@/lib/context';
import { receiveInboundMessage } from '@/lib/conversation-service';
import { tenantDbRun } from '@/lib/tenant-database';
import { logOperationalEvent } from '@/lib/telemetry';

export type WhatsAppMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
};

export type WhatsAppPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: WhatsAppMessage[];
        statuses?: Array<{ id?: string; status?: string }>;
      };
    }>;
  }>;
};

export type WhatsAppQueueEvent = {
  type: 'whatsapp.webhook';
  eventId: string;
  tenantId: string;
  tenantSlug: string;
  phoneNumberId: string;
  payload: WhatsAppPayload;
};

export type WhatsAppOutboundEvent = {
  type: 'whatsapp.outbound';
  tenantId: string;
  tenantSlug: string;
  messageId: string;
  to: string;
  body: string;
};

export type SaviaQueueEvent = WhatsAppQueueEvent | WhatsAppOutboundEvent;

export async function processWhatsAppEvent(event: WhatsAppQueueEvent): Promise<void> {
  logOperationalEvent('info', 'whatsapp.event.processing', { eventId: event.eventId, tenantId: event.tenantId });
  await dbRun(
    `UPDATE integration_events SET status = 'processing', attempts = attempts + 1
     WHERE id = ? AND tenant_id = ?`,
    event.eventId,
    event.tenantId,
  );
  try {
    const tenant = await getTenantBySlug(event.tenantSlug);
    if (!tenant || tenant.id !== event.tenantId) throw new Error('El tenant del evento ya no está activo.');

    for (const entry of event.payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages' || !change.value) continue;
        const phoneNumberId = change.value.metadata?.phone_number_id;
        if (phoneNumberId !== event.phoneNumberId) throw new Error('El evento no corresponde al número configurado.');

        for (const status of change.value.statuses ?? []) {
          const mappedStatus = mapMessageStatus(status.status);
          if (status.id && mappedStatus) {
            await tenantDbRun(
              tenant.id,
              'UPDATE messages SET status = ? WHERE tenant_id = ? AND external_id = ?',
              mappedStatus,
              tenant.id,
              status.id,
            );
          }
        }

        for (const message of change.value.messages ?? []) {
          if (!message.id || !message.from) continue;
          const body = extractMessageBody(message);
          if (!body) continue;
          const contactName = change.value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name;
          await receiveInboundMessage({
            tenant,
            phone: message.from,
            contactName,
            body,
            externalId: message.id,
            channel: 'whatsapp',
          });
        }
      }
    }
    await dbRun(
      `UPDATE integration_events SET status = 'complete', processed_at = ?, last_error = NULL
       WHERE id = ?`,
      new Date().toISOString(),
      event.eventId,
    );
    logOperationalEvent('info', 'whatsapp.event.complete', { eventId: event.eventId, tenantId: event.tenantId });
  } catch (error) {
    await dbRun(
      `UPDATE integration_events SET status = 'failed', last_error = ? WHERE id = ?`,
      safeError(error),
      event.eventId,
    ).catch(() => undefined);
    logOperationalEvent('error', 'whatsapp.event.failed', {
      eventId: event.eventId,
      tenantId: event.tenantId,
      error: safeError(error),
    });
    throw error;
  }
}

export function extractWhatsAppProviderEventId(payload: WhatsAppPayload, tenantId: string): string {
  const ids: string[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) if (message.id) ids.push(`m:${message.id}`);
      for (const status of change.value?.statuses ?? []) if (status.id) ids.push(`s:${status.id}:${status.status ?? ''}`);
    }
  }
  return `${tenantId}:${ids.sort().join('|') || crypto.randomUUID()}`;
}

function extractMessageBody(message: WhatsAppMessage): string | null {
  if (message.type === 'text') return message.text?.body?.trim() || null;
  if (message.type === 'button') return message.button?.text?.trim() || null;
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title?.trim()
      || message.interactive?.list_reply?.title?.trim()
      || null;
  }
  if (['image', 'audio', 'video', 'document', 'sticker'].includes(message.type ?? '')) {
    return `[${message.type} recibido por WhatsApp]`;
  }
  return null;
}

function mapMessageStatus(status: string | undefined): 'sent' | 'delivered' | 'read' | 'failed' | null {
  if (status === 'sent' || status === 'delivered' || status === 'read' || status === 'failed') return status;
  return null;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : 'Error procesando el evento').slice(0, 500);
}
