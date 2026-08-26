import { tenantDbAll, tenantDbFirst } from '@/lib/tenant-database';
import { getTenantAiStatus } from '@/lib/ai-config';
import { getRuntimeStatus } from '@/lib/runtime';
import type { AppContext } from '@/lib/context';
import type {
  Activity,
  Appointment,
  CalendarBlackout,
  CatalogItem,
  Contact,
  Conversation,
  DashboardData,
  KnowledgeSource,
  Message,
} from '@/lib/types';

type CountRow = { count: number };

export async function getDashboardData(context: AppContext): Promise<DashboardData> {
  const tenantId = context.tenant.id;
  const tenantAiStatus = await getTenantAiStatus(tenantId);
  const [conversationRows, messageRows, contactRows, catalogRows, knowledgeRows, appointmentRows, blackoutRows, activityRows, conversationsToday, aiOutbound, totalOutbound, confirmedAppointments, pendingFollowUps] = await Promise.all([
    tenantDbAll<Record<string, unknown>>(tenantId,
      `SELECT cv.id, cv.contact_id, cv.channel, cv.status, cv.mode, cv.assigned_user_id,
              cv.last_message_at, cv.unread_count, cv.summary,
              c.name AS contact_name, c.phone AS contact_phone, c.pipeline_stage AS contact_stage,
              COALESCE((SELECT m.body FROM messages m
                        WHERE m.tenant_id = cv.tenant_id AND m.conversation_id = cv.id
                        ORDER BY m.created_at DESC LIMIT 1), '') AS last_message
       FROM conversations cv
       JOIN contacts c ON c.tenant_id = cv.tenant_id AND c.id = cv.contact_id
       WHERE cv.tenant_id = ?
       ORDER BY cv.last_message_at DESC`,
      tenantId,
    ),
    tenantDbAll<Record<string, unknown>>(tenantId,
      `SELECT id, conversation_id, direction, sender_type, body, status, external_id,
              ai_provider, ai_model, generation_id, rag_sources_json, created_at
       FROM messages WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 500`,
      tenantId,
    ),
    tenantDbAll<Record<string, unknown>>(tenantId,
      `SELECT id, name, phone, email, pipeline_stage, tags_json, notes,
              last_contact_at, next_follow_up_at, created_at
       FROM contacts WHERE tenant_id = ? ORDER BY last_contact_at DESC`,
      tenantId,
    ),
    tenantDbAll<Record<string, unknown>>(tenantId,
      `SELECT id, name, kind, category, description, price_cents, currency,
              duration_minutes, bookable, active, keywords, created_at
       FROM catalog_items WHERE tenant_id = ? ORDER BY active DESC, name`,
      tenantId,
    ),
    tenantDbAll<Record<string, unknown>>(tenantId,
      `SELECT id, title, content, source_type, file_name, status, created_at, updated_at
       FROM knowledge_sources WHERE tenant_id = ? ORDER BY updated_at DESC`,
      tenantId,
    ),
    tenantDbAll<Record<string, unknown>>(tenantId,
      `SELECT a.id, a.contact_id, c.name AS contact_name, a.catalog_item_id,
              a.service_name, a.starts_at, a.ends_at, a.status, a.notes, a.created_at
       FROM appointments a
       JOIN contacts c ON c.tenant_id = a.tenant_id AND c.id = a.contact_id
       WHERE a.tenant_id = ? ORDER BY a.starts_at`,
      tenantId,
    ),
    tenantDbAll<Record<string, unknown>>(tenantId,
      `SELECT id, starts_at, ends_at, reason, created_at
       FROM calendar_blackouts WHERE tenant_id = ? ORDER BY starts_at`,
      tenantId,
    ),
    tenantDbAll<Record<string, unknown>>(tenantId,
      `SELECT id, action, entity_type, detail, created_at
       FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 12`,
      tenantId,
    ),
    tenantDbFirst<CountRow>(tenantId,
      `SELECT COUNT(*) AS count FROM conversations
       WHERE tenant_id = ? AND date(last_message_at) = date('now')`,
      tenantId,
    ),
    tenantDbFirst<CountRow>(tenantId,
      `SELECT COUNT(*) AS count FROM messages
       WHERE tenant_id = ? AND direction = 'outbound' AND sender_type = 'ai'`,
      tenantId,
    ),
    tenantDbFirst<CountRow>(tenantId,
      `SELECT COUNT(*) AS count FROM messages
       WHERE tenant_id = ? AND direction = 'outbound'`,
      tenantId,
    ),
    tenantDbFirst<CountRow>(tenantId,
      `SELECT COUNT(*) AS count FROM appointments
       WHERE tenant_id = ? AND status = 'confirmed' AND starts_at >= datetime('now', '-1 day')`,
      tenantId,
    ),
    tenantDbFirst<CountRow>(tenantId,
      `SELECT COUNT(*) AS count FROM contacts
       WHERE tenant_id = ? AND next_follow_up_at IS NOT NULL
         AND datetime(next_follow_up_at) <= datetime('now', '+3 days')`,
      tenantId,
    ),
  ]);

  const outbound = totalOutbound?.count ?? 0;

  return {
    user: context.user,
    tenant: context.tenant,
    tenants: context.tenants,
    conversations: conversationRows.map(mapConversation),
    messages: messageRows.map(mapMessage),
    contacts: contactRows.map(mapContact),
    catalog: catalogRows.map(mapCatalogItem),
    knowledge: knowledgeRows.map(mapKnowledge),
    appointments: appointmentRows.map(mapAppointment),
    blackouts: blackoutRows.map(mapBlackout),
    activities: activityRows.map(mapActivity),
    stats: {
      conversationsToday: conversationsToday?.count ?? 0,
      aiHandledPercent: outbound === 0 ? 0 : Math.round(((aiOutbound?.count ?? 0) / outbound) * 100),
      confirmedAppointments: confirmedAppointments?.count ?? 0,
      pendingFollowUps: pendingFollowUps?.count ?? 0,
    },
    runtime: await getRuntimeStatus(context.tenant.id, tenantAiStatus),
  };
}

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    contactId: String(row.contact_id),
    contactName: String(row.contact_name),
    contactPhone: String(row.contact_phone),
    contactStage: row.contact_stage as Conversation['contactStage'],
    channel: row.channel as Conversation['channel'],
    status: row.status as Conversation['status'],
    mode: row.mode as Conversation['mode'],
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    lastMessageAt: String(row.last_message_at),
    unreadCount: Number(row.unread_count),
    summary: String(row.summary),
    lastMessage: String(row.last_message),
  };
}

