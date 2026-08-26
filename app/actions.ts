'use server';

import { getAppContext, getContextForTenantSlug, setTenantCookie } from '@/lib/context';
import { receiveInboundMessage } from '@/lib/conversation-service';
import { dbBatch, dbFirst, dbRun } from '@/lib/database';
import { requiresDedicatedTenantData } from '@/lib/environment';
import { getDashboardData } from '@/lib/repository';
import { indexCatalogItem, indexKnowledgeSource } from '@/lib/rag';
import { whatsappOutboxItem } from '@/lib/outbox';
import { assertAppointmentWithinBusinessHours, buildAppointmentSlots } from '@/lib/scheduling';
import { getTenantFiles, tenantDbBatch, tenantDbFirst, tenantDbRun } from '@/lib/tenant-database';
import { deliverPersistedWhatsAppText } from '@/lib/whatsapp';
import { requirePlatformUser } from '@/lib/session';
import type { Appointment, CatalogItem, Contact, DashboardData } from '@/lib/types';

export async function refreshDashboardAction(): Promise<DashboardData> {
  return getDashboardData(await getAppContext());
}

export async function switchTenantAction(slug: string): Promise<DashboardData> {
  const safeSlug = requiredText(slug, 'Cliente', 80);
  const context = await getContextForTenantSlug(safeSlug);
  await setTenantCookie(safeSlug);
  return getDashboardData(context);
}

