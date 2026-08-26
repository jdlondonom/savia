import { env } from 'cloudflare:workers';

let initialization: Promise<void> | null = null;

export function getDatabase(): D1Database {
  if (!env.DB) {
    throw new Error('La base de datos local DB no está disponible.');
  }
  return env.DB;
}

export async function dbAll<T>(sql: string, ...bindings: unknown[]): Promise<T[]> {
  const result = await getDatabase().prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

export async function dbFirst<T>(sql: string, ...bindings: unknown[]): Promise<T | null> {
  return getDatabase().prepare(sql).bind(...bindings).first<T>();
}

export async function dbRun(sql: string, ...bindings: unknown[]): Promise<D1Result<unknown>> {
  return getDatabase().prepare(sql).bind(...bindings).run();
}

export async function dbBatch(items: Array<{ sql: string; bindings?: unknown[] }>): Promise<D1Result<unknown>[]> {
  const database = getDatabase();
  return database.batch(
    items.map((item) => database.prepare(item.sql).bind(...(item.bindings ?? []))),
  );
}

export function ensureDatabase(): Promise<void> {
  initialization ??= initializeDatabase().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

async function initializeDatabase(): Promise<void> {
  const db = getDatabase();
  const allowRuntimeMigrations = env.SAVIA_ALLOW_RUNTIME_MIGRATIONS === 'true'
    || env.SAVIA_ENVIRONMENT !== 'production';

  if (!allowRuntimeMigrations) {
    await db.prepare(
      `SELECT t.id
       FROM tenants t
       JOIN tenant_resources r ON r.tenant_id = t.id
       LEFT JOIN tenant_ai_settings ai ON ai.tenant_id = t.id
       LIMIT 1`,
    ).first();
    return;
  }

  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      industry TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT 'America/Bogota',
      assistant_name TEXT NOT NULL DEFAULT 'Savia',
      assistant_tone TEXT NOT NULL DEFAULT 'cálido, claro y profesional',
      assistant_prompt TEXT NOT NULL DEFAULT '',
      business_hours_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tenant_memberships (
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'advisor')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, user_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      whatsapp_id TEXT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      pipeline_stage TEXT NOT NULL DEFAULT 'new' CHECK (pipeline_stage IN ('new', 'qualified', 'proposal', 'won', 'lost')),
      tags_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      last_contact_at TEXT NOT NULL,
      next_follow_up_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, id),
      UNIQUE (tenant_id, phone),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'demo' CHECK (channel IN ('whatsapp', 'demo')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      mode TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human')),
      assigned_user_id TEXT,
      last_message_at TEXT NOT NULL,
      unread_count INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, id),
      FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ai_generations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      user_message_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      result TEXT,
      sources_json TEXT NOT NULL DEFAULT '[]',
      input_tokens INTEGER,
      output_tokens INTEGER,
      estimated_cost_cents INTEGER,
      status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'error')),
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, id),
      FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      sender_type TEXT NOT NULL CHECK (sender_type IN ('contact', 'ai', 'human')),
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'simulated')),
      external_id TEXT,
      ai_provider TEXT,
      ai_model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      generation_id TEXT,
      rag_sources_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE (tenant_id, id),
      UNIQUE (tenant_id, external_id),
      FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('product', 'service')),
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'COP',
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      bookable INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      keywords TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'file')),
      file_name TEXT,
      object_key TEXT,
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'processing', 'failed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      conversation_id TEXT,
      catalog_item_id TEXT,
      service_name TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, id),
      FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (tenant_id, catalog_item_id) REFERENCES catalog_items(tenant_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS platform_roles (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('superadmin', 'support')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS tenant_invitations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      tenant_role TEXT CHECK (tenant_role IN ('owner', 'admin', 'advisor')),
      platform_role TEXT CHECK (platform_role IN ('superadmin', 'support')),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      revoked_at TEXT,
      invited_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
      CHECK (tenant_id IS NOT NULL OR platform_role IS NOT NULL)
    )`,
    `CREATE TABLE IF NOT EXISTS platform_audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ai_provider_connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'huggingface', 'voyage', 'openai_compatible')),
      purpose TEXT NOT NULL CHECK (purpose IN ('llm', 'embedding', 'both')),
      base_url TEXT,
      encrypted_api_key TEXT,
      key_hint TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
      last_tested_at TEXT,
      last_test_status TEXT CHECK (last_test_status IN ('ok', 'error')),
      last_test_message TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS tenant_ai_settings (
      tenant_id TEXT PRIMARY KEY,
      llm_connection_id TEXT,
      llm_model TEXT,
      llm_temperature_milli INTEGER NOT NULL DEFAULT 200,
      llm_max_tokens INTEGER NOT NULL DEFAULT 420,
      llm_fallback_connection_id TEXT,
      llm_fallback_model TEXT,
      embedding_connection_id TEXT,
      embedding_model TEXT,
      embedding_dimensions INTEGER,
      retrieval_mode TEXT NOT NULL DEFAULT 'hybrid' CHECK (retrieval_mode IN ('keyword', 'semantic', 'hybrid')),
      config_version INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (llm_connection_id) REFERENCES ai_provider_connections(id) ON DELETE SET NULL,
      FOREIGN KEY (llm_fallback_connection_id) REFERENCES ai_provider_connections(id) ON DELETE SET NULL,
      FOREIGN KEY (embedding_connection_id) REFERENCES ai_provider_connections(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tenant_resources (
      tenant_id TEXT PRIMARY KEY,
      isolation_mode TEXT NOT NULL DEFAULT 'shared_local' CHECK (isolation_mode IN ('shared_local', 'dedicated')),
      database_binding TEXT,
      files_binding TEXT,
      vector_binding TEXT,
      provisioning_status TEXT NOT NULL DEFAULT 'local' CHECK (provisioning_status IN ('local', 'pending', 'ready', 'error')),
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS tenant_channel_settings (
      tenant_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'meta_whatsapp' CHECK (provider IN ('meta_whatsapp')),
      phone_number_id TEXT UNIQUE,
      whatsapp_business_account_id TEXT,
      encrypted_access_token TEXT,
      access_token_hint TEXT,
      encrypted_app_secret TEXT,
      encrypted_verify_token TEXT,
      graph_version TEXT NOT NULL DEFAULT 'v23.0',
      webhook_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'active', 'error')),
      last_tested_at TEXT,
      last_test_status TEXT CHECK (last_test_status IN ('ok', 'error')),
      last_test_message TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS platform_email_settings (
      id TEXT PRIMARY KEY CHECK (id = 'default'),
      provider TEXT NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend', 'postmark')),
      from_email TEXT,
      from_name TEXT NOT NULL DEFAULT 'Savia',
      encrypted_api_key TEXT,
      key_hint TEXT,
      status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'active', 'error')),
      last_tested_at TEXT,
      last_test_status TEXT CHECK (last_test_status IN ('ok', 'error')),
      last_test_message TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS integration_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      provider TEXT NOT NULL,
      provider_event_id TEXT,
      payload_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'processing', 'complete', 'failed', 'dead_letter')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      UNIQUE (provider, provider_event_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tenant_retention_settings (
      tenant_id TEXT PRIMARY KEY,
      message_retention_days INTEGER NOT NULL DEFAULT 730,
      document_retention_days INTEGER NOT NULL DEFAULT 730,
      audit_retention_days INTEGER NOT NULL DEFAULT 1095,
      delete_inactive_contacts_after_days INTEGER,
      automatic_cleanup INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_estimate INTEGER NOT NULL DEFAULT 0,
      embedding_json TEXT,
      embedding_provider TEXT,
      embedding_model TEXT,
      embedding_dimensions INTEGER,
      embedding_version INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed', 'stale')),
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, source_id, chunk_index),
      FOREIGN KEY (tenant_id, source_id) REFERENCES knowledge_sources(tenant_id, id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS embedding_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      source_id TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
      total_chunks INTEGER NOT NULL DEFAULT 0,
      processed_chunks INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      twoFactorEnabled INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      expiresAt TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      userId TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES auth_users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS auth_accounts (
      id TEXT PRIMARY KEY,
      issuer TEXT NOT NULL,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      userId TEXT NOT NULL,
      accessToken TEXT,
      refreshToken TEXT,
      idToken TEXT,
      accessTokenExpiresAt TEXT,
      refreshTokenExpiresAt TEXT,
      scope TEXT,
      password TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES auth_users(id) ON DELETE CASCADE,
      UNIQUE (issuer, accountId)
    )`,
    `CREATE TABLE IF NOT EXISTS auth_verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS auth_two_factor (
      id TEXT PRIMARY KEY,
      secret TEXT NOT NULL,
      backupCodes TEXT NOT NULL,
      userId TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 1,
      failedVerificationCount INTEGER NOT NULL DEFAULT 0,
      lockedUntil TEXT,
      FOREIGN KEY (userId) REFERENCES auth_users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS rateLimit (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      count INTEGER NOT NULL,
      lastRequest INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_memberships_user ON tenant_memberships(user_id, tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_contacts_tenant_last_contact ON contacts(tenant_id, last_contact_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last_message ON conversations(tenant_id, last_message_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_messages_tenant_conversation_created ON messages(tenant_id, conversation_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_generations_tenant_created ON ai_generations(tenant_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_generations_tenant_conversation ON ai_generations(tenant_id, conversation_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_catalog_tenant_active ON catalog_items(tenant_id, active, name)',
    'CREATE INDEX IF NOT EXISTS idx_knowledge_tenant_updated ON knowledge_sources(tenant_id, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_tenant_start ON appointments(tenant_id, starts_at)',
    'CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_platform_roles_status ON platform_roles(status, role)',
    'CREATE INDEX IF NOT EXISTS idx_invitations_tenant_email ON tenant_invitations(tenant_id, email, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_invitations_expiry ON tenant_invitations(expires_at, accepted_at, revoked_at)',
    'CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_ai_connections_provider ON ai_provider_connections(provider, status)',
    'CREATE INDEX IF NOT EXISTS idx_tenant_resources_status ON tenant_resources(provisioning_status, isolation_mode)',
    'CREATE INDEX IF NOT EXISTS idx_channel_phone_number ON tenant_channel_settings(phone_number_id)',
    'CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status, received_at)',
    'CREATE INDEX IF NOT EXISTS idx_chunks_tenant_source ON knowledge_chunks(tenant_id, source_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_embedding_jobs_tenant_status ON embedding_jobs(tenant_id, status, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(userId)',
    'CREATE INDEX IF NOT EXISTS idx_auth_accounts_user ON auth_accounts(userId)',
    'CREATE INDEX IF NOT EXISTS idx_auth_verifications_identifier ON auth_verifications(identifier)',
    'CREATE INDEX IF NOT EXISTS idx_auth_two_factor_secret ON auth_two_factor(secret)',
    'CREATE INDEX IF NOT EXISTS idx_auth_two_factor_user ON auth_two_factor(userId)',
  ];

  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await ensureColumn(db, 'tenants', 'status', "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn(db, 'users', 'status', "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn(db, 'users', 'updated_at', 'TEXT');
  await ensureColumn(db, 'users', 'last_login_at', 'TEXT');
  await ensureColumn(db, 'tenant_ai_settings', 'daily_request_limit', 'INTEGER NOT NULL DEFAULT 500');
  await ensureColumn(db, 'tenant_ai_settings', 'monthly_token_limit', 'INTEGER NOT NULL DEFAULT 1000000');
  await ensureColumn(db, 'tenant_ai_settings', 'monthly_cost_limit_cents', 'INTEGER NOT NULL DEFAULT 5000');
  await ensureColumn(db, 'tenant_ai_settings', 'input_cost_cents_per_million', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'tenant_ai_settings', 'output_cost_cents_per_million', 'INTEGER NOT NULL DEFAULT 0');
  const messageColumns = await db.prepare('PRAGMA table_info(messages)').all<{ name: string }>();
  if (!(messageColumns.results ?? []).some((column) => column.name === 'generation_id')) {
    await db.prepare('ALTER TABLE messages ADD COLUMN generation_id TEXT').run();
  }
  await db.prepare('PRAGMA optimize').run();

  const tenantCount = await db.prepare('SELECT COUNT(*) AS count FROM tenants').first<{ count: number }>();
  if ((tenantCount?.count ?? 0) === 0) {
    await seedDemoData(db);
  }

  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO tenant_resources (tenant_id, isolation_mode, provisioning_status, created_at, updated_at)
     SELECT id, 'shared_local', 'local', ?, ? FROM tenants
     WHERE id NOT IN (SELECT tenant_id FROM tenant_resources)`,
  ).bind(now, now).run();
  await db.prepare(
    `INSERT INTO tenant_channel_settings (tenant_id, webhook_key, created_at, updated_at)
     SELECT id, lower(hex(randomblob(24))), ?, ? FROM tenants
     WHERE id NOT IN (SELECT tenant_id FROM tenant_channel_settings)`,
  ).bind(now, now).run();
  await db.prepare(
    `INSERT INTO tenant_retention_settings (tenant_id, updated_at)
     SELECT id, ? FROM tenants
     WHERE id NOT IN (SELECT tenant_id FROM tenant_retention_settings)`,
  ).bind(now).run();

}

async function ensureColumn(db: D1Database, table: string, column: string, definition: string): Promise<void> {
  const columns = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if ((columns.results ?? []).some((item) => item.name === column)) return;
  await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

async function seedDemoData(db: D1Database): Promise<void> {
  const now = new Date();
  const iso = (offsetMinutes = 0) => new Date(now.getTime() + offsetMinutes * 60_000).toISOString();
  const hours = JSON.stringify({
    lunes: { open: '08:00', close: '18:00', enabled: true },
    martes: { open: '08:00', close: '18:00', enabled: true },
    miercoles: { open: '08:00', close: '18:00', enabled: true },
    jueves: { open: '08:00', close: '18:00', enabled: true },
    viernes: { open: '08:00', close: '18:00', enabled: true },
    sabado: { open: '09:00', close: '13:00', enabled: true },
    domingo: { open: '09:00', close: '13:00', enabled: false },
  });

  const statements = [
    db.prepare(`INSERT INTO tenants (id, slug, name, industry, timezone, assistant_name, assistant_tone, assistant_prompt, business_hours_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'tenant_aurora', 'clinica-aurora', 'Clínica Aurora', 'Estética y bienestar', 'America/Bogota', 'Alba',
        'cálido, claro y profesional',
        'Prioriza recomendaciones responsables. Nunca diagnostiques. Explica precios y duración solo cuando estén en la base de conocimiento.',
        hours, iso(-10_000), iso(-10_000),
      ),
    db.prepare(`INSERT INTO tenants (id, slug, name, industry, timezone, assistant_name, assistant_tone, assistant_prompt, business_hours_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'tenant_nova', 'dental-nova', 'Dental Nova', 'Salud oral', 'America/Bogota', 'Nora',
        'tranquilo, empático y preciso',
        'Aclara que la orientación no reemplaza una valoración odontológica. No inventes diagnósticos ni tratamientos.',
        hours, iso(-9_000), iso(-9_000),
      ),
    db.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(
      'user_demo', 'seedy@sites.test', 'Juan Administrador', iso(-10_000),
    ),
    db.prepare('INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').bind(
      'tenant_aurora', 'user_demo', 'owner', iso(-10_000),
    ),
    db.prepare('INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').bind(
      'tenant_nova', 'user_demo', 'owner', iso(-9_000),
    ),
    db.prepare(`INSERT INTO contacts (id, tenant_id, whatsapp_id, name, phone, email, pipeline_stage, tags_json, notes, last_contact_at, next_follow_up_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'contact_laura', 'tenant_aurora', '573005550142', 'Laura Martínez', '+57 300 555 0142', 'laura@example.com', 'qualified', '["facial","recurrente"]', 'Prefiere citas en la mañana.', iso(-2), iso(1_440), iso(-7_000), iso(-2),
      ),
    db.prepare(`INSERT INTO contacts (id, tenant_id, whatsapp_id, name, phone, email, pipeline_stage, tags_json, notes, last_contact_at, next_follow_up_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'contact_carlos', 'tenant_aurora', '573105550205', 'Carlos Suárez', '+57 310 555 0205', null, 'proposal', '["corporal"]', '', iso(-26), iso(2_880), iso(-5_000), iso(-26),
      ),
    db.prepare(`INSERT INTO contacts (id, tenant_id, whatsapp_id, name, phone, email, pipeline_stage, tags_json, notes, last_contact_at, next_follow_up_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'contact_ana', 'tenant_aurora', '573155550811', 'Ana María', '+57 315 555 0811', null, 'new', '["premium"]', '', iso(-53), null, iso(-2_000), iso(-53),
      ),
    db.prepare(`INSERT INTO contacts (id, tenant_id, whatsapp_id, name, phone, email, pipeline_stage, tags_json, notes, last_contact_at, next_follow_up_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'contact_mateo', 'tenant_nova', '573205550910', 'Mateo Rojas', '+57 320 555 0910', 'mateo@example.com', 'qualified', '["valoracion"]', 'Sensibilidad dental informada por el paciente.', iso(-12), iso(1_440), iso(-4_000), iso(-12),
      ),
    db.prepare(`INSERT INTO conversations (id, tenant_id, contact_id, channel, status, mode, assigned_user_id, last_message_at, unread_count, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'conv_laura', 'tenant_aurora', 'contact_laura', 'demo', 'open', 'ai', null, iso(-2), 2, 'Interesada en limpieza facial y disponibilidad para mañana.', iso(-90), iso(-2),
      ),
    db.prepare(`INSERT INTO conversations (id, tenant_id, contact_id, channel, status, mode, assigned_user_id, last_message_at, unread_count, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'conv_carlos', 'tenant_aurora', 'contact_carlos', 'demo', 'open', 'human', 'user_demo', iso(-26), 0, 'Cotización corporal enviada.', iso(-300), iso(-26),
      ),
    db.prepare(`INSERT INTO conversations (id, tenant_id, contact_id, channel, status, mode, assigned_user_id, last_message_at, unread_count, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'conv_ana', 'tenant_aurora', 'contact_ana', 'demo', 'open', 'ai', null, iso(-53), 1, 'Consulta inicial sobre plan premium.', iso(-53), iso(-53),
      ),
    db.prepare(`INSERT INTO conversations (id, tenant_id, contact_id, channel, status, mode, assigned_user_id, last_message_at, unread_count, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'conv_mateo', 'tenant_nova', 'contact_mateo', 'demo', 'open', 'ai', null, iso(-12), 1, 'Solicita valoración por sensibilidad dental.', iso(-50), iso(-12),
      ),
    db.prepare(`INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id, rag_sources_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'msg_laura_1', 'tenant_aurora', 'conv_laura', 'inbound', 'contact', 'Hola, quisiera saber qué tratamientos faciales tienen disponibles.', 'received', 'demo-laura-1', '[]', iso(-5),
      ),
    db.prepare(`INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id, ai_provider, ai_model, rag_sources_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'msg_laura_2', 'tenant_aurora', 'conv_laura', 'outbound', 'ai', '¡Hola, Laura! Tenemos limpieza profunda, hidratación intensiva y opciones de rejuvenecimiento. ¿Buscas cuidar tu piel o tratar algo específico?', 'simulated', 'demo-laura-2', 'savia-fallback', 'retrieval-v1', '["Limpieza facial profunda","Hidratación intensiva"]', iso(-4),
      ),
    db.prepare(`INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id, rag_sources_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'msg_laura_3', 'tenant_aurora', 'conv_laura', 'inbound', 'contact', 'Me interesa la limpieza profunda. ¿Tienen disponibilidad para mañana?', 'received', 'demo-laura-3', '[]', iso(-2),
      ),
    db.prepare(`INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id, rag_sources_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'msg_carlos_1', 'tenant_aurora', 'conv_carlos', 'outbound', 'human', 'Perfecto, Carlos. Te envié la cotización y quedo atento a tus preguntas.', 'simulated', 'demo-carlos-1', '[]', iso(-27),
      ),
    db.prepare(`INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id, rag_sources_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'msg_carlos_2', 'tenant_aurora', 'conv_carlos', 'inbound', 'contact', 'Perfecto, muchas gracias.', 'received', 'demo-carlos-2', '[]', iso(-26),
      ),
    db.prepare(`INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id, rag_sources_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'msg_ana_1', 'tenant_aurora', 'conv_ana', 'inbound', 'contact', 'Quisiera conocer el plan premium.', 'received', 'demo-ana-1', '[]', iso(-53),
      ),
    db.prepare(`INSERT INTO messages (id, tenant_id, conversation_id, direction, sender_type, body, status, external_id, rag_sources_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'msg_mateo_1', 'tenant_nova', 'conv_mateo', 'inbound', 'contact', 'Tengo sensibilidad y quisiera agendar una valoración.', 'received', 'demo-mateo-1', '[]', iso(-12),
      ),
    db.prepare(`INSERT INTO catalog_items (id, tenant_id, name, kind, category, description, price_cents, currency, duration_minutes, bookable, active, keywords, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'item_limpieza', 'tenant_aurora', 'Limpieza facial profunda', 'service', 'Facial', 'Limpieza, exfoliación, extracción controlada e hidratación según el tipo de piel.', 18000000, 'COP', 75, 1, 1, 'limpieza facial poros extracción acné piel', iso(-5_000), iso(-5_000),
      ),
    db.prepare(`INSERT INTO catalog_items (id, tenant_id, name, kind, category, description, price_cents, currency, duration_minutes, bookable, active, keywords, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'item_hidratacion', 'tenant_aurora', 'Hidratación intensiva', 'service', 'Facial', 'Protocolo de hidratación con evaluación inicial, ideal para piel opaca o deshidratada.', 14500000, 'COP', 60, 1, 1, 'hidratación facial piel seca luminosidad', iso(-4_900), iso(-4_900),
      ),
    db.prepare(`INSERT INTO catalog_items (id, tenant_id, name, kind, category, description, price_cents, currency, duration_minutes, bookable, active, keywords, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'item_protector', 'tenant_aurora', 'Protector solar mineral SPF 50', 'product', 'Cuidado en casa', 'Protección de amplio espectro, textura ligera y acabado sin brillo.', 8900000, 'COP', 0, 0, 1, 'protector solar mineral spf piel', iso(-4_800), iso(-4_800),
      ),
    db.prepare(`INSERT INTO catalog_items (id, tenant_id, name, kind, category, description, price_cents, currency, duration_minutes, bookable, active, keywords, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'item_valoracion', 'tenant_nova', 'Valoración odontológica', 'service', 'Diagnóstico', 'Revisión clínica inicial y definición del plan de tratamiento. No incluye radiografías.', 8000000, 'COP', 45, 1, 1, 'valoración revisión dolor sensibilidad diagnóstico', iso(-4_500), iso(-4_500),
      ),
    db.prepare(`INSERT INTO catalog_items (id, tenant_id, name, kind, category, description, price_cents, currency, duration_minutes, bookable, active, keywords, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'item_blanqueamiento', 'tenant_nova', 'Blanqueamiento dental', 'service', 'Estética dental', 'Sesión en consultorio sujeta a valoración previa y condiciones de salud oral.', 52000000, 'COP', 90, 1, 1, 'blanqueamiento estética dientes blancos', iso(-4_400), iso(-4_400),
      ),
    db.prepare(`INSERT INTO knowledge_sources (id, tenant_id, title, content, source_type, file_name, object_key, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'knowledge_aurora_policy', 'tenant_aurora', 'Política de reservas', 'Las reservas se confirman con nombre, teléfono y servicio. Se puede reprogramar sin costo avisando con 6 horas de anticipación. La tolerancia de llegada es de 10 minutos.', 'manual', null, null, 'ready', iso(-4_000), iso(-4_000),
      ),
    db.prepare(`INSERT INTO knowledge_sources (id, tenant_id, title, content, source_type, file_name, object_key, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'knowledge_nova_policy', 'tenant_nova', 'Antes de la valoración', 'Para la primera consulta trae radiografías recientes si las tienes. En caso de dolor intenso o inflamación, informa al asesor para priorizar la cita.', 'manual', null, null, 'ready', iso(-3_900), iso(-3_900),
      ),
    db.prepare(`INSERT INTO appointments (id, tenant_id, contact_id, conversation_id, catalog_item_id, service_name, starts_at, ends_at, status, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'appt_laura', 'tenant_aurora', 'contact_laura', 'conv_laura', 'item_limpieza', 'Limpieza facial profunda', iso(1_560), iso(1_635), 'pending', 'Confirmar horario con Laura.', 'user_demo', iso(-2), iso(-2),
      ),
    db.prepare(`INSERT INTO appointments (id, tenant_id, contact_id, conversation_id, catalog_item_id, service_name, starts_at, ends_at, status, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'appt_mateo', 'tenant_nova', 'contact_mateo', 'conv_mateo', 'item_valoracion', 'Valoración odontológica', iso(2_940), iso(2_985), 'confirmed', 'Primera valoración.', 'user_demo', iso(-10), iso(-10),
      ),
    db.prepare(`INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'audit_seed_1', 'tenant_aurora', 'user_demo', 'workspace.created', 'tenant', 'tenant_aurora', 'Espacio de demostración creado.', iso(-10_000),
      ),
    db.prepare(`INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        'audit_seed_2', 'tenant_aurora', 'user_demo', 'appointment.created', 'appointment', 'appt_laura', 'Reserva pendiente para Laura Martínez.', iso(-2),
      ),
  ];

  await db.batch(statements);
}
