import { generateAssistantReply } from '@/lib/assistant';
import { estimateTenantGenerationCostCents, getTenantAiQuotaState } from '@/lib/ai-usage';
import { ensureDatabase } from '@/lib/database';
import { whatsappOutboxItem } from '@/lib/outbox';
import { tenantDbAll, tenantDbBatch, tenantDbFirst, tenantDbRun } from '@/lib/tenant-database';
import { deliverPersistedWhatsAppText } from '@/lib/whatsapp';
import type { Message, Tenant } from '@/lib/types';

type ConversationRow = {
  id: string;
  contact_id: string;
  mode: 'ai' | 'human';
  phone: string;
  name: string;
};

export async function receiveInboundMessage(input: {
  tenant: Tenant;
  phone: string;
  contactName?: string;
  body: string;
  externalId: string;
  channel: 'whatsapp' | 'demo';
}): Promise<{ conversationId: string; duplicate: boolean }> {
  await ensureDatabase();
  const existingMessage = await tenantDbFirst<{ id: string }>(input.tenant.id,
    'SELECT id FROM messages WHERE tenant_id = ? AND external_id = ?',
    input.tenant.id,
    input.externalId,
  );
  if (existingMessage) {
    const existingConversation = await tenantDbFirst<{ conversation_id: string }>(input.tenant.id,
      'SELECT conversation_id FROM messages WHERE tenant_id = ? AND id = ?',
      input.tenant.id,
      existingMessage.id,
    );
    return { conversationId: existingConversation?.conversation_id ?? '', duplicate: true };
  }

  const now = new Date().toISOString();
  const normalizedPhone = normalizePhone(input.phone);
  let contact = await tenantDbFirst<{ id: string; name: string; phone: string }>(input.tenant.id,
    'SELECT id, name, phone FROM contacts WHERE tenant_id = ? AND whatsapp_id = ?',
    input.tenant.id,
    normalizedPhone,
  );

  if (!contact) {
    const contactId = `contact_${crypto.randomUUID()}`;
    const name = input.contactName?.trim().slice(0, 120) || `Contacto ${normalizedPhone.slice(-4)}`;
    await tenantDbRun(input.tenant.id,
      `INSERT INTO contacts (id, tenant_id, whatsapp_id, name, phone, pipeline_stage, tags_json, notes, last_contact_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'new', '[]', '', ?, ?, ?)`,
      contactId,
      input.tenant.id,
      normalizedPhone,
      name,
      input.phone,
      now,
      now,
      now,
    );
    contact = { id: contactId, name, phone: input.phone };
  }

  let conversation = await tenantDbFirst<ConversationRow>(input.tenant.id,
    `SELECT cv.id, cv.contact_id, cv.mode, c.phone, c.name
     FROM conversations cv
     JOIN contacts c ON c.tenant_id = cv.tenant_id AND c.id = cv.contact_id
     WHERE cv.tenant_id = ? AND cv.contact_id = ? AND cv.status = 'open'
     ORDER BY cv.last_message_at DESC LIMIT 1`,
    input.tenant.id,
    contact.id,
  );

  if (!conversation) {
    const conversationId = `conv_${crypto.randomUUID()}`;
    await tenantDbRun(input.tenant.id,
      `INSERT INTO conversations (id, tenant_id, contact_id, channel, status, mode, last_message_at, unread_count, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', 'ai', ?, 0, '', ?, ?)`,
      conversationId,
      input.tenant.id,
      contact.id,
      input.channel,
      now,
      now,
      now,
    );
    conversation = { id: conversationId, contact_id: contact.id, mode: 'ai', phone: contact.phone, name: contact.name };
  }

  const inboundId = `msg_${crypto.randomUUID()}`;
  await tenantDbBatch(input.tenant.id, [
    {
      sql: `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id, rag_sources_json, created_at)
            VALUES (?, ?, ?, 'inbound', 'contact', ?, 'received', ?, '[]', ?)`,
      bindings: [inboundId, input.tenant.id, conversation.id, cleanMessage(input.body), input.externalId, now],
    },
    {
      sql: `UPDATE conversations SET channel = CASE WHEN channel = 'whatsapp' THEN channel ELSE ? END,
                   last_message_at = ?, unread_count = unread_count + 1, updated_at = ?
            WHERE tenant_id = ? AND id = ?`,
      bindings: [input.channel, now, now, input.tenant.id, conversation.id],
    },
    {
      sql: `UPDATE contacts SET last_contact_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      bindings: [now, now, input.tenant.id, contact.id],
    },
  ]);

  if (conversation.mode === 'ai') {
    const quota = await getTenantAiQuotaState(input.tenant.id);
    if (!quota.allowed) {
      const handoffText = 'En este momento continuaré tu solicitud con un asesor humano. Ya dejamos la conversación marcada para seguimiento.';
      const handoffMessageId = `msg_${crypto.randomUUID()}`;
      const handoffAt = new Date().toISOString();
      const handoffOutbox = input.channel === 'whatsapp'
        ? whatsappOutboxItem({
          type: 'whatsapp.outbound',
          tenantId: input.tenant.id,
          tenantSlug: input.tenant.slug,
          messageId: handoffMessageId,
          to: contact.phone,
          body: handoffText,
        }, handoffAt)
        : null;
      await tenantDbBatch(input.tenant.id, [
        {
          sql: `INSERT INTO messages
                  (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id,
                   rag_sources_json, metadata_json, created_at)
                VALUES (?, ?, ?, 'outbound', 'ai', ?, ?, ?, '[]', ?, ?)`,
          bindings: [
            handoffMessageId,
            input.tenant.id,
            conversation.id,
            handoffText,
            input.channel === 'whatsapp' ? 'queued' : 'simulated',
            null,
            JSON.stringify({ quotaReason: quota.reason }),
            handoffAt,
          ],
        },
        {
          sql: `UPDATE conversations SET mode = 'human', last_message_at = ?, updated_at = ?
                WHERE tenant_id = ? AND id = ?`,
          bindings: [handoffAt, handoffAt, input.tenant.id, conversation.id],
        },
        {
          sql: `INSERT INTO audit_logs (id, tenant_id, action, entity_type, entity_id, detail, created_at)
                VALUES (?, ?, 'assistant.quota_handoff', 'conversation', ?, ?, ?)`,
          bindings: [
            `audit_${crypto.randomUUID()}`,
            input.tenant.id,
            conversation.id,
            `Atención transferida por límite ${quota.reason}.`,
            handoffAt,
          ],
        },
        ...(handoffOutbox ? [{ sql: handoffOutbox.sql, bindings: handoffOutbox.bindings }] : []),
      ]);
      if (handoffOutbox) {
        await deliverPersistedWhatsAppText({
          tenantId: input.tenant.id,
          tenantSlug: input.tenant.slug,
          messageId: handoffMessageId,
          outboxId: handoffOutbox.id,
          to: contact.phone,
          body: handoffText,
        });
      }
      return { conversationId: conversation.id, duplicate: false };
    }

    const historyRows = await tenantDbAll<Record<string, unknown>>(input.tenant.id,
      `SELECT sender_type, body FROM (
         SELECT sender_type, body, created_at FROM messages
         WHERE tenant_id = ? AND conversation_id = ?
         ORDER BY created_at DESC LIMIT 8
       ) recent ORDER BY created_at`,
      input.tenant.id,
      conversation.id,
    );
    const history = historyRows.map((row) => ({
      senderType: row.sender_type as Message['senderType'],
      body: String(row.body),
    }));
    const generationId = `gen_${crypto.randomUUID()}`;
    const generationStartedAt = new Date().toISOString();
    await tenantDbRun(input.tenant.id,
      `INSERT INTO ai_generations (id, tenant_id, conversation_id, user_message_id, provider, model, prompt, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 'pending', ?, 'pending', ?, ?)`,
      generationId,
      input.tenant.id,
      conversation.id,
      inboundId,
      input.body,
      generationStartedAt,
      generationStartedAt,
    );
    let reply;
    try {
      reply = await generateAssistantReply({ tenant: input.tenant, body: input.body, history });
      const estimatedCostCents = await estimateTenantGenerationCostCents(
        input.tenant.id,
        reply.inputTokens,
        reply.outputTokens,
      );
      await tenantDbRun(input.tenant.id,
        `UPDATE ai_generations SET provider = ?, model = ?, result = ?, sources_json = ?,
                    input_tokens = ?, output_tokens = ?, estimated_cost_cents = ?, status = 'complete', updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
        reply.provider,
        reply.model,
        reply.text,
        JSON.stringify(reply.sources),
        reply.inputTokens,
        reply.outputTokens,
        estimatedCostCents,
        new Date().toISOString(),
        input.tenant.id,
        generationId,
      );
    } catch (error) {
      await tenantDbRun(input.tenant.id,
        `UPDATE ai_generations SET status = 'error', error = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
        error instanceof Error ? error.message.slice(0, 500) : 'Error desconocido',
        new Date().toISOString(),
        input.tenant.id,
        generationId,
      );
      throw error;
    }
    const outboundMessageId = `msg_${crypto.randomUUID()}`;
    const replyTime = new Date().toISOString();
    const replyOutbox = input.channel === 'whatsapp'
      ? whatsappOutboxItem({
        type: 'whatsapp.outbound',
        tenantId: input.tenant.id,
        tenantSlug: input.tenant.slug,
        messageId: outboundMessageId,
        to: contact.phone,
        body: reply.text,
      }, replyTime)
      : null;

    await tenantDbBatch(input.tenant.id, [
      {
        sql: `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id,
                    ai_provider, ai_model, input_tokens, output_tokens, generation_id, rag_sources_json, metadata_json, created_at)
              VALUES (?, ?, ?, 'outbound', 'ai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bindings: [
          outboundMessageId,
          input.tenant.id,
          conversation.id,
          reply.text,
          input.channel === 'whatsapp' ? 'queued' : 'simulated',
          null,
          reply.provider,
          reply.model,
          reply.inputTokens,
          reply.outputTokens,
          generationId,
          JSON.stringify(reply.sources),
          '{}',
          replyTime,
        ],
      },
      {
        sql: `UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`,
        bindings: [replyTime, replyTime, input.tenant.id, conversation.id],
      },
      {
        sql: `INSERT INTO audit_logs (id, tenant_id, action, entity_type, entity_id, detail, created_at)
              VALUES (?, ?, 'assistant.replied', 'conversation', ?, ?, ?)`,
        bindings: [
          `audit_${crypto.randomUUID()}`,
          input.tenant.id,
          conversation.id,
          `Respuesta de ${input.tenant.assistantName} con ${reply.sources.length} fuente(s) RAG.`,
          replyTime,
        ],
      },
      ...(replyOutbox ? [{ sql: replyOutbox.sql, bindings: replyOutbox.bindings }] : []),
    ]);
    if (replyOutbox) {
      await deliverPersistedWhatsAppText({
        tenantId: input.tenant.id,
        tenantSlug: input.tenant.slug,
        messageId: outboundMessageId,
        outboxId: replyOutbox.id,
        to: contact.phone,
        body: reply.text,
      });
    }
  }

  return { conversationId: conversation.id, duplicate: false };
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function cleanMessage(value: string): string {
  const cleaned = value.trim().replace(/\u0000/g, '');
  if (!cleaned) throw new Error('El mensaje está vacío.');
  return cleaned.slice(0, 4_000);
}