export async function createTenantAction(input: {
  name: string;
  industry: string;
  slug?: string;
}): Promise<DashboardData> {
  await requirePlatformUser({ mutation: true });
  const context = await getAppContext();
  const name = requiredText(input.name, 'Nombre del negocio', 160);
  const industry = requiredText(input.industry, 'Sector', 160);
  const baseSlug = optionalText(input.slug, 80) || name;
  const slug = baseSlug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  if (slug.length < 3) throw new Error('El identificador del cliente debe tener al menos 3 caracteres.');
  const exists = await dbFirst<{ id: string }>('SELECT id FROM tenants WHERE slug = ?', slug);
  if (exists) throw new Error('Ya existe un cliente con ese identificador.');

  const tenantId = `tenant_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const dedicated = requiresDedicatedTenantData();
  const hours = JSON.stringify({
    lunes: { open: '08:00', close: '18:00', enabled: true },
    martes: { open: '08:00', close: '18:00', enabled: true },
    miercoles: { open: '08:00', close: '18:00', enabled: true },
    jueves: { open: '08:00', close: '18:00', enabled: true },
    viernes: { open: '08:00', close: '18:00', enabled: true },
    sabado: { open: '09:00', close: '13:00', enabled: true },
    domingo: { open: '09:00', close: '13:00', enabled: false },
  });
  await dbBatch([
    {
      sql: `INSERT INTO tenants (id, slug, name, industry, timezone, assistant_name, assistant_tone, assistant_prompt, business_hours_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'America/Bogota', 'Savia', 'cálido, claro y profesional', '', ?, ?, ?)`,
      bindings: [tenantId, slug, name, industry, hours, now, now],
    },
    {
      sql: `INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at)
            VALUES (?, ?, 'owner', ?)`,
      bindings: [tenantId, context.user.id, now],
    },
    {
      sql: `INSERT INTO tenant_resources
              (tenant_id, isolation_mode, provisioning_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)`,
      bindings: [
        tenantId,
        dedicated ? 'dedicated' : 'shared_local',
        dedicated ? 'pending' : 'local',
        now,
        now,
      ],
    },
    {
      sql: `INSERT INTO tenant_channel_settings (tenant_id, webhook_key, created_at, updated_at)
            VALUES (?, ?, ?, ?)`,
      bindings: [tenantId, crypto.randomUUID().replaceAll('-', ''), now, now],
    },
    {
      sql: `INSERT INTO tenant_retention_settings (tenant_id, updated_by, updated_at)
            VALUES (?, ?, ?)`,
      bindings: [tenantId, context.user.id, now],
    },
    {
      sql: `INSERT INTO platform_audit_logs (id, user_id, action, entity_type, entity_id, detail, created_at)
            VALUES (?, ?, 'tenant.created', 'tenant', ?, ?, ?)`,
      bindings: [`paudit_${crypto.randomUUID()}`, context.user.id, tenantId, `Cliente ${name} creado.`, now],
    },
  ]);
  await setTenantCookie(slug);
  return getDashboardData(await getContextForTenantSlug(slug));
}

export async function sendAdvisorMessageAction(conversationId: string, body: string): Promise<DashboardData> {
  const context = await getAppContext();
  const message = requiredText(body, 'Mensaje', 4_000);
  const conversation = await tenantDbFirst<{ id: string; phone: string; channel: 'whatsapp' | 'demo' }>(context.tenant.id,
    `SELECT cv.id, c.phone, cv.channel
     FROM conversations cv
     JOIN contacts c ON c.tenant_id = cv.tenant_id AND c.id = cv.contact_id
     WHERE cv.tenant_id = ? AND cv.id = ?`,
    context.tenant.id,
    conversationId,
  );
  if (!conversation) throw new Error('La conversación no existe en este cliente.');

  const outboundMessageId = `msg_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const outbox = conversation.channel === 'whatsapp'
    ? whatsappOutboxItem({
      type: 'whatsapp.outbound',
      tenantId: context.tenant.id,
      tenantSlug: context.tenant.slug,
      messageId: outboundMessageId,
      to: conversation.phone,
      body: message,
    }, now)
    : null;
  await tenantDbBatch(context.tenant.id, [
    {
      sql: `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id, rag_sources_json, metadata_json, created_at)
            VALUES (?, ?, ?, 'outbound', 'human', ?, ?, ?, '[]', ?, ?)`,
      bindings: [
        outboundMessageId,
        context.tenant.id,
        conversation.id,
        message,
        conversation.channel === 'whatsapp' ? 'queued' : 'simulated',
        null,
        '{}',
        now,
      ],
    },
    {
      sql: `UPDATE conversations SET mode = 'human', assigned_user_id = ?, unread_count = 0,
                   last_message_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      bindings: [context.user.id, now, now, context.tenant.id, conversation.id],
    },
    auditItem(context.tenant.id, context.user.id, 'message.sent', 'conversation', conversation.id, 'Respuesta manual enviada.', now),
    ...(outbox ? [{ sql: outbox.sql, bindings: outbox.bindings }] : []),
  ]);
  if (outbox) {
    await deliverPersistedWhatsAppText({
      tenantId: context.tenant.id,
      tenantSlug: context.tenant.slug,
      messageId: outboundMessageId,
      outboxId: outbox.id,
      to: conversation.phone,
      body: message,
    });
  }

  return getDashboardData(context);
}

export async function simulateInboundAction(conversationId: string, body: string): Promise<DashboardData> {
  const context = await getAppContext();
  const message = requiredText(body, 'Mensaje', 4_000);
  const conversation = await tenantDbFirst<{ phone: string; name: string }>(context.tenant.id,
    `SELECT c.phone, c.name FROM conversations cv
     JOIN contacts c ON c.tenant_id = cv.tenant_id AND c.id = cv.contact_id
     WHERE cv.tenant_id = ? AND cv.id = ?`,
    context.tenant.id,
    conversationId,
  );
  if (!conversation) throw new Error('La conversación no existe en este cliente.');

  await receiveInboundMessage({
    tenant: context.tenant,
    phone: conversation.phone,
    contactName: conversation.name,
    body: message,
    externalId: `demo_${crypto.randomUUID()}`,
    channel: 'demo',
  });

  return getDashboardData(context);
}

export async function setConversationModeAction(
  conversationId: string,
  mode: 'ai' | 'human',
): Promise<DashboardData> {
  const context = await getAppContext();
  if (!['ai', 'human'].includes(mode)) throw new Error('Modo de conversación inválido.');
  const now = new Date().toISOString();
  const result = await tenantDbRun(context.tenant.id,
    `UPDATE conversations SET mode = ?, assigned_user_id = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ?`,
    mode,
    mode === 'human' ? context.user.id : null,
    now,
    context.tenant.id,
    conversationId,
  );
  if (!result.meta.changes) throw new Error('La conversación no existe en este cliente.');
  await tenantDbRun(context.tenant.id,
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, detail, created_at)
     VALUES (?, ?, ?, 'conversation.mode_changed', 'conversation', ?, ?, ?)`,
    `audit_${crypto.randomUUID()}`,
    context.tenant.id,
    context.user.id,
    conversationId,
    mode === 'human' ? 'Chat tomado por un asesor.' : 'Chat devuelto a la IA.',
    now,
  );
  return getDashboardData(context);
}

export async function markConversationReadAction(conversationId: string): Promise<DashboardData> {
  const context = await getAppContext();
  await tenantDbRun(context.tenant.id,
    'UPDATE conversations SET unread_count = 0, updated_at = ? WHERE tenant_id = ? AND id = ?',
    new Date().toISOString(),
    context.tenant.id,
    conversationId,
  );
  return getDashboardData(context);
}

export async function createContactAction(input: {
  name: string;
  phone: string;
  email?: string;
}): Promise<DashboardData> {
  const context = await getAppContext();
  const name = requiredText(input.name, 'Nombre', 120);
  const phone = requiredText(input.phone, 'Teléfono', 40);
  const normalizedPhone = phone.replace(/\D/g, '');
  if (normalizedPhone.length < 7) throw new Error('El teléfono no parece válido.');
  const email = optionalText(input.email, 180);
  const existing = await tenantDbFirst<{ id: string }>(context.tenant.id,
    'SELECT id FROM contacts WHERE tenant_id = ? AND whatsapp_id = ?',
    context.tenant.id,
    normalizedPhone,
  );
  if (existing) throw new Error('Ya existe un contacto con ese teléfono en este cliente.');

  const contactId = `contact_${crypto.randomUUID()}`;
  const conversationId = `conv_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await tenantDbBatch(context.tenant.id, [
    {
      sql: `INSERT INTO contacts (id, tenant_id, whatsapp_id, name, phone, email, pipeline_stage, tags_json, notes, last_contact_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'new', '[]', '', ?, ?, ?)`,
      bindings: [contactId, context.tenant.id, normalizedPhone, name, phone, email, now, now, now],
    },
    {
      sql: `INSERT INTO conversations (id, tenant_id, contact_id, channel, status, mode, last_message_at, unread_count, summary, created_at, updated_at)
            VALUES (?, ?, ?, 'demo', 'open', 'ai', ?, 0, 'Conversación nueva.', ?, ?)`,
      bindings: [conversationId, context.tenant.id, contactId, now, now, now],
    },
    auditItem(context.tenant.id, context.user.id, 'contact.created', 'contact', contactId, `Contacto ${name} creado.`, now),
  ]);
  return getDashboardData(context);
}

export async function updateContactAction(input: {
  contactId: string;
  pipelineStage: Contact['pipelineStage'];
  notes: string;
  nextFollowUpAt: string | null;
}): Promise<DashboardData> {
  const context = await getAppContext();
  const stages: Contact['pipelineStage'][] = ['new', 'qualified', 'proposal', 'won', 'lost'];
  if (!stages.includes(input.pipelineStage)) throw new Error('Etapa comercial inválida.');
  const notes = optionalText(input.notes, 2_000) ?? '';
  const followUp = input.nextFollowUpAt ? validIsoDate(input.nextFollowUpAt, 'Seguimiento') : null;
  const now = new Date().toISOString();
  const result = await tenantDbRun(context.tenant.id,
    `UPDATE contacts SET pipeline_stage = ?, notes = ?, next_follow_up_at = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ?`,
    input.pipelineStage,
    notes,
    followUp,
    now,
    context.tenant.id,
    input.contactId,
  );
  if (!result.meta.changes) throw new Error('El contacto no existe en este cliente.');
  await tenantDbRun(context.tenant.id,
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, detail, created_at)
     VALUES (?, ?, ?, 'contact.updated', 'contact', ?, ?, ?)`,
    `audit_${crypto.randomUUID()}`,
    context.tenant.id,
    context.user.id,
    input.contactId,
    `Etapa actualizada a ${input.pipelineStage}.`,
    now,
  );
  return getDashboardData(context);
}

