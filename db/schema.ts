import { foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  industry: text('industry').notNull().default(''),
  timezone: text('timezone').notNull().default('America/Bogota'),
  assistantName: text('assistant_name').notNull().default('Savia'),
  assistantTone: text('assistant_tone').notNull().default('cálido, claro y profesional'),
  assistantPrompt: text('assistant_prompt').notNull().default(''),
  businessHoursJson: text('business_hours_json').notNull().default('{}'),
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
  lastLoginAt: text('last_login_at'),
});

export const tenantMemberships = sqliteTable(
  'tenant_memberships',
  {
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'advisor'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    index('idx_memberships_user').on(table.userId, table.tenantId),
  ],
);

export const contacts = sqliteTable(
  'contacts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    whatsappId: text('whatsapp_id'),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    pipelineStage: text('pipeline_stage', { enum: ['new', 'qualified', 'proposal', 'won', 'lost'] }).notNull().default('new'),
    tagsJson: text('tags_json').notNull().default('[]'),
    notes: text('notes').notNull().default(''),
    lastContactAt: text('last_contact_at').notNull(),
    nextFollowUpAt: text('next_follow_up_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('contacts_tenant_phone_unique').on(table.tenantId, table.phone),
    uniqueIndex('contacts_tenant_id_unique').on(table.tenantId, table.id),
    index('idx_contacts_tenant_last_contact').on(table.tenantId, table.lastContactAt),
  ],
);

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: text('contact_id').notNull(),
    channel: text('channel', { enum: ['whatsapp', 'demo'] }).notNull().default('demo'),
    status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
    mode: text('mode', { enum: ['ai', 'human'] }).notNull().default('ai'),
    assignedUserId: text('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    lastMessageAt: text('last_message_at').notNull(),
    unreadCount: integer('unread_count').notNull().default(0),
    summary: text('summary').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('conversations_tenant_id_unique').on(table.tenantId, table.id),
    index('idx_conversations_tenant_last_message').on(table.tenantId, table.lastMessageAt),
    foreignKey({
      columns: [table.tenantId, table.contactId],
      foreignColumns: [contacts.tenantId, contacts.id],
      name: 'conversations_tenant_contact_fk',
    }).onDelete('cascade'),
  ],
);

export const aiGenerations = sqliteTable(
  'ai_generations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').notNull(),
    userMessageId: text('user_message_id').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    result: text('result'),
    sourcesJson: text('sources_json').notNull().default('[]'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    estimatedCostCents: integer('estimated_cost_cents'),
    status: text('status', { enum: ['pending', 'complete', 'error'] }).notNull(),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('generations_tenant_id_unique').on(table.tenantId, table.id),
    index('idx_generations_tenant_created').on(table.tenantId, table.createdAt),
    index('idx_generations_tenant_conversation').on(table.tenantId, table.conversationId, table.createdAt),
    foreignKey({
      columns: [table.tenantId, table.conversationId],
      foreignColumns: [conversations.tenantId, conversations.id],
      name: 'generations_tenant_conversation_fk',
    }).onDelete('cascade'),
  ],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').notNull(),
    direction: text('direction', { enum: ['inbound', 'outbound'] }).notNull(),
    senderType: text('sender_type', { enum: ['contact', 'ai', 'human'] }).notNull(),
    body: text('body').notNull(),
    status: text('status', { enum: ['received', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'simulated'] }).notNull().default('received'),
    externalId: text('external_id'),
    aiProvider: text('ai_provider'),
    aiModel: text('ai_model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    generationId: text('generation_id'),
    ragSourcesJson: text('rag_sources_json').notNull().default('[]'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('messages_tenant_id_unique').on(table.tenantId, table.id),
    uniqueIndex('messages_tenant_external_unique').on(table.tenantId, table.externalId),
    index('idx_messages_tenant_conversation_created').on(table.tenantId, table.conversationId, table.createdAt),
    foreignKey({
      columns: [table.tenantId, table.conversationId],
      foreignColumns: [conversations.tenantId, conversations.id],
      name: 'messages_tenant_conversation_fk',
    }).onDelete('cascade'),
  ],
);

export const catalogItems = sqliteTable(
  'catalog_items',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['product', 'service'] }).notNull(),
    category: text('category').notNull().default(''),
    description: text('description').notNull(),
    priceCents: integer('price_cents').notNull().default(0),
    currency: text('currency').notNull().default('COP'),
    durationMinutes: integer('duration_minutes').notNull().default(0),
    bookable: integer('bookable', { mode: 'boolean' }).notNull().default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    keywords: text('keywords').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('catalog_tenant_id_unique').on(table.tenantId, table.id),
    index('idx_catalog_tenant_active').on(table.tenantId, table.active, table.name),
  ],
);

