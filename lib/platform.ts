import { dbAll, ensureDatabase } from '@/lib/database';
import { tenantDbFirst } from '@/lib/tenant-database';
import { requirePlatformUser, type PlatformRole } from '@/lib/session';

export type TenantRole = 'owner' | 'admin' | 'advisor';
export type AccountStatus = 'active' | 'suspended';
export type AiProvider = 'openai' | 'anthropic' | 'huggingface' | 'voyage' | 'openai_compatible';
export type AiPurpose = 'llm' | 'embedding' | 'both';

export type PlatformTenant = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  status: AccountStatus;
  memberCount: number;
  ownerCount: number;
  knowledgeCount: number;
  isolationMode: 'shared_local' | 'dedicated';
  provisioningStatus: 'local' | 'pending' | 'ready' | 'error';
  databaseBinding: string | null;
  filesBinding: string | null;
  vectorBinding: string | null;
  resourceError: string | null;
  whatsappStatus: 'disabled' | 'active' | 'error';
  whatsappPhoneNumberId: string | null;
  whatsappTokenHint: string | null;
  whatsappWebhookPath: string;
  whatsappLastTestStatus: 'ok' | 'error' | null;
  messageRetentionDays: number;
  documentRetentionDays: number;
  auditRetentionDays: number;
  automaticCleanup: boolean;
  createdAt: string;
};

export type PlatformMembership = {
  tenantId: string;
  tenantName: string;
  role: TenantRole;
};

export type PlatformUser = {
  id: string;
  email: string;
  name: string;
  status: AccountStatus;
  hasCredentials: boolean;
  mfaEnabled: boolean;
  platformRole: PlatformRole | null;
  platformStatus: AccountStatus | null;
  createdAt: string;
  lastLoginAt: string | null;
  memberships: PlatformMembership[];
};

export type ProviderConnection = {
  id: string;
  name: string;
  provider: AiProvider;
  purpose: AiPurpose;
  baseUrl: string | null;
  keyHint: string | null;
  status: 'active' | 'disabled' | 'error';
  lastTestedAt: string | null;
  lastTestStatus: 'ok' | 'error' | null;
  lastTestMessage: string | null;
  updatedAt: string;
};

export type TenantAiSetting = {
  tenantId: string;
  llmConnectionId: string | null;
  llmModel: string | null;
  llmTemperatureMilli: number;
  llmMaxTokens: number;
  llmFallbackConnectionId: string | null;
  llmFallbackModel: string | null;
  embeddingConnectionId: string | null;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  retrievalMode: 'keyword' | 'semantic' | 'hybrid';
  configVersion: number;
  dailyRequestLimit: number;
  monthlyTokenLimit: number;
  monthlyCostLimitCents: number;
  inputCostCentsPerMillion: number;
  outputCostCentsPerMillion: number;
  updatedAt: string;
};

export type PlatformEmailSetting = {
  provider: 'resend' | 'postmark';
  fromEmail: string | null;
  fromName: string;
  keyHint: string | null;
  status: 'disabled' | 'active' | 'error';
  lastTestStatus: 'ok' | 'error' | null;
  lastTestMessage: string | null;
};

export type PlatformInvitation = {
  id: string;
  email: string;
  name: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantRole: TenantRole | null;
  platformRole: PlatformRole | null;
  expiresAt: string;
  createdAt: string;
};

export type PlatformAudit = {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  detail: string;
  createdAt: string;
};

export type PlatformData = {
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: PlatformRole;
  };
  tenants: PlatformTenant[];
  users: PlatformUser[];
  providers: ProviderConnection[];
  aiSettings: TenantAiSetting[];
  invitations: PlatformInvitation[];
  audit: PlatformAudit[];
  email: PlatformEmailSetting | null;
};

type MembershipRow = {
  tenant_id: string;
  tenant_name: string;
  user_id: string;
  role: TenantRole;
};

