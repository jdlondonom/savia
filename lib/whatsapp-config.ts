import { dbFirst } from '@/lib/database';
import { decryptSecret } from '@/lib/secrets';

type ChannelRow = {
  tenant_id: string;
  tenant_slug: string;
  phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  encrypted_access_token: string | null;
  encrypted_app_secret: string | null;
  encrypted_verify_token: string | null;
  graph_version: string;
  webhook_key: string;
  status: 'disabled' | 'active' | 'error';
};

export type WhatsAppChannelConfig = {
  tenantId: string;
  tenantSlug: string;
  phoneNumberId: string;
  whatsappBusinessAccountId: string | null;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  graphVersion: string;
  webhookKey: string;
};

export async function getWhatsAppChannelByTenantId(tenantId: string): Promise<WhatsAppChannelConfig | null> {
  return hydrate(await findChannel('c.tenant_id = ?', tenantId));
}

export async function getWhatsAppChannelByWebhookKey(webhookKey: string): Promise<WhatsAppChannelConfig | null> {
  return hydrate(await findChannel('c.webhook_key = ?', webhookKey));
}

export async function getWhatsAppChannelSummary(tenantId: string): Promise<{
  configured: boolean;
  label: string;
  webhookPath: string;
}> {
  const row = await dbFirst<Pick<ChannelRow, 'status' | 'phone_number_id' | 'webhook_key'>>(
    `SELECT status, phone_number_id, webhook_key FROM tenant_channel_settings WHERE tenant_id = ?`,
    tenantId,
  );
  const configured = row?.status === 'active' && Boolean(row.phone_number_id);
  return {
    configured,
    label: configured ? 'WhatsApp Cloud API conectado' : 'Simulador local activo',
    webhookPath: row?.webhook_key
      ? `/api/webhooks/whatsapp/${row.webhook_key}`
      : '/api/webhooks/whatsapp/sin-configurar',
  };
}

async function findChannel(where: string, value: string): Promise<ChannelRow | null> {
  return dbFirst<ChannelRow>(
    `SELECT c.tenant_id, t.slug AS tenant_slug, c.phone_number_id,
            c.whatsapp_business_account_id, c.encrypted_access_token,
            c.encrypted_app_secret, c.encrypted_verify_token, c.graph_version,
            c.webhook_key, c.status
     FROM tenant_channel_settings c
     JOIN tenants t ON t.id = c.tenant_id
     WHERE ${where} AND t.status = 'active'`,
    value,
  );
}

async function hydrate(row: ChannelRow | null): Promise<WhatsAppChannelConfig | null> {
  if (!row || row.status !== 'active' || !row.phone_number_id) return null;
  const [accessToken, appSecret, verifyToken] = await Promise.all([
    decryptSecret(row.encrypted_access_token),
    decryptSecret(row.encrypted_app_secret),
    decryptSecret(row.encrypted_verify_token),
  ]);
  if (!accessToken || !appSecret || !verifyToken) return null;
  return {
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    phoneNumberId: row.phone_number_id,
    whatsappBusinessAccountId: row.whatsapp_business_account_id,
    accessToken,
    appSecret,
    verifyToken,
    graphVersion: normalizeGraphVersion(row.graph_version),
    webhookKey: row.webhook_key,
  };
}

function normalizeGraphVersion(value: string): string {
  const normalized = value.trim().replace(/^v/i, '');
  return `v${normalized || '23.0'}`;
}