function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    direction: row.direction as Message['direction'],
    senderType: row.sender_type as Message['senderType'],
    body: String(row.body),
    status: row.status as Message['status'],
    externalId: row.external_id ? String(row.external_id) : null,
    aiProvider: row.ai_provider ? String(row.ai_provider) : null,
    aiModel: row.ai_model ? String(row.ai_model) : null,
    generationId: row.generation_id ? String(row.generation_id) : null,
    ragSources: parseStringArray(row.rag_sources_json),
    createdAt: String(row.created_at),
  };
}

function mapContact(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone),
    email: row.email ? String(row.email) : null,
    pipelineStage: row.pipeline_stage as Contact['pipelineStage'],
    tags: parseStringArray(row.tags_json),
    notes: String(row.notes ?? ''),
    lastContactAt: String(row.last_contact_at),
    nextFollowUpAt: row.next_follow_up_at ? String(row.next_follow_up_at) : null,
    createdAt: String(row.created_at),
  };
}

function mapCatalogItem(row: Record<string, unknown>): CatalogItem {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as CatalogItem['kind'],
    category: String(row.category),
    description: String(row.description),
    priceCents: Number(row.price_cents),
    currency: String(row.currency),
    durationMinutes: Number(row.duration_minutes),
    bookable: Boolean(row.bookable),
    active: Boolean(row.active),
    keywords: String(row.keywords),
    createdAt: String(row.created_at),
  };
}

function mapKnowledge(row: Record<string, unknown>): KnowledgeSource {
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    sourceType: row.source_type as KnowledgeSource['sourceType'],
    fileName: row.file_name ? String(row.file_name) : null,
    status: row.status as KnowledgeSource['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: String(row.id),
    contactId: String(row.contact_id),
    contactName: String(row.contact_name),
    catalogItemId: row.catalog_item_id ? String(row.catalog_item_id) : null,
    serviceName: String(row.service_name),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    status: row.status as Appointment['status'],
    notes: String(row.notes),
    createdAt: String(row.created_at),
  };
}

function mapBlackout(row: Record<string, unknown>): CalendarBlackout {
  return {
    id: String(row.id),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    reason: String(row.reason ?? ''),
    createdAt: String(row.created_at),
  };
}

function mapActivity(row: Record<string, unknown>): Activity {
  return {
    id: String(row.id),
    action: String(row.action),
    entityType: String(row.entity_type),
    detail: String(row.detail),
    createdAt: String(row.created_at),
  };
}

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