export async function createAppointmentAction(input: {
  contactId: string;
  catalogItemId?: string;
  serviceName?: string;
  startsAt: string;
  notes?: string;
}): Promise<DashboardData> {
  const context = await getAppContext();
  const contact = await tenantDbFirst<{ id: string }>(context.tenant.id,
    'SELECT id FROM contacts WHERE tenant_id = ? AND id = ?',
    context.tenant.id,
    input.contactId,
  );
  if (!contact) throw new Error('El contacto no existe en este cliente.');

  let catalogItem: Pick<CatalogItem, 'id' | 'name' | 'durationMinutes'> | null = null;
  if (input.catalogItemId) {
    const row = await tenantDbFirst<{ id: string; name: string; duration_minutes: number }>(context.tenant.id,
      `SELECT id, name, duration_minutes FROM catalog_items
       WHERE tenant_id = ? AND id = ? AND active = 1 AND bookable = 1`,
      context.tenant.id,
      input.catalogItemId,
    );
    if (!row) throw new Error('El servicio no existe o no es agendable para este cliente.');
    catalogItem = { id: row.id, name: row.name, durationMinutes: Number(row.duration_minutes) };
  }

  const startsAt = validIsoDate(input.startsAt, 'Fecha de inicio');
  const duration = Math.ceil(Math.max(15, catalogItem?.durationMinutes || 60) / 15) * 15;
  const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
  assertAppointmentWithinBusinessHours(startsAt, endsAt, context.tenant.timezone, context.tenant.businessHours);
  const blackout = await tenantDbFirst<{ id: string }>(context.tenant.id,
    `SELECT id FROM calendar_blackouts
     WHERE tenant_id = ? AND starts_at < ? AND ends_at > ? LIMIT 1`,
    context.tenant.id,
    endsAt,
    startsAt,
  );
  if (blackout) throw new Error('La franja seleccionada está bloqueada en el calendario.');
  const serviceName = catalogItem?.name ?? requiredText(input.serviceName, 'Servicio', 160);
  const notes = optionalText(input.notes, 1_000) ?? '';
  const now = new Date().toISOString();
  const appointmentId = `appt_${crypto.randomUUID()}`;

  try {
    await tenantDbBatch(context.tenant.id, [
    {
      sql: `INSERT INTO appointments (id, tenant_id, contact_id, catalog_item_id, service_name, starts_at, ends_at, status, notes, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      bindings: [appointmentId, context.tenant.id, contact.id, catalogItem?.id ?? null, serviceName, startsAt, endsAt, notes, context.user.id, now, now],
    },
      ...buildAppointmentSlots(startsAt, endsAt).map((slotStart) => ({
        sql: `INSERT INTO appointment_slots (tenant_id, slot_start, appointment_id, created_at)
              VALUES (?, ?, ?, ?)`,
        bindings: [context.tenant.id, slotStart, appointmentId, now],
      })),
      auditItem(context.tenant.id, context.user.id, 'appointment.created', 'appointment', appointmentId, `Reserva creada para ${serviceName}.`, now),
    ]);
  } catch (error) {
    if (error instanceof Error && /unique|constraint|appointment_slots/i.test(error.message)) {
      throw new Error('La franja ya fue reservada. Selecciona otro horario.');
    }
    throw error;
  }
  return getDashboardData(context);
}

export async function setAppointmentStatusAction(
  appointmentId: string,
  status: Appointment['status'],
): Promise<DashboardData> {
  const context = await getAppContext();
  const statuses: Appointment['status'][] = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
  if (!statuses.includes(status)) throw new Error('Estado de reserva inválido.');
  const now = new Date().toISOString();
  const appointment = await tenantDbFirst<{ status: Appointment['status']; starts_at: string; ends_at: string }>(context.tenant.id,
    'SELECT status, starts_at, ends_at FROM appointments WHERE tenant_id = ? AND id = ?',
    context.tenant.id,
    appointmentId,
  );
  if (!appointment) throw new Error('La reserva no existe en este cliente.');
  const writes: Array<{ sql: string; bindings: unknown[] }> = [
    {
      sql: 'UPDATE appointments SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?',
      bindings: [status, now, context.tenant.id, appointmentId],
    },
  ];
  if (status === 'cancelled') {
    writes.push({
      sql: 'DELETE FROM appointment_slots WHERE tenant_id = ? AND appointment_id = ?',
      bindings: [context.tenant.id, appointmentId],
    });
  } else if (appointment.status === 'cancelled') {
    writes.push(...buildAppointmentSlots(appointment.starts_at, appointment.ends_at).map((slotStart) => ({
      sql: `INSERT INTO appointment_slots (tenant_id, slot_start, appointment_id, created_at)
            VALUES (?, ?, ?, ?)`,
      bindings: [context.tenant.id, slotStart, appointmentId, now],
    })));
  }
  writes.push(auditItem(context.tenant.id, context.user.id, 'appointment.status_changed', 'appointment', appointmentId, `Reserva actualizada a ${status}.`, now));
  try {
    await tenantDbBatch(context.tenant.id, writes);
  } catch (error) {
    if (error instanceof Error && /unique|constraint|appointment_slots/i.test(error.message)) {
      throw new Error('La franja ya está ocupada y la reserva no puede reactivarse.');
    }
    throw error;
  }
  return getDashboardData(context);
}

export async function createCalendarBlackoutAction(input: {
  startsAt: string;
  endsAt: string;
  reason?: string;
}): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const startsAt = validIsoDate(input.startsAt, 'Inicio del bloqueo');
  const endsAt = validIsoDate(input.endsAt, 'Fin del bloqueo');
  if (new Date(endsAt) <= new Date(startsAt)) throw new Error('El fin del bloqueo debe ser posterior al inicio.');
  const id = `blackout_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await tenantDbBatch(context.tenant.id, [
    {
      sql: `INSERT INTO calendar_blackouts
              (id, tenant_id, starts_at, ends_at, reason, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      bindings: [id, context.tenant.id, startsAt, endsAt, optionalText(input.reason, 300) ?? '', context.user.id, now],
    },
    auditItem(context.tenant.id, context.user.id, 'calendar.blackout_created', 'calendar_blackout', id, 'Franja de agenda bloqueada.', now),
  ]);
  return getDashboardData(context);
}

export async function deleteCalendarBlackoutAction(blackoutId: string): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const result = await tenantDbRun(
    context.tenant.id,
    'DELETE FROM calendar_blackouts WHERE tenant_id = ? AND id = ?',
    context.tenant.id,
    blackoutId,
  );
  if (!result.meta.changes) throw new Error('El bloqueo ya no existe.');
  return getDashboardData(context);
}

export async function anonymizeContactAction(contactId: string): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const contact = await tenantDbFirst<{ id: string }>(
    context.tenant.id,
    'SELECT id FROM contacts WHERE tenant_id = ? AND id = ?',
    context.tenant.id,
    contactId,
  );
  if (!contact) throw new Error('El contacto no existe en este cliente.');
  const requestId = `privacy_${crypto.randomUUID()}`;
  const anonymous = `deleted_${crypto.randomUUID().replaceAll('-', '')}`;
  const now = new Date().toISOString();
  await tenantDbBatch(context.tenant.id, [
    {
      sql: `INSERT INTO privacy_requests
              (id, tenant_id, contact_id, request_type, status, requested_by, created_at, completed_at)
            VALUES (?, ?, ?, 'contact_delete', 'complete', ?, ?, ?)`,
      bindings: [requestId, context.tenant.id, contactId, context.user.id, now, now],
    },
    {
      sql: `UPDATE messages SET body = '[contenido eliminado por solicitud de privacidad]',
              external_id = NULL, metadata_json = '{}'
            WHERE tenant_id = ? AND conversation_id IN
              (SELECT id FROM conversations WHERE tenant_id = ? AND contact_id = ?)`,
      bindings: [context.tenant.id, context.tenant.id, contactId],
    },
    {
      sql: `UPDATE conversations SET summary = '', assigned_user_id = NULL, updated_at = ?
            WHERE tenant_id = ? AND contact_id = ?`,
      bindings: [now, context.tenant.id, contactId],
    },
    {
      sql: `UPDATE appointments SET notes = '', updated_at = ?
            WHERE tenant_id = ? AND contact_id = ?`,
      bindings: [now, context.tenant.id, contactId],
    },
    {
      sql: `UPDATE ai_generations
            SET prompt = '[contenido eliminado por solicitud de privacidad]',
                result = CASE WHEN result IS NULL THEN NULL ELSE '[contenido eliminado por solicitud de privacidad]' END,
                error = NULL, updated_at = ?
            WHERE tenant_id = ? AND conversation_id IN
              (SELECT id FROM conversations WHERE tenant_id = ? AND contact_id = ?)`,
      bindings: [now, context.tenant.id, context.tenant.id, contactId],
    },
    {
      sql: `DELETE FROM outbox_events
            WHERE tenant_id = ? AND aggregate_id IN
              (SELECT m.id FROM messages m
               JOIN conversations c ON c.tenant_id = m.tenant_id AND c.id = m.conversation_id
               WHERE m.tenant_id = ? AND c.contact_id = ?)`,
      bindings: [context.tenant.id, context.tenant.id, contactId],
    },
    {
      sql: `UPDATE audit_logs SET detail = '[detalle anonimizado por solicitud de privacidad]'
            WHERE tenant_id = ? AND (
              (entity_type = 'contact' AND entity_id = ?)
              OR (entity_type = 'conversation' AND entity_id IN
                (SELECT id FROM conversations WHERE tenant_id = ? AND contact_id = ?))
            )`,
      bindings: [context.tenant.id, contactId, context.tenant.id, contactId],
    },
    {
      sql: `UPDATE contacts SET whatsapp_id = NULL, name = 'Contacto eliminado', phone = ?,
              email = NULL, tags_json = '[]', notes = '', next_follow_up_at = NULL,
              updated_at = ? WHERE tenant_id = ? AND id = ?`,
      bindings: [anonymous, now, context.tenant.id, contactId],
    },
    auditItem(context.tenant.id, context.user.id, 'privacy.contact_anonymized', 'contact', contactId, 'Datos personales anonimizados por solicitud.', now),
  ]);
  return getDashboardData(context);
}

export async function createCatalogItemAction(input: {
  name: string;
  kind: CatalogItem['kind'];
  category: string;
  description: string;
  price: number;
  durationMinutes: number;
  bookable: boolean;
  keywords: string;
}): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const name = requiredText(input.name, 'Nombre', 160);
  const description = requiredText(input.description, 'Descripción', 2_500);
  if (!['product', 'service'].includes(input.kind)) throw new Error('Tipo de elemento inválido.');
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) throw new Error('El precio no es válido.');
  const duration = Number.isFinite(input.durationMinutes) ? Math.max(0, Math.min(1_440, Math.round(input.durationMinutes))) : 0;
  const now = new Date().toISOString();
  const itemId = `item_${crypto.randomUUID()}`;
  await tenantDbBatch(context.tenant.id, [
    {
      sql: `INSERT INTO catalog_items (id, tenant_id, name, kind, category, description, price_cents, currency, duration_minutes, bookable, active, keywords, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'COP', ?, ?, 1, ?, ?, ?)`,
      bindings: [
        itemId,
        context.tenant.id,
        name,
        input.kind,
        optionalText(input.category, 120) ?? '',
        description,
        Math.round(price * 100),
        duration,
        input.bookable ? 1 : 0,
        optionalText(input.keywords, 500) ?? '',
        now,
        now,
      ],
    },
    auditItem(context.tenant.id, context.user.id, 'catalog.created', 'catalog_item', itemId, `${name} agregado al conocimiento.`, now),
  ]);
  await indexCatalogItem(context.tenant.id, itemId, 'catalog_created');
  return getDashboardData(context);
}

export async function deleteCatalogItemAction(itemId: string): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const now = new Date().toISOString();
  const result = await tenantDbRun(context.tenant.id,
    'UPDATE catalog_items SET active = 0, updated_at = ? WHERE tenant_id = ? AND id = ?',
    now,
    context.tenant.id,
    itemId,
  );
  if (!result.meta.changes) throw new Error('El elemento no existe en este cliente.');
  return getDashboardData(context);
}

export async function createKnowledgeAction(input: {
  title: string;
  content: string;
}): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const title = requiredText(input.title, 'Título', 180);
  const content = requiredText(input.content, 'Contenido', 20_000);
  const sourceId = `knowledge_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await tenantDbBatch(context.tenant.id, [
    {
      sql: `INSERT INTO knowledge_sources (id, tenant_id, title, content, source_type, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'manual', 'ready', ?, ?)`,
      bindings: [sourceId, context.tenant.id, title, content, now, now],
    },
    auditItem(context.tenant.id, context.user.id, 'knowledge.created', 'knowledge_source', sourceId, `${title} agregado a la base RAG.`, now),
  ]);
  await indexKnowledgeSource(context.tenant.id, sourceId, 'source_created');
  return getDashboardData(context);
}

export async function uploadKnowledgeAction(formData: FormData): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('Selecciona un archivo.');
  if (file.size === 0 || file.size > 1_000_000) throw new Error('El archivo debe pesar entre 1 byte y 1 MB.');
  const extension = file.name.toLowerCase().split('.').pop();
  if (!extension || !['txt', 'md', 'csv', 'json'].includes(extension)) {
    throw new Error('Por ahora Savia acepta archivos TXT, MD, CSV o JSON.');
  }
  const content = (await file.text()).replace(/\u0000/g, '').trim();
  if (!content) throw new Error('El archivo no contiene texto utilizable.');
  const sourceId = `knowledge_${crypto.randomUUID()}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const objectKey = `${context.tenant.id}/knowledge/${sourceId}/${safeName}`;
  const files = await getTenantFiles(context.tenant.id);
  await files.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type || 'text/plain' },
    customMetadata: { tenantId: context.tenant.id, sourceId },
  });
  const now = new Date().toISOString();
  try {
    await tenantDbBatch(context.tenant.id, [
      {
        sql: `INSERT INTO knowledge_sources (id, tenant_id, title, content, source_type, file_name, object_key, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'file', ?, ?, 'ready', ?, ?)`,
        bindings: [sourceId, context.tenant.id, file.name.slice(0, 180), content.slice(0, 100_000), file.name, objectKey, now, now],
      },
      auditItem(context.tenant.id, context.user.id, 'knowledge.uploaded', 'knowledge_source', sourceId, `${file.name} cargado a la base RAG.`, now),
    ]);
  } catch (error) {
    await files.delete(objectKey).catch(() => undefined);
    throw error;
  }
  await indexKnowledgeSource(context.tenant.id, sourceId, 'file_uploaded');
  return getDashboardData(context);
}

export async function deleteKnowledgeAction(sourceId: string): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const source = await tenantDbFirst<{ object_key: string | null }>(context.tenant.id,
    'SELECT object_key FROM knowledge_sources WHERE tenant_id = ? AND id = ?',
    context.tenant.id,
    sourceId,
  );
  if (!source) throw new Error('La fuente no existe en este cliente.');
  if (source.object_key) await (await getTenantFiles(context.tenant.id)).delete(source.object_key);
  await tenantDbRun(context.tenant.id, 'DELETE FROM knowledge_sources WHERE tenant_id = ? AND id = ?', context.tenant.id, sourceId);
  return getDashboardData(context);
}

export async function updateTenantSettingsAction(input: {
  name: string;
  industry: string;
  assistantName: string;
  assistantTone: string;
  assistantPrompt: string;
}): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE tenants SET name = ?, industry = ?, assistant_name = ?, assistant_tone = ?, assistant_prompt = ?, updated_at = ?
     WHERE id = ?`,
    requiredText(input.name, 'Nombre del negocio', 160),
    requiredText(input.industry, 'Sector', 160),
    requiredText(input.assistantName, 'Nombre del asistente', 80),
    requiredText(input.assistantTone, 'Tono', 240),
    optionalText(input.assistantPrompt, 4_000) ?? '',
    now,
    context.tenant.id,
  );
  const updatedContext = await getContextForTenantSlug(context.tenant.slug);
  return getDashboardData(updatedContext);
}

export async function updateBusinessHoursAction(
  businessHours: Record<string, { open: string; close: string; enabled: boolean }>,
): Promise<DashboardData> {
  const context = await getAppContext();
  requireAdmin(context.user.role);
  const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const normalized: Record<string, { open: string; close: string; enabled: boolean }> = {};
  for (const day of days) {
    const value = businessHours[day];
    if (!value || !isValidClock(value.open) || !isValidClock(value.close)) {
      throw new Error(`El horario de ${day} no es válido.`);
    }
    if (value.enabled && value.open >= value.close) throw new Error(`La apertura de ${day} debe ser anterior al cierre.`);
    normalized[day] = { open: value.open, close: value.close, enabled: Boolean(value.enabled) };
  }
  await dbRun(
    'UPDATE tenants SET business_hours_json = ?, updated_at = ? WHERE id = ?',
    JSON.stringify(normalized),
    new Date().toISOString(),
    context.tenant.id,
  );
  return getDashboardData(await getContextForTenantSlug(context.tenant.slug));
}

function isValidClock(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) >= 0
    && Number(match[1]) <= 23
    && Number(match[2]) >= 0
    && Number(match[2]) <= 59;
}

function auditItem(
  tenantId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
  createdAt: string,
): { sql: string; bindings: unknown[] } {
  return {
    sql: `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, detail, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    bindings: [`audit_${crypto.randomUUID()}`, tenantId, userId, action, entityType, entityId, detail, createdAt],
  };
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const cleaned = String(value ?? '').trim().replace(/\u0000/g, '');
  if (!cleaned) throw new Error(`${label} es obligatorio.`);
  return cleaned.slice(0, maxLength);
}

function optionalText(value: unknown, maxLength: number): string | null {
  const cleaned = String(value ?? '').trim().replace(/\u0000/g, '');
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function validIsoDate(value: string, label: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} no es válida.`);
  return date.toISOString();
}

function requireAdmin(role: 'owner' | 'admin' | 'advisor'): void {
  if (role === 'advisor') throw new Error('Necesitas permisos de administrador para esta acción.');
}
