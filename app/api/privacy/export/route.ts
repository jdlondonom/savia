import { getAppContext } from '@/lib/context';
import { tenantDbAll, tenantDbBatch } from '@/lib/tenant-database';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const context = await getAppContext();
  if (context.user.role === 'advisor') return new Response('Permisos insuficientes', { status: 403 });
  const contactId = new URL(request.url).searchParams.get('contactId');
  const requestId = `privacy_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const tables = contactId
    ? await exportContact(context.tenant.id, contactId)
    : await exportTenant(context.tenant.id);
  await tenantDbBatch(context.tenant.id, [
    {
      sql: `INSERT INTO privacy_requests
              (id, tenant_id, contact_id, request_type, status, requested_by, created_at, completed_at)
            VALUES (?, ?, ?, ?, 'complete', ?, ?, ?)`,
      bindings: [requestId, context.tenant.id, contactId, contactId ? 'contact_export' : 'tenant_export', context.user.id, now, now],
    },
    {
      sql: `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, detail, created_at)
            VALUES (?, ?, ?, 'privacy.exported', 'privacy_request', ?, ?, ?)`,
      bindings: [`audit_${crypto.randomUUID()}`, context.tenant.id, context.user.id, requestId, contactId ? 'Exportación de contacto.' : 'Exportación completa del tenant.', now],
    },
  ]);
  const body = JSON.stringify({
    schemaVersion: 1,
    exportedAt: now,
    tenant: { id: context.tenant.id, slug: context.tenant.slug, name: context.tenant.name },
    scope: contactId ? { type: 'contact', contactId } : { type: 'tenant' },
    data: tables,
  }, null, 2);
  const fileName = contactId ? `savia-${context.tenant.slug}-contacto.json` : `savia-${context.tenant.slug}-exportacion.json`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function exportTenant(tenantId: string): Promise<Record<string, unknown[]>> {
  const tableNames = [
    'contacts',
    'conversations',
    'messages',
    'ai_generations',
    'appointments',
    'appointment_slots',
    'calendar_blackouts',
    'catalog_items',
    'catalog_chunks',
    'knowledge_sources',
    'knowledge_chunks',
    'embedding_jobs',
    'privacy_requests',
    'outbox_events',
    'audit_logs',
  ] as const;
  const entries = await Promise.all(tableNames.map(async (table) => [
    table,
    await tenantDbAll<Record<string, unknown>>(tenantId, `SELECT * FROM ${table} WHERE tenant_id = ?`, tenantId),
  ] as const));
  return Object.fromEntries(entries);
}

async function exportContact(tenantId: string, contactId: string): Promise<Record<string, unknown[]>> {
  return {
    contacts: await tenantDbAll(tenantId, 'SELECT * FROM contacts WHERE tenant_id = ? AND id = ?', tenantId, contactId),
    conversations: await tenantDbAll(tenantId, 'SELECT * FROM conversations WHERE tenant_id = ? AND contact_id = ?', tenantId, contactId),
    messages: await tenantDbAll(tenantId, `SELECT m.* FROM messages m JOIN conversations c ON c.tenant_id = m.tenant_id AND c.id = m.conversation_id WHERE m.tenant_id = ? AND c.contact_id = ?`, tenantId, contactId),
    aiGenerations: await tenantDbAll(tenantId, `SELECT g.* FROM ai_generations g JOIN conversations c ON c.tenant_id = g.tenant_id AND c.id = g.conversation_id WHERE g.tenant_id = ? AND c.contact_id = ?`, tenantId, contactId),
    appointments: await tenantDbAll(tenantId, 'SELECT * FROM appointments WHERE tenant_id = ? AND contact_id = ?', tenantId, contactId),
  };
}