export const knowledgeSources = sqliteTable(
  'knowledge_sources',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    sourceType: text('source_type', { enum: ['manual', 'file'] }).notNull(),
    fileName: text('file_name'),
    objectKey: text('object_key'),
    status: text('status', { enum: ['ready', 'processing', 'failed'] }).notNull().default('ready'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_tenant_id_unique').on(table.tenantId, table.id),
    index('idx_knowledge_tenant_updated').on(table.tenantId, table.updatedAt),
  ],
);

export const appointments = sqliteTable(
  'appointments',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: text('contact_id').notNull(),
    conversationId: text('conversation_id'),
    catalogItemId: text('catalog_item_id'),
    serviceName: text('service_name').notNull(),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'] }).notNull().default('pending'),
    notes: text('notes').notNull().default(''),
    createdBy: text('created_by').notNull().references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('appointments_tenant_id_unique').on(table.tenantId, table.id),
    index('idx_appointments_tenant_start').on(table.tenantId, table.startsAt),
    foreignKey({
      columns: [table.tenantId, table.contactId],
      foreignColumns: [contacts.tenantId, contacts.id],
      name: 'appointments_tenant_contact_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.conversationId],
      foreignColumns: [conversations.tenantId, conversations.id],
      name: 'appointments_tenant_conversation_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.catalogItemId],
      foreignColumns: [catalogItems.tenantId, catalogItems.id],
      name: 'appointments_tenant_catalog_fk',
    }).onDelete('restrict'),
  ],
);

export const appointmentSlots = sqliteTable(
  'appointment_slots',
  {
    tenantId: text('tenant_id').notNull(),
    slotStart: text('slot_start').notNull(),
    appointmentId: text('appointment_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.slotStart] }),
    foreignKey({
      columns: [table.tenantId, table.appointmentId],
      foreignColumns: [appointments.tenantId, appointments.id],
      name: 'appointment_slots_tenant_appointment_fk',
    }).onDelete('cascade'),
  ],
);

export const calendarBlackouts = sqliteTable(
  'calendar_blackouts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    reason: text('reason').notNull().default(''),
    createdBy: text('created_by').notNull().references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('calendar_blackouts_tenant_id_unique').on(table.tenantId, table.id),
    index('idx_blackouts_tenant_start').on(table.tenantId, table.startsAt),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    detail: text('detail').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_audit_tenant_created').on(table.tenantId, table.createdAt)],
);

export const platformRoles = sqliteTable(
  'platform_roles',
  {
    userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['superadmin', 'support'] }).notNull(),
    status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_platform_roles_status').on(table.status, table.role)],
);

export const tenantInvitations = sqliteTable(
  'tenant_invitations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    tenantRole: text('tenant_role', { enum: ['owner', 'admin', 'advisor'] }),
    platformRole: text('platform_role', { enum: ['superadmin', 'support'] }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: text('expires_at').notNull(),
    acceptedAt: text('accepted_at'),
    revokedAt: text('revoked_at'),
    invitedBy: text('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_invitations_tenant_email').on(table.tenantId, table.email, table.createdAt),
    index('idx_invitations_expiry').on(table.expiresAt, table.acceptedAt, table.revokedAt),
  ],
);

export const platformAuditLogs = sqliteTable(
  'platform_audit_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    detail: text('detail').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_platform_audit_created').on(table.createdAt)],
);

export const aiProviderConnections = sqliteTable(
  'ai_provider_connections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    provider: text('provider', { enum: ['openai', 'anthropic', 'huggingface', 'voyage', 'openai_compatible'] }).notNull(),
    purpose: text('purpose', { enum: ['llm', 'embedding', 'both'] }).notNull(),
    baseUrl: text('base_url'),
    encryptedApiKey: text('encrypted_api_key'),
    keyHint: text('key_hint'),
    status: text('status', { enum: ['active', 'disabled', 'error'] }).notNull().default('active'),
    lastTestedAt: text('last_tested_at'),
    lastTestStatus: text('last_test_status', { enum: ['ok', 'error'] }),
    lastTestMessage: text('last_test_message'),
    createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_ai_connections_provider').on(table.provider, table.status)],
);

