import { env } from 'cloudflare:workers';
import {
  getEnvironmentLabel,
  getPublicAppUrl,
  getReleaseLabel,
  isDeployedEnvironment,
} from '@/lib/environment';
import { getWhatsAppChannelSummary } from '@/lib/whatsapp-config';
import type { RuntimeStatus } from '@/lib/types';

export function getAiConfig(): { baseURL: string; model: string; apiKey?: string } | null {
  const baseURL = env.LOCAL_AI_BASE_URL?.trim();
  const model = env.LOCAL_AI_MODEL?.trim();
  if (!baseURL || !model) return null;

  return {
    baseURL: baseURL.replace(/\/$/, ''),
    model,
    apiKey: env.LOCAL_AI_API_KEY?.trim() || undefined,
  };
}

export async function getRuntimeStatus(
  tenantId: string,
  tenantAi?: { configured: boolean; label: string },
): Promise<RuntimeStatus> {
  const ai = getAiConfig();
  const whatsapp = await getWhatsAppChannelSummary(tenantId);
  const isDeployed = isDeployedEnvironment();

  return {
    isDeployed,
    environmentLabel: getEnvironmentLabel(),
    releaseLabel: getReleaseLabel(),
    aiConfigured: tenantAi?.configured ?? Boolean(ai),
    aiLabel: tenantAi?.label ?? (ai ? `Modelo local · ${ai.model}` : 'Asistente básico de respaldo'),
    whatsappConfigured: whatsapp.configured,
    whatsappLabel: whatsapp.label,
    persistenceLabel: isDeployed
      ? 'Datos y archivos dedicados por cliente'
      : 'Base local D1 + archivos R2',
    webhookPath: whatsapp.webhookPath,
    webhookUrl: new URL(whatsapp.webhookPath, `${getPublicAppUrl()}/`).toString(),
  };
}
