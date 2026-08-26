import 'server-only';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany, type LanguageModel } from 'ai';
import { dbFirst } from '@/lib/database';
import type { AiProvider, AiPurpose } from '@/lib/platform';
import { decryptSecret } from '@/lib/secrets';

export type AiConnectionRuntime = {
  id: string;
  name: string;
  provider: AiProvider;
  purpose: AiPurpose;
  baseUrl: string | null;
  apiKey: string | null;
};

export type TenantModelRuntime = {
  connection: AiConnectionRuntime;
  model: string;
};

export type TenantAiRuntime = {
  tenantId: string;
  llm: TenantModelRuntime | null;
  fallbackLlm: TenantModelRuntime | null;
  embedding: TenantModelRuntime | null;
  temperature: number;
  maxOutputTokens: number;
  embeddingDimensions: number | null;
  retrievalMode: 'keyword' | 'semantic' | 'hybrid';
  configVersion: number;
};

type SettingsRow = {
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
  retrieval_mode: TenantAiRuntime['retrievalMode'];
  config_version: number;
};

type ConnectionRow = {
  id: string;
  name: string;
  provider: AiProvider;
  purpose: AiPurpose;
  base_url: string | null;
  encrypted_api_key: string | null;
};

export async function getTenantAiRuntime(tenantId: string): Promise<TenantAiRuntime | null> {
  const settings = await dbFirst<SettingsRow>(
    `SELECT tenant_id, llm_connection_id, llm_model, llm_temperature_milli,
            llm_max_tokens, llm_fallback_connection_id, llm_fallback_model,
            embedding_connection_id, embedding_model, embedding_dimensions,
            retrieval_mode, config_version
     FROM tenant_ai_settings WHERE tenant_id = ?`,
    tenantId,
  );
  if (!settings) return null;

  const [llmConnection, fallbackConnection, embeddingConnection] = await Promise.all([
    loadConnection(settings.llm_connection_id),
    loadConnection(settings.llm_fallback_connection_id),
    loadConnection(settings.embedding_connection_id),
  ]);

  return {
    tenantId,
    llm: llmConnection && settings.llm_model
      ? { connection: llmConnection, model: settings.llm_model }
      : null,
    fallbackLlm: fallbackConnection && settings.llm_fallback_model
      ? { connection: fallbackConnection, model: settings.llm_fallback_model }
      : null,
    embedding: embeddingConnection && settings.embedding_model
      ? { connection: embeddingConnection, model: settings.embedding_model }
      : null,
    temperature: Math.max(0, Math.min(2, Number(settings.llm_temperature_milli) / 1_000)),
    maxOutputTokens: Math.max(64, Math.min(8_192, Number(settings.llm_max_tokens))),
    embeddingDimensions: settings.embedding_dimensions === null ? null : Number(settings.embedding_dimensions),
    retrievalMode: settings.retrieval_mode,
    configVersion: Number(settings.config_version),
  };
}

export function createTenantLanguageModel(runtime: TenantModelRuntime): LanguageModel {
  const { connection, model } = runtime;
  const apiKey = connection.apiKey || undefined;
  const baseURL = connection.baseUrl || undefined;

  switch (connection.provider) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL })(model);
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL })(model);
    case 'huggingface':
      return createOpenAICompatible({
        name: 'huggingface',
        baseURL: connection.baseUrl || 'https://router.huggingface.co/v1',
        apiKey,
      }).chatModel(model);
    case 'openai_compatible':
      if (!connection.baseUrl) throw new Error('La conexión compatible con OpenAI necesita una URL base.');
      return createOpenAICompatible({
        name: `compatible-${safeProviderName(connection.id)}`,
        baseURL: connection.baseUrl,
        apiKey,
      }).chatModel(model);
    case 'voyage':
      throw new Error('Voyage no puede utilizarse como LLM.');
  }
}

export async function embedTenantTexts(
  runtime: TenantAiRuntime,
  values: string[],
  inputType: 'query' | 'document',
): Promise<number[][]> {
  if (!runtime.embedding) throw new Error('El tenant no tiene embeddings configurados.');
  if (values.length === 0) return [];
  const { connection, model } = runtime.embedding;

  switch (connection.provider) {
    case 'openai': {
      const provider = createOpenAI({
        apiKey: connection.apiKey || undefined,
        baseURL: connection.baseUrl || undefined,
      });
      const result = await embedMany({
        model: provider.embeddingModel(model),
        values,
        maxParallelCalls: 2,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(30_000),
        providerOptions: runtime.embeddingDimensions
          ? { openai: { dimensions: runtime.embeddingDimensions } }
          : undefined,
      });
      return result.embeddings.map(normalizeVector);
    }
    case 'openai_compatible': {
      if (!connection.baseUrl) throw new Error('La conexión compatible necesita una URL base.');
      const provider = createOpenAICompatible({
        name: `compatible-${safeProviderName(connection.id)}`,
        baseURL: connection.baseUrl,
        apiKey: connection.apiKey || undefined,
      });
      const result = await embedMany({
        model: provider.embeddingModel(model),
        values,
        maxParallelCalls: 2,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(30_000),
      });
      return result.embeddings.map(normalizeVector);
    }
    case 'huggingface':
      return embedWithHuggingFace(connection, model, values);
    case 'voyage':
      return embedWithVoyage(connection, model, values, inputType, runtime.embeddingDimensions);
    case 'anthropic':
      throw new Error('Anthropic no ofrece embeddings en esta integración.');
  }
}