export const tenantAiSettings = sqliteTable('tenant_ai_settings', {
  tenantId: text('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  llmConnectionId: text('llm_connection_id').references(() => aiProviderConnections.id, { onDelete: 'set null' }),
  llmModel: text('llm_model'),
  llmTemperatureMilli: integer('llm_temperature_milli').notNull().default(200),
  llmMaxTokens: integer('llm_max_tokens').notNull().default(420),
  llmFallbackConnectionId: text('llm_fallback_connection_id').references(() => aiProviderConnections.id, { onDelete: 'set null' }),
  llmFallbackModel: text('llm_fallback_model'),
  embeddingConnectionId: text('embedding_connection_id').references(() => aiProviderConnections.id, { onDelete: 'set null' }),
  embeddingModel: text('embedding_model'),
  embeddingDimensions: integer('embedding_dimensions'),
  retrievalMode: text('retrieval_mode', { enum: ['keyword', 'semantic', 'hybrid'] }).notNull().default('hybrid'),
  configVersion: integer('config_version').notNull().default(1),
  dailyRequestLimit: integer('daily_request_limit').notNull().default(500),
  monthlyTokenLimit: integer('monthly_token_limit').notNull().default(1_000_000),
  monthlyCostLimitCents: integer('monthly_cost_limit_cents').notNull().default(5_000),
  inputCostCentsPerMillion: integer('input_cost_cents_per_million').notNull().default(0),
  outputCostCentsPerMillion: integer('output_cost_cents_per_million').notNull().default(0),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: text('updated_at').notNull(),
});

export const tenantResources = sqliteTable(
  'tenant_resources',
  {
    tenantId: text('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
    isolationMode: text('isolation_mode', { enum: ['shared_local', 'dedicated'] }).notNull().default('shared_local'),
    databaseBinding: text('database_binding'),
    filesBinding: text('files_binding'),
    vectorBinding: text('vector_binding'),
    provisioningStatus: text('provisioning_status', { enum: ['local', 'pending', 'ready', 'error'] }).notNull().default('local'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_tenant_resources_status').on(table.provisioningStatus, table.isolationMode)],
);

export const tenantChannelSettings = sqliteTable(
  'tenant_channel_settings',
  {
    tenantId: text('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['meta_whatsapp'] }).notNull().default('meta_whatsapp'),
    phoneNumberId: text('phone_number_id').unique(),
    whatsappBusinessAccountId: text('whatsapp_business_account_id'),
    encryptedAccessToken: text('encrypted_access_token'),
    accessTokenHint: text('access_token_hint'),
    encryptedAppSecret: text('encrypted_app_secret'),
    encryptedVerifyToken: text('encrypted_verify_token'),
    graphVersion: text('graph_version').notNull().default('v23.0'),
    webhookKey: text('webhook_key').notNull().unique(),
    status: text('status', { enum: ['disabled', 'active', 'error'] }).notNull().default('disabled'),
    lastTestedAt: text('last_tested_at'),
    lastTestStatus: text('last_test_status', { enum: ['ok', 'error'] }),
    lastTestMessage: text('last_test_message'),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_channel_phone_number').on(table.phoneNumberId)],
);

export const platformEmailSettings = sqliteTable('platform_email_settings', {
  id: text('id').primaryKey(),
  provider: text('provider', { enum: ['resend', 'postmark'] }).notNull().default('resend'),
  fromEmail: text('from_email'),
  fromName: text('from_name').notNull().default('Savia'),
  encryptedApiKey: text('encrypted_api_key'),
  keyHint: text('key_hint'),
  status: text('status', { enum: ['disabled', 'active', 'error'] }).notNull().default('disabled'),
  lastTestedAt: text('last_tested_at'),
  lastTestStatus: text('last_test_status', { enum: ['ok', 'error'] }),
  lastTestMessage: text('last_test_message'),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const integrationEvents = sqliteTable(
  'integration_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id'),
    payloadHash: text('payload_hash').notNull(),
    status: text('status', { enum: ['received', 'queued', 'processing', 'complete', 'failed', 'dead_letter'] }).notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    receivedAt: text('received_at').notNull(),
    processedAt: text('processed_at'),
  },
  (table) => [
    uniqueIndex('integration_events_provider_id_unique').on(table.provider, table.providerEventId),
    index('idx_integration_events_status').on(table.status, table.receivedAt),
  ],
);

export const tenantRetentionSettings = sqliteTable('tenant_retention_settings', {
  tenantId: text('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  messageRetentionDays: integer('message_retention_days').notNull().default(730),
  documentRetentionDays: integer('document_retention_days').notNull().default(730),
  auditRetentionDays: integer('audit_retention_days').notNull().default(1_095),
  deleteInactiveContactsAfterDays: integer('delete_inactive_contacts_after_days'),
  automaticCleanup: integer('automatic_cleanup', { mode: 'boolean' }).notNull().default(false),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: text('updated_at').notNull(),
});

export const knowledgeChunks = sqliteTable(
  'knowledge_chunks',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenEstimate: integer('token_estimate').notNull().default(0),
    embeddingJson: text('embedding_json'),
    embeddingProvider: text('embedding_provider'),
    embeddingModel: text('embedding_model'),
    embeddingDimensions: integer('embedding_dimensions'),
    embeddingVersion: integer('embedding_version').notNull().default(0),
    vectorId: text('vector_id'),
    status: text('status', { enum: ['pending', 'ready', 'failed', 'stale'] }).notNull().default('pending'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_chunks_tenant_source_index_unique').on(table.tenantId, table.sourceId, table.chunkIndex),
    index('idx_chunks_tenant_source').on(table.tenantId, table.sourceId, table.status),
    foreignKey({
      columns: [table.tenantId, table.sourceId],
      foreignColumns: [knowledgeSources.tenantId, knowledgeSources.id],
      name: 'knowledge_chunks_tenant_source_fk',
    }).onDelete('cascade'),
  ],
);

export const catalogChunks = sqliteTable(
  'catalog_chunks',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    catalogItemId: text('catalog_item_id').notNull(),
    content: text('content').notNull(),
    embeddingJson: text('embedding_json'),
    embeddingProvider: text('embedding_provider'),
    embeddingModel: text('embedding_model'),
    embeddingDimensions: integer('embedding_dimensions'),
    embeddingVersion: integer('embedding_version').notNull().default(0),
    vectorId: text('vector_id'),
    status: text('status', { enum: ['pending', 'ready', 'failed', 'stale'] }).notNull().default('pending'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('catalog_chunks_tenant_item_unique').on(table.tenantId, table.catalogItemId),
    index('idx_catalog_chunks_tenant_item').on(table.tenantId, table.catalogItemId, table.status),
    foreignKey({
      columns: [table.tenantId, table.catalogItemId],
      foreignColumns: [catalogItems.tenantId, catalogItems.id],
      name: 'catalog_chunks_tenant_item_fk',
    }).onDelete('cascade'),
  ],
);

export const embeddingJobs = sqliteTable(
  'embedding_jobs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    sourceId: text('source_id'),
    catalogItemId: text('catalog_item_id'),
    reason: text('reason').notNull(),
    status: text('status', { enum: ['pending', 'running', 'complete', 'failed'] }).notNull().default('pending'),
    totalChunks: integer('total_chunks').notNull().default(0),
    processedChunks: integer('processed_chunks').notNull().default(0),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_embedding_jobs_tenant_status').on(table.tenantId, table.status, table.createdAt)],
);

export const privacyRequests = sqliteTable(
  'privacy_requests',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: text('contact_id'),
    requestType: text('request_type', { enum: ['tenant_export', 'contact_export', 'contact_delete'] }).notNull(),
    status: text('status', { enum: ['pending', 'processing', 'complete', 'failed'] }).notNull().default('pending'),
    requestedBy: text('requested_by').notNull(),
    artifactKey: text('artifact_key'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [index('idx_privacy_requests_tenant_status').on(table.tenantId, table.status, table.createdAt)],
);

export const outboxEvents = sqliteTable(
  'outbox_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    eventType: text('event_type').notNull(),
    aggregateId: text('aggregate_id'),
    payloadJson: text('payload_json').notNull(),
    status: text('status', { enum: ['pending', 'published', 'failed'] }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: text('available_at').notNull(),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    publishedAt: text('published_at'),
  },
  (table) => [index('idx_outbox_pending').on(table.status, table.availableAt)],
);

export const authUsers = sqliteTable('auth_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
  twoFactorEnabled: integer('twoFactorEnabled', { mode: 'boolean' }).notNull().default(false),
});

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: text('expiresAt').notNull(),
    token: text('token').notNull().unique(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  },
  (table) => [index('idx_auth_sessions_user').on(table.userId)],
);

export const authAccounts = sqliteTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: text('accessTokenExpiresAt'),
    refreshTokenExpiresAt: text('refreshTokenExpiresAt'),
    scope: text('scope'),
    password: text('password'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  (table) => [
    uniqueIndex('auth_accounts_issuer_account_unique').on(table.issuer, table.accountId),
    index('idx_auth_accounts_user').on(table.userId),
  ],
);

export const authVerifications = sqliteTable(
  'auth_verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: text('expiresAt').notNull(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  (table) => [index('idx_auth_verifications_identifier').on(table.identifier)],
);

export const authTwoFactor = sqliteTable(
  'auth_two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backupCodes').notNull(),
    userId: text('userId').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(true),
    failedVerificationCount: integer('failedVerificationCount').notNull().default(0),
    lockedUntil: text('lockedUntil'),
  },
  (table) => [
    index('idx_auth_two_factor_secret').on(table.secret),
    index('idx_auth_two_factor_user').on(table.userId),
  ],
);

export const rateLimit = sqliteTable('rateLimit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('lastRequest').notNull(),
});