export async function getPlatformData(): Promise<PlatformData> {
  await ensureDatabase();
  const session = await requirePlatformUser();

  const [tenants, users, memberships, providers, aiSettings, invitations, audit, emailSettings] = await Promise.all([
    dbAll<{
      id: string;
      slug: string;
      name: string;
      industry: string;
      status: AccountStatus;
      member_count: number;
      owner_count: number;
      isolation_mode: PlatformTenant['isolationMode'];
      provisioning_status: PlatformTenant['provisioningStatus'];
      database_binding: string | null;
      files_binding: string | null;
      vector_binding: string | null;
      resource_error: string | null;
      whatsapp_status: PlatformTenant['whatsappStatus'];
      phone_number_id: string | null;
      access_token_hint: string | null;
      webhook_key: string;
      whatsapp_last_test_status: PlatformTenant['whatsappLastTestStatus'];
      message_retention_days: number;
      document_retention_days: number;
      audit_retention_days: number;
      automatic_cleanup: number;
      created_at: string;
    }>(
      `SELECT t.id, t.slug, t.name, t.industry, t.status, t.created_at,
              COUNT(DISTINCT m.user_id) AS member_count,
              COUNT(DISTINCT CASE WHEN m.role = 'owner' THEN m.user_id END) AS owner_count,
              r.isolation_mode, r.provisioning_status, r.database_binding,
              r.files_binding, r.vector_binding, r.last_error AS resource_error,
              c.status AS whatsapp_status, c.phone_number_id, c.access_token_hint,
              c.webhook_key, c.last_test_status AS whatsapp_last_test_status,
              retention.message_retention_days, retention.document_retention_days,
              retention.audit_retention_days, retention.automatic_cleanup
       FROM tenants t
       LEFT JOIN tenant_memberships m ON m.tenant_id = t.id
       JOIN tenant_resources r ON r.tenant_id = t.id
       JOIN tenant_channel_settings c ON c.tenant_id = t.id
       JOIN tenant_retention_settings retention ON retention.tenant_id = t.id
       GROUP BY t.id
       ORDER BY t.name`,
    ),
    dbAll<{
      id: string;
      email: string;
      name: string;
      status: AccountStatus;
      auth_user_id: string | null;
      mfa_enabled: number;
      platform_role: PlatformRole | null;
      platform_status: AccountStatus | null;
      created_at: string;
      last_login_at: string | null;
    }>(
      `SELECT u.id, u.email, u.name, u.status, u.created_at, u.last_login_at,
              au.id AS auth_user_id, COALESCE(au.twoFactorEnabled, 0) AS mfa_enabled,
              pr.role AS platform_role, pr.status AS platform_status
       FROM users u
       LEFT JOIN auth_users au ON au.id = u.id
       LEFT JOIN platform_roles pr ON pr.user_id = u.id
       ORDER BY u.name, u.email`,
    ),
    dbAll<MembershipRow>(
      `SELECT m.tenant_id, t.name AS tenant_name, m.user_id, m.role
       FROM tenant_memberships m
       JOIN tenants t ON t.id = m.tenant_id
       ORDER BY t.name`,
    ),
    dbAll<{
      id: string;
      name: string;
      provider: AiProvider;
      purpose: AiPurpose;
      base_url: string | null;
      key_hint: string | null;
      status: ProviderConnection['status'];
      last_tested_at: string | null;
      last_test_status: ProviderConnection['lastTestStatus'];
      last_test_message: string | null;
      updated_at: string;
    }>(
      `SELECT id, name, provider, purpose, base_url, key_hint, status,
              last_tested_at, last_test_status, last_test_message, updated_at
       FROM ai_provider_connections ORDER BY name`,
    ),
    dbAll<{
      tenant_id: string;
      llm_connection_id: string | null;
      llm_model: string | null;
      llm_temperature_milli: number;
      llm_max_tokens: number;
      llm_fallback_connection_id: string | null;
      llm_fallback_model: string | null;
      embedding_connection_id: string | null;
      embedding_model: string | null;
      embedding_dimensions: number | null;
      retrieval_mode: TenantAiSetting['retrievalMode'];
      config_version: number;
      daily_request_limit: number;
      monthly_token_limit: number;
      monthly_cost_limit_cents: number;
      input_cost_cents_per_million: number;
      output_cost_cents_per_million: number;
      updated_at: string;
    }>('SELECT * FROM tenant_ai_settings ORDER BY tenant_id'),
    dbAll<{
      id: string;
      email: string;
      name: string;
      tenant_id: string | null;
      tenant_name: string | null;
      tenant_role: TenantRole | null;
      platform_role: PlatformRole | null;
      expires_at: string;
      created_at: string;
    }>(
      `SELECT i.id, i.email, i.name, i.tenant_id, t.name AS tenant_name,
              i.tenant_role, i.platform_role, i.expires_at, i.created_at
       FROM tenant_invitations i
       LEFT JOIN tenants t ON t.id = i.tenant_id
       WHERE i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?
       ORDER BY i.created_at DESC`,
      new Date().toISOString(),
    ),
    dbAll<{
      id: string;
      actor_name: string | null;
      action: string;
      entity_type: string;
      detail: string;
      created_at: string;
    }>(
      `SELECT a.id, u.name AS actor_name, a.action, a.entity_type, a.detail, a.created_at
       FROM platform_audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 60`,
    ),
    dbAll<{
      provider: PlatformEmailSetting['provider'];
      from_email: string | null;
      from_name: string;
      key_hint: string | null;
      status: PlatformEmailSetting['status'];
      last_test_status: PlatformEmailSetting['lastTestStatus'];
      last_test_message: string | null;
    }>(`SELECT provider, from_email, from_name, key_hint, status, last_test_status, last_test_message
        FROM platform_email_settings WHERE id = 'default'`),
  ]);

  const knowledgeCounts = new Map(await Promise.all(tenants.map(async (tenant) => {
    const count = await tenantDbFirst<{ count: number }>(
      tenant.id,
      'SELECT COUNT(*) AS count FROM knowledge_sources WHERE tenant_id = ?',
      tenant.id,
    ).catch(() => null);
    return [tenant.id, Number(count?.count ?? 0)] as const;
  })));

  const membershipsByUser = new Map<string, PlatformMembership[]>();
  for (const membership of memberships) {
    const list = membershipsByUser.get(membership.user_id) ?? [];
    list.push({
      tenantId: membership.tenant_id,
      tenantName: membership.tenant_name,
      role: membership.role,
    });
    membershipsByUser.set(membership.user_id, list);
  }

  return {
    currentUser: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.platformRole!,
    },
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      industry: tenant.industry,
      status: tenant.status,
      memberCount: Number(tenant.member_count),
      ownerCount: Number(tenant.owner_count),
      knowledgeCount: knowledgeCounts.get(tenant.id) ?? 0,
      isolationMode: tenant.isolation_mode,
      provisioningStatus: tenant.provisioning_status,
      databaseBinding: tenant.database_binding,
      filesBinding: tenant.files_binding,
      vectorBinding: tenant.vector_binding,
      resourceError: tenant.resource_error,
      whatsappStatus: tenant.whatsapp_status,
      whatsappPhoneNumberId: tenant.phone_number_id,
      whatsappTokenHint: tenant.access_token_hint,
      whatsappWebhookPath: `/api/webhooks/whatsapp/${tenant.webhook_key}`,
      whatsappLastTestStatus: tenant.whatsapp_last_test_status,
      messageRetentionDays: Number(tenant.message_retention_days),
      documentRetentionDays: Number(tenant.document_retention_days),
      auditRetentionDays: Number(tenant.audit_retention_days),
      automaticCleanup: Boolean(tenant.automatic_cleanup),
      createdAt: tenant.created_at,
    })),
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      hasCredentials: Boolean(user.auth_user_id),
      mfaEnabled: Boolean(user.mfa_enabled),
      platformRole: user.platform_role,
      platformStatus: user.platform_status,
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
      memberships: membershipsByUser.get(user.id) ?? [],
    })),
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      provider: provider.provider,
      purpose: provider.purpose,
      baseUrl: provider.base_url,
      keyHint: provider.key_hint,
      status: provider.status,
      lastTestedAt: provider.last_tested_at,
      lastTestStatus: provider.last_test_status,
      lastTestMessage: provider.last_test_message,
      updatedAt: provider.updated_at,
    })),
    aiSettings: aiSettings.map((setting) => ({
      tenantId: setting.tenant_id,
      llmConnectionId: setting.llm_connection_id,
      llmModel: setting.llm_model,
      llmTemperatureMilli: Number(setting.llm_temperature_milli),
      llmMaxTokens: Number(setting.llm_max_tokens),
      llmFallbackConnectionId: setting.llm_fallback_connection_id,
      llmFallbackModel: setting.llm_fallback_model,
      embeddingConnectionId: setting.embedding_connection_id,
      embeddingModel: setting.embedding_model,
      embeddingDimensions: setting.embedding_dimensions === null ? null : Number(setting.embedding_dimensions),
      retrievalMode: setting.retrieval_mode,
      configVersion: Number(setting.config_version),
      dailyRequestLimit: Number(setting.daily_request_limit),
      monthlyTokenLimit: Number(setting.monthly_token_limit),
      monthlyCostLimitCents: Number(setting.monthly_cost_limit_cents),
      inputCostCentsPerMillion: Number(setting.input_cost_cents_per_million),
      outputCostCentsPerMillion: Number(setting.output_cost_cents_per_million),
      updatedAt: setting.updated_at,
    })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      tenantId: invitation.tenant_id,
      tenantName: invitation.tenant_name,
      tenantRole: invitation.tenant_role,
      platformRole: invitation.platform_role,
      expiresAt: invitation.expires_at,
      createdAt: invitation.created_at,
    })),
    audit: audit.map((entry) => ({
      id: entry.id,
      actorName: entry.actor_name,
      action: entry.action,
      entityType: entry.entity_type,
      detail: entry.detail,
      createdAt: entry.created_at,
    })),
    email: emailSettings[0] ? {
      provider: emailSettings[0].provider,
      fromEmail: emailSettings[0].from_email,
      fromName: emailSettings[0].from_name,
      keyHint: emailSettings[0].key_hint,
      status: emailSettings[0].status,
      lastTestStatus: emailSettings[0].last_test_status,
      lastTestMessage: emailSettings[0].last_test_message,
    } : null,
  };
}
