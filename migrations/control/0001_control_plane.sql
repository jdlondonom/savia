-- Línea base del plano de control. Aplicar primero sobre una D1 global vacía.
-- No contiene conversaciones, contactos, mensajes, agenda ni documentos de tenants.
PRAGMA foreign_keys = ON;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'America/Bogota',
  assistant_name TEXT NOT NULL DEFAULT 'Savia',
  assistant_tone TEXT NOT NULL DEFAULT 'cálido, claro y profesional',
  assistant_prompt TEXT NOT NULL DEFAULT '',
  business_hours_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  last_login_at TEXT
);

CREATE TABLE tenant_memberships (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','advisor')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id,user_id)
);

CREATE TABLE platform_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('superadmin','support')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tenant_invitations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  tenant_role TEXT CHECK (tenant_role IN ('owner','admin','advisor')),
  platform_role TEXT CHECK (platform_role IN ('superadmin','support')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  CHECK (tenant_id IS NOT NULL OR platform_role IS NOT NULL)
);

CREATE TABLE platform_audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE ai_provider_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openai','anthropic','huggingface','voyage','openai_compatible')),
  purpose TEXT NOT NULL CHECK (purpose IN ('llm','embedding','both')),
  base_url TEXT,
  encrypted_api_key TEXT,
  key_hint TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','error')),
  last_tested_at TEXT,
  last_test_status TEXT CHECK (last_test_status IN ('ok','error')),
  last_test_message TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tenant_ai_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  llm_connection_id TEXT REFERENCES ai_provider_connections(id) ON DELETE SET NULL,
  llm_model TEXT,
  llm_temperature_milli INTEGER NOT NULL DEFAULT 200,
  llm_max_tokens INTEGER NOT NULL DEFAULT 420,
  llm_fallback_connection_id TEXT REFERENCES ai_provider_connections(id) ON DELETE SET NULL,
  llm_fallback_model TEXT,
  embedding_connection_id TEXT REFERENCES ai_provider_connections(id) ON DELETE SET NULL,
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  retrieval_mode TEXT NOT NULL DEFAULT 'hybrid' CHECK (retrieval_mode IN ('keyword','semantic','hybrid')),
  config_version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  twoFactorEnabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
);

CREATE TABLE auth_accounts (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE (issuer,accountId)
);

CREATE TABLE auth_verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE auth_two_factor (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  backupCodes TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  verified INTEGER NOT NULL DEFAULT 1,
  failedVerificationCount INTEGER NOT NULL DEFAULT 0,
  lockedUntil TEXT
);

CREATE TABLE rateLimit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);

CREATE INDEX idx_memberships_user ON tenant_memberships(user_id,tenant_id);
CREATE INDEX idx_platform_roles_status ON platform_roles(status,role);
CREATE INDEX idx_invitations_tenant_email ON tenant_invitations(tenant_id,email,created_at DESC);
CREATE INDEX idx_invitations_expiry ON tenant_invitations(expires_at,accepted_at,revoked_at);
CREATE INDEX idx_platform_audit_created ON platform_audit_logs(created_at DESC);
CREATE INDEX idx_ai_connections_provider ON ai_provider_connections(provider,status);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(userId);
CREATE INDEX idx_auth_accounts_user ON auth_accounts(userId);
CREATE INDEX idx_auth_verifications_identifier ON auth_verifications(identifier);
CREATE INDEX idx_auth_two_factor_secret ON auth_two_factor(secret);
CREATE INDEX idx_auth_two_factor_user ON auth_two_factor(userId);

PRAGMA optimize;
