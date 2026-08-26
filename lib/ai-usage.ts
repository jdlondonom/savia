import { dbFirst } from '@/lib/database';
import { tenantDbFirst } from '@/lib/tenant-database';

type LimitsRow = {
  daily_request_limit: number;
  monthly_token_limit: number;
  monthly_cost_limit_cents: number;
};

type UsageRow = {
  daily_requests: number;
  monthly_tokens: number;
  monthly_cost_cents: number;
};

export type AiQuotaState = {
  allowed: boolean;
  reason: 'daily_requests' | 'monthly_tokens' | 'monthly_cost' | null;
  limits: {
    dailyRequests: number;
    monthlyTokens: number;
    monthlyCostCents: number;
  };
  usage: {
    dailyRequests: number;
    monthlyTokens: number;
    monthlyCostCents: number;
  };
};

export async function getTenantAiQuotaState(tenantId: string): Promise<AiQuotaState> {
  const [limits, usage] = await Promise.all([
    dbFirst<LimitsRow>(
      `SELECT daily_request_limit, monthly_token_limit, monthly_cost_limit_cents
       FROM tenant_ai_settings WHERE tenant_id = ?`,
      tenantId,
    ),
    tenantDbFirst<UsageRow>(tenantId,
      `SELECT
         SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS daily_requests,
         COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
                           THEN COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) ELSE 0 END), 0) AS monthly_tokens,
         COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
                           THEN COALESCE(estimated_cost_cents, 0) ELSE 0 END), 0) AS monthly_cost_cents
       FROM ai_generations WHERE tenant_id = ?`,
      tenantId,
    ),
  ]);

  const normalizedLimits = {
    dailyRequests: Math.max(1, Number(limits?.daily_request_limit ?? 500)),
    monthlyTokens: Math.max(1, Number(limits?.monthly_token_limit ?? 1_000_000)),
    monthlyCostCents: Math.max(1, Number(limits?.monthly_cost_limit_cents ?? 5_000)),
  };
  const normalizedUsage = {
    dailyRequests: Number(usage?.daily_requests ?? 0),
    monthlyTokens: Number(usage?.monthly_tokens ?? 0),
    monthlyCostCents: Number(usage?.monthly_cost_cents ?? 0),
  };
  const reason = normalizedUsage.dailyRequests >= normalizedLimits.dailyRequests
    ? 'daily_requests'
    : normalizedUsage.monthlyTokens >= normalizedLimits.monthlyTokens
      ? 'monthly_tokens'
      : normalizedUsage.monthlyCostCents >= normalizedLimits.monthlyCostCents
        ? 'monthly_cost'
        : null;

  return { allowed: !reason, reason, limits: normalizedLimits, usage: normalizedUsage };
}

export async function estimateTenantGenerationCostCents(
  tenantId: string,
  inputTokens: number | null,
  outputTokens: number | null,
): Promise<number | null> {
  if (inputTokens === null && outputTokens === null) return null;
  const rates = await dbFirst<{
    input_cost_cents_per_million: number;
    output_cost_cents_per_million: number;
  }>(
    `SELECT input_cost_cents_per_million, output_cost_cents_per_million
     FROM tenant_ai_settings WHERE tenant_id = ?`,
    tenantId,
  );
  if (!rates) return 0;
  const exact = ((inputTokens ?? 0) * Number(rates.input_cost_cents_per_million)
    + (outputTokens ?? 0) * Number(rates.output_cost_cents_per_million)) / 1_000_000;
  return Math.max(0, Math.ceil(exact));
}