export async function getTenantAiStatus(tenantId: string): Promise<{
  configured: boolean;
  label: string;
}> {
  const row = await dbFirst<{ provider: AiProvider | null; model: string | null }>(
    `SELECT c.provider, s.llm_model AS model
     FROM tenant_ai_settings s
     LEFT JOIN ai_provider_connections c ON c.id = s.llm_connection_id AND c.status = 'active'
     WHERE s.tenant_id = ?`,
    tenantId,
  );
  if (!row?.provider || !row.model) return { configured: false, label: 'Motor RAG local de respaldo' };
  return { configured: true, label: `${providerDisplayName(row.provider)} · ${row.model}` };
}

async function loadConnection(connectionId: string | null): Promise<AiConnectionRuntime | null> {
  if (!connectionId) return null;
  const row = await dbFirst<ConnectionRow>(
    `SELECT id, name, provider, purpose, base_url, encrypted_api_key
     FROM ai_provider_connections WHERE id = ? AND status = 'active'`,
    connectionId,
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    purpose: row.purpose,
    baseUrl: row.base_url,
    apiKey: await decryptSecret(row.encrypted_api_key),
  };
}

async function embedWithHuggingFace(
  connection: AiConnectionRuntime,
  model: string,
  values: string[],
): Promise<number[][]> {
  if (!connection.apiKey) throw new Error('La conexión de Hugging Face no tiene llave API.');
  const base = connection.baseUrl || 'https://router.huggingface.co/hf-inference/models';
  const url = huggingFaceModelUrl(base, model);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: values.length === 1 ? values[0] : values,
      options: { wait_for_model: true },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw providerHttpError('Hugging Face', response.status);
  return parseHuggingFaceEmbeddings(await response.json(), values.length);
}

async function embedWithVoyage(
  connection: AiConnectionRuntime,
  model: string,
  values: string[],
  inputType: 'query' | 'document',
  dimensions: number | null,
): Promise<number[][]> {
  if (!connection.apiKey) throw new Error('La conexión de Voyage no tiene llave API.');
  const base = (connection.baseUrl || 'https://api.voyageai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: values,
      model,
      input_type: inputType,
      ...(dimensions ? { output_dimension: dimensions } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw providerHttpError('Voyage', response.status);
  const payload = await response.json() as {
    data?: Array<{ index?: number; embedding?: number[] }>;
  };
  const vectors = (payload.data ?? [])
    .slice()
    .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
    .map((item) => item.embedding)
    .filter((item): item is number[] => Array.isArray(item));
  if (vectors.length !== values.length) throw new Error('Voyage devolvió una cantidad inesperada de embeddings.');
  return vectors.map(normalizeVector);
}

function parseHuggingFaceEmbeddings(payload: unknown, expected: number): number[][] {
  if (!Array.isArray(payload)) throw new Error('Hugging Face devolvió un formato de embeddings inválido.');
  if (payload.every(isNumber)) {
    if (expected !== 1) throw new Error('Hugging Face devolvió menos embeddings de los esperados.');
    return [normalizeVector(payload)];
  }

  if (expected === 1 && payload.every(isNumberArray)) {
    if (payload.length === 1) return [normalizeVector(payload[0])];
    return [normalizeVector(meanVectors(payload))];
  }

  if (payload.length === expected) {
    const vectors = payload.map((item) => {
      if (isNumberArray(item)) return normalizeVector(item);
      if (Array.isArray(item) && item.every(isNumberArray)) return normalizeVector(meanVectors(item));
      throw new Error('Hugging Face devolvió un embedding inválido.');
    });
    return vectors;
  }
  throw new Error('Hugging Face devolvió una cantidad inesperada de embeddings.');
}

function meanVectors(vectors: number[][]): number[] {
  if (!vectors.length) throw new Error('El proveedor devolvió un vector vacío.');
  const dimensions = vectors[0].length;
  if (!dimensions || vectors.some((vector) => vector.length !== dimensions)) {
    throw new Error('El proveedor devolvió vectores con dimensiones inconsistentes.');
  }
  return Array.from({ length: dimensions }, (_, index) => (
    vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length
  ));
}

function normalizeVector(vector: number[]): number[] {
  if (!vector.length || vector.some((value) => !Number.isFinite(value))) {
    throw new Error('El proveedor devolvió un vector inválido.');
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) throw new Error('El proveedor devolvió un vector sin magnitud.');
  return vector.map((value) => value / magnitude);
}

function huggingFaceModelUrl(base: string, model: string): string {
  const cleanBase = base.replace(/\/$/, '');
  const encodedModel = model.split('/').map(encodeURIComponent).join('/');
  if (cleanBase.includes('{model}')) return cleanBase.replace('{model}', encodedModel);
  if (/\/models\/[A-Za-z0-9_.%/-]+$/.test(cleanBase)) return cleanBase;
  if (cleanBase.endsWith('/models')) return `${cleanBase}/${encodedModel}`;
  return `${cleanBase}/models/${encodedModel}`;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isNumber);
}

function providerHttpError(provider: string, status: number): Error {
  return new Error(`${provider} rechazó la solicitud (HTTP ${status}).`);
}

function safeProviderName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'savia';
}

function providerDisplayName(provider: AiProvider): string {
  return {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    huggingface: 'Hugging Face',
    voyage: 'Voyage',
    openai_compatible: 'Compatible OpenAI',
  }[provider];
}
