-- Extensiones productivas del plano de control. Aplicar una sola vez después de 0001.
ALTER TABLE tenant_ai_settings ADD COLUMN daily_request_limit INTEGER NOT NULL DEFAULT 500;
ALTER TABLE tenant_ai_settings ADD COLUMN monthly_token_limit INTEGER NOT NULL DEFAULT 1000000;
ALTER TABLE tenant_ai_settings ADD COLUMN monthly_cost_limit_cents INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE tenant_ai_settings ADD COLUMN input_cost_cents_per_million INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenant_ai_settings ADD COLUMN output_cost_cents_per_million INTEGER NOT NULL DEFAULT 0;

CREATE TABLE tenant_resources (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  isolation_mode TEXT NOT NULL DEFAULT 'dedicated' CHECK (isolation_mode IN ('shared_local', 'dedicated')),
  database_binding TEXT,
  files_binding TEXT,
  vector_binding TEXT,
  provisioning_status TEXT NOT NULL DEFAULT 'pending' CHECK (provisioning_status IN ('local', 'pending', 'ready', 'error')),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tenant_channel_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta_whatsapp' CHECK (provider = 'meta_whatsapp'),
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
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE platform_email_settings (
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
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE integration_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'processing', 'complete', 'failed', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE tenant_retention_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  message_retention_days INTEGER NOT NULL DEFAULT 730,
  document_retention_days INTEGER NOT NULL DEFAULT 730,
  audit_retention_days INTEGER NOT NULL DEFAULT 1095,
  delete_inactive_contacts_after_days INTEGER,
  automatic_cleanup INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_tenant_resources_status ON tenant_resources(provisioning_status, isolation_mode);
CREATE INDEX idx_channel_phone_number ON tenant_channel_settings(phone_number_id);
CREATE INDEX idx_integration_events_status ON integration_events(status, received_at);

INSERT INTO tenant_resources (tenant_id, isolation_mode, provisioning_status, created_at, updated_at)
SELECT id, 'dedicated', 'pending', datetime('now'), datetime('now') FROM tenants;

INSERT INTO tenant_channel_settings (tenant_id, webhook_key, created_at, updated_at)
SELECT id, lower(hex(randomblob(24))), datetime('now'), datetime('now') FROM tenants;

INSERT INTO tenant_retention_settings (tenant_id, updated_at)
SELECT id, datetime('now') FROM tenants;
