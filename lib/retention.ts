import { dbAll } from '@/lib/database';
import { getTenantFiles, tenantDbAll, tenantDbBatch } from '@/lib/tenant-database';

type RetentionRow = {
  tenant_id: string;
  message_retention_days: number;
  document_retention_days: number;
  audit_retention_days: number;
};

export type RetentionResult = {
  tenantId: string;
  deletedMessages: number;
  deletedGenerations: number;
  deletedOutboxEvents: number;
  deletedDocuments: number;
  deletedAuditEntries: number;
  error: string | null;
};

export async function runAutomaticRetention(): Promise<RetentionResult[]> {
  const settings = await dbAll<RetentionRow>(
    `SELECT tenant_id, message_retention_days, document_retention_days, audit_retention_days
     FROM tenant_retention_settings WHERE automatic_cleanup = 1`,
  );
  return Promise.all(settings.map((setting) => runTenantRetention(setting).catch((error) => ({
    tenantId: setting.tenant_id,
    deletedMessages: 0,
    deletedGenerations: 0,
    deletedOutboxEvents: 0,
    deletedDocuments: 0,
    deletedAuditEntries: 0,
    error: error instanceof Error ? error.message.slice(0, 500) : 'Error de retención.',
  }))));
}

async function runTenantRetention(setting: RetentionRow): Promise<RetentionResult> {
  const now = new Date();
  const messageCutoff = cutoff(now, setting.message_retention_days);
  const documentCutoff = cutoff(now, setting.document_retention_days);
  const auditCutoff = cutoff(now, setting.audit_retention_days);
  const documents = await tenantDbAll<{ id: string; object_key: string | null }>(
    setting.tenant_id,
    `SELECT id, object_key FROM knowledge_sources
     WHERE tenant_id = ? AND created_at < ?`,
    setting.tenant_id,
    documentCutoff,
  );
  const files = documents.some((document) => document.object_key)
    ? await getTenantFiles(setting.tenant_id)
    : null;
  for (const document of documents) {
    if (document.object_key && files) await files.delete(document.object_key);
  }
  const result = await tenantDbBatch(setting.tenant_id, [
    {
      sql: `DELETE FROM ai_generations WHERE tenant_id = ? AND created_at < ?`,
      bindings: [setting.tenant_id, messageCutoff],
    },
    {
      sql: `DELETE FROM outbox_events WHERE tenant_id = ? AND created_at < ?`,
      bindings: [setting.tenant_id, messageCutoff],
    },
    {
      sql: `DELETE FROM messages WHERE tenant_id = ? AND created_at < ?`,
      bindings: [setting.tenant_id, messageCutoff],
    },
    {
      sql: `DELETE FROM knowledge_sources WHERE tenant_id = ? AND created_at < ?`,
      bindings: [setting.tenant_id, documentCutoff],
    },
    {
      sql: `DELETE FROM audit_logs WHERE tenant_id = ? AND created_at < ?
            AND action NOT LIKE 'privacy.%'`,
      bindings: [setting.tenant_id, auditCutoff],
    },
    {
      sql: `INSERT INTO audit_logs
              (id, tenant_id, action, entity_type, detail, created_at)
            VALUES (?, ?, 'retention.completed', 'tenant', ?, ?)`,
      bindings: [
        `audit_${crypto.randomUUID()}`,
        setting.tenant_id,
        `Retención ejecutada. Corte mensajes ${messageCutoff}; documentos ${documentCutoff}; auditoría ${auditCutoff}.`,
        now.toISOString(),
      ],
    },
  ]);
  return {
    tenantId: setting.tenant_id,
    deletedGenerations: Number(result[0]?.meta.changes ?? 0),
    deletedOutboxEvents: Number(result[1]?.meta.changes ?? 0),
    deletedMessages: Number(result[2]?.meta.changes ?? 0),
    deletedDocuments: Number(result[3]?.meta.changes ?? 0),
    deletedAuditEntries: Number(result[4]?.meta.changes ?? 0),
    error: null,
  };
}

function cutoff(now: Date, days: number): string {
  return new Date(now.getTime() - Math.max(1, days) * 86_400_000).toISOString();
}
