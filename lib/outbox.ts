import { env } from 'cloudflare:workers';
import { dbAll } from '@/lib/database';
import { tenantDbAll, tenantDbRun } from '@/lib/tenant-database';
import type { WhatsAppOutboundEvent } from '@/lib/whatsapp-events';

type OutboxRow = {
  id: string;
  tenant_id: string;
  payload_json: string;
};

export function whatsappOutboxItem(event: WhatsAppOutboundEvent, createdAt: string): {
  id: string;
  sql: string;
  bindings: unknown[];
} {
  const id = `outbox_${event.messageId}`;
  return {
    id,
    sql: `INSERT INTO outbox_events
            (id, tenant_id, event_type, aggregate_id, payload_json, status, available_at, created_at)
          VALUES (?, ?, 'whatsapp.outbound', ?, ?, 'pending', ?, ?)`,
    bindings: [id, event.tenantId, event.messageId, JSON.stringify(event), createdAt, createdAt],
  };
}

export async function publishTenantOutboxEvent(tenantId: string, outboxId: string): Promise<boolean> {
  if (!env.SAVIA_EVENTS) return false;
  const row = await tenantDbAll<OutboxRow>(
    tenantId,
    `SELECT id, tenant_id, payload_json FROM outbox_events
     WHERE tenant_id = ? AND id = ? AND status = 'pending' AND available_at <= ?`,
    tenantId,
    outboxId,
    new Date().toISOString(),
  ).then((rows) => rows[0] ?? null);
  if (!row) return false;

  const event = parseOutboundEvent(row.payload_json, tenantId);
  await env.SAVIA_EVENTS.send(event, { contentType: 'json' });
  await tenantDbRun(
    tenantId,
    `UPDATE outbox_events SET status = 'published', published_at = ?, last_error = NULL
     WHERE tenant_id = ? AND id = ? AND status = 'pending'`,
    new Date().toISOString(),
    tenantId,
    outboxId,
  );
  return true;
}

export async function publishPendingOutboxEvents(limitPerTenant = 50): Promise<{
  published: number;
  failed: number;
}> {
  if (!env.SAVIA_EVENTS) return { published: 0, failed: 0 };
  const tenants = await dbAll<{ id: string }>("SELECT id FROM tenants WHERE status = 'active' ORDER BY id");
  let published = 0;
  let failed = 0;
  for (const tenant of tenants) {
    const rows = await tenantDbAll<OutboxRow>(
      tenant.id,
      `SELECT id, tenant_id, payload_json FROM outbox_events
       WHERE tenant_id = ? AND status = 'pending' AND available_at <= ?
       ORDER BY created_at LIMIT ?`,
      tenant.id,
      new Date().toISOString(),
      limitPerTenant,
    ).catch(() => []);
    for (const row of rows) {
      try {
        if (await publishTenantOutboxEvent(tenant.id, row.id)) published += 1;
      } catch (error) {
        failed += 1;
        await tenantDbRun(
          tenant.id,
          `UPDATE outbox_events SET attempts = attempts + 1, last_error = ?,
                  available_at = ? WHERE tenant_id = ? AND id = ? AND status = 'pending'`,
          safeError(error),
          new Date(Date.now() + 60_000).toISOString(),
          tenant.id,
          row.id,
        ).catch(() => undefined);
      }
    }
  }
  return { published, failed };
}

export async function finishLocalOutboxEvent(
  tenantId: string,
  outboxId: string,
  failed: boolean,
  error?: string,
): Promise<void> {
  await tenantDbRun(
    tenantId,
    `UPDATE outbox_events SET status = ?, attempts = attempts + 1, last_error = ?,
            published_at = ? WHERE tenant_id = ? AND id = ?`,
    failed ? 'failed' : 'published',
    error ?? null,
    new Date().toISOString(),
    tenantId,
    outboxId,
  );
}

function parseOutboundEvent(value: string, tenantId: string): WhatsAppOutboundEvent {
  const parsed = JSON.parse(value) as Partial<WhatsAppOutboundEvent>;
  if (
    parsed.type !== 'whatsapp.outbound'
    || parsed.tenantId !== tenantId
    || typeof parsed.tenantSlug !== 'string'
    || typeof parsed.messageId !== 'string'
    || typeof parsed.to !== 'string'
    || typeof parsed.body !== 'string'
  ) {
    throw new Error('El evento outbox no es válido para este tenant.');
  }
  return parsed as WhatsAppOutboundEvent;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : 'No fue posible publicar el outbox.').slice(0, 500);
}
