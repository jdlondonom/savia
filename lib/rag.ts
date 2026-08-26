import { cosineSimilarity } from 'ai';
import { embedTenantTexts, getTenantAiRuntime, type TenantAiRuntime } from '@/lib/ai-config';
import {
  getTenantVectorIndex,
  tenantDbAll,
  tenantDbBatch,
  tenantDbFirst,
  tenantDbRun,
} from '@/lib/tenant-database';

export type RetrievedKnowledgeChunk = {
  id: string;
  sourceId: string;
  title: string;
  content: string;
  score: number;
};

type CatalogRow = {
  id: string;
  name: string;
  kind: 'product' | 'service';
  category: string;
  description: string;
  price_cents: number;
  currency: string;
  duration_minutes: number;
  bookable: number;
  keywords: string;
};

type SourceRow = {
  id: string;
  title: string;
  content: string;
};

type ChunkRow = {
  id: string;
  source_id: string;
  title: string;
  content: string;
  embedding_json: string | null;
  vector_id: string | null;
  status: 'pending' | 'ready' | 'failed' | 'stale';
};

const STOP_WORDS = new Set([
  'a', 'al', 'algo', 'con', 'como', 'cual', 'de', 'del', 'el', 'ella', 'en', 'es', 'esta', 'este',
  'gracias', 'hola', 'la', 'las', 'lo', 'los', 'me', 'mi', 'para', 'por', 'que', 'quiero', 'se', 'si',
  'su', 'sus', 'tienen', 'un', 'una', 'y', 'yo',
]);

export async function indexCatalogItem(
  tenantId: string,
  catalogItemId: string,
  reason = 'catalog_updated',
): Promise<{ embedded: boolean; error: string | null }> {
  const item = await tenantDbFirst<CatalogRow>(tenantId,
    `SELECT id, name, kind, category, description, price_cents, currency,
            duration_minutes, bookable, keywords
     FROM catalog_items WHERE tenant_id = ? AND id = ?`,
    tenantId,
    catalogItemId,
  );
  if (!item) throw new Error('El producto o servicio no existe en este tenant.');

  const content = [
    item.name,
    item.category,
    item.description,
    item.keywords,
    item.price_cents > 0 ? `${item.currency} ${(item.price_cents / 100).toFixed(2)}` : '',
    item.duration_minutes > 0 ? `${item.duration_minutes} minutos` : '',
    item.bookable ? 'agendable' : '',
  ].filter(Boolean).join('\n');
  const runtime = await getTenantAiRuntime(tenantId).catch(() => null);
  const previous = await tenantDbFirst<{ vector_id: string | null }>(tenantId,
    'SELECT vector_id FROM catalog_chunks WHERE tenant_id = ? AND catalog_item_id = ?',
    tenantId,
    catalogItemId,
  );
  const vectorIndex = await getTenantVectorIndex(tenantId);
  if (vectorIndex && previous?.vector_id) await vectorIndex.deleteByIds([previous.vector_id]).catch(() => undefined);

  let vector: number[] | null = null;
  let error: string | null = null;
  if (runtime?.embedding) {
    try {
      vector = (await embedTenantTexts(runtime, [content], 'document'))[0] ?? null;
      if (!vector?.length) throw new Error('El proveedor no devolvió el embedding del catálogo.');
    } catch (cause) {
      error = safeError(cause);
    }
  }

  const now = new Date().toISOString();
  const chunkId = `catalog_chunk_${catalogItemId}`;
  const vectorId = `catalog:${catalogItemId}:v${runtime?.configVersion ?? 0}`;
  if (vectorIndex && vector) {
    try {
      await vectorIndex.upsert([{
        id: vectorId,
        values: vector,
        namespace: tenantId,
        metadata: { catalogItemId, chunkId, kind: 'catalog' },
      }]);
    } catch (cause) {
      error = `Vectorize: ${safeError(cause)}`;
    }
  }

  await tenantDbBatch(tenantId, [
    {
      sql: `INSERT INTO catalog_chunks
              (id, tenant_id, catalog_item_id, content, embedding_json, embedding_provider,
               embedding_model, embedding_dimensions, embedding_version, vector_id, status,
               error, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tenant_id, catalog_item_id) DO UPDATE SET
              content = excluded.content,
              embedding_json = excluded.embedding_json,
              embedding_provider = excluded.embedding_provider,
              embedding_model = excluded.embedding_model,
              embedding_dimensions = excluded.embedding_dimensions,
              embedding_version = excluded.embedding_version,
              vector_id = excluded.vector_id,
              status = excluded.status,
              error = excluded.error,
              updated_at = excluded.updated_at`,
      bindings: [
        chunkId,
        tenantId,
        catalogItemId,
        content,
        vector ? JSON.stringify(vector) : null,
        vector && runtime?.embedding ? runtime.embedding.connection.provider : null,
        vector && runtime?.embedding ? runtime.embedding.model : null,
        vector?.length ?? null,
        runtime?.configVersion ?? 0,
        vector && vectorIndex && !error ? vectorId : null,
        error ? 'failed' : 'ready',
        error,
        now,
        now,
      ],
    },
    {
      sql: `INSERT INTO embedding_jobs
              (id, tenant_id, catalog_item_id, reason, status, total_chunks, processed_chunks, error, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      bindings: [
        `ejob_${crypto.randomUUID()}`,
        tenantId,
        catalogItemId,
        reason,
        error ? 'failed' : 'complete',
        vector ? 1 : 0,
        error,
        now,
        now,
      ],
    },
  ]);
  return { embedded: Boolean(vector), error };
}

export async function retrieveCatalogSemanticScores(
  tenantId: string,
  query: string,
  runtime?: TenantAiRuntime | null,
): Promise<Map<string, number>> {
  const effectiveRuntime = runtime === undefined
    ? await getTenantAiRuntime(tenantId).catch(() => null)
    : runtime;
  const scores = new Map<string, number>();
  if (!effectiveRuntime?.embedding || effectiveRuntime.retrievalMode === 'keyword') return scores;

  const queryVector = (await embedTenantTexts(effectiveRuntime, [query], 'query').catch(() => []))[0];
  if (!queryVector) return scores;
  const vectorIndex = await getTenantVectorIndex(tenantId);
  if (vectorIndex) {
    const matches = await vectorIndex.query(queryVector, {
      topK: 20,
      namespace: tenantId,
      returnMetadata: 'all',
      returnValues: false,
      filter: { kind: 'catalog' },
    }).catch(() => null);
    for (const match of matches?.matches ?? []) {
      const itemId = match.metadata?.catalogItemId;
      if (typeof itemId === 'string') scores.set(itemId, Math.max(0, match.score));
    }
    if (scores.size) return scores;
  }

  const chunks = await tenantDbAll<{ catalog_item_id: string; embedding_json: string | null }>(tenantId,
    `SELECT catalog_item_id, embedding_json FROM catalog_chunks
     WHERE tenant_id = ? AND status = 'ready'`,
    tenantId,
  );
  for (const chunk of chunks) {
    const vector = parseEmbedding(chunk.embedding_json);
    if (vector?.length === queryVector.length) {
      scores.set(chunk.catalog_item_id, Math.max(0, cosineSimilarity(queryVector, vector)));
    }
  }
  return scores;
}

export async function indexKnowledgeSource(
  tenantId: string,
  sourceId: string,
  reason = 'source_updated',
): Promise<{ chunks: number; embedded: boolean; error: string | null }> {
  const source = await tenantDbFirst<SourceRow>(tenantId,
    `SELECT id, title, content FROM knowledge_sources
     WHERE tenant_id = ? AND id = ?`,
    tenantId,
    sourceId,
  );
  if (!source) throw new Error('La fuente de conocimiento no existe en este tenant.');

  const chunks = chunkText(source.content);
  const jobId = `ejob_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const previousVectors = await tenantDbAll<{ vector_id: string | null }>(tenantId,
    'SELECT vector_id FROM knowledge_chunks WHERE tenant_id = ? AND source_id = ?',
    tenantId,
    sourceId,
  );
  const vectorIndex = await getTenantVectorIndex(tenantId);
  const previousVectorIds = previousVectors.flatMap((item) => item.vector_id ? [item.vector_id] : []);
  if (vectorIndex && previousVectorIds.length) {
    await vectorIndex.deleteByIds(previousVectorIds).catch(() => undefined);
  }

  await tenantDbBatch(tenantId, [
    {
      sql: `UPDATE knowledge_sources SET status = 'processing', updated_at = ?
            WHERE tenant_id = ? AND id = ?`,
      bindings: [now, tenantId, sourceId],
    },
    {
      sql: `INSERT INTO embedding_jobs
              (id, tenant_id, source_id, reason, status, total_chunks,
               processed_chunks, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'running', ?, 0, ?, ?)`,
      bindings: [jobId, tenantId, sourceId, reason, chunks.length, now, now],
    },
    {
      sql: 'DELETE FROM knowledge_chunks WHERE tenant_id = ? AND source_id = ?',
      bindings: [tenantId, sourceId],
    },
  ]);

  const runtime = await getTenantAiRuntime(tenantId).catch(() => null);
  let embeddings: number[][] | null = null;
  let embeddingError: string | null = null;
  if (runtime?.embedding) {
    try {
      embeddings = await embedInBatches(runtime, chunks.map((chunk) => `${source.title}\n\n${chunk}`));
      assertConsistentDimensions(embeddings, chunks.length);
    } catch (error) {
      embeddingError = safeError(error);
    }
  }

  const chunkIds = chunks.map((_, index) => `chunk_${crypto.randomUUID()}_${index}`);
  const vectorIds = chunks.map((_, index) => `knowledge:${sourceId}:${index}:v${runtime?.configVersion ?? 0}`);
  if (vectorIndex && embeddings) {
    try {
      for (let start = 0; start < embeddings.length; start += 500) {
        await vectorIndex.upsert(embeddings.slice(start, start + 500).map((values, relativeIndex) => {
          const index = start + relativeIndex;
          return {
            id: vectorIds[index],
            values,
            namespace: tenantId,
            metadata: { sourceId, chunkId: chunkIds[index], kind: 'knowledge' },
          };
        }));
      }
    } catch (error) {
      embeddingError = `Vectorize: ${safeError(error)}`;
    }
  }

  const indexedAt = new Date().toISOString();
  const statements = chunks.map((content, index) => {
    const vector = embeddings?.[index] ?? null;
    return {
      sql: `INSERT INTO knowledge_chunks
              (id, tenant_id, source_id, chunk_index, content, token_estimate,
               embedding_json, embedding_provider, embedding_model,
                embedding_dimensions, embedding_version, vector_id, status, error,
                created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bindings: [
        chunkIds[index],
        tenantId,
        sourceId,
        index,
        content,
        Math.ceil(content.length / 4),
        vector ? JSON.stringify(vector) : null,
        vector && runtime?.embedding ? runtime.embedding.connection.provider : null,
        vector && runtime?.embedding ? runtime.embedding.model : null,
        vector?.length ?? null,
        runtime?.configVersion ?? 0,
        vector && vectorIndex && !embeddingError ? vectorIds[index] : null,
        embeddingError ? 'failed' : 'ready',
        embeddingError,
        indexedAt,
        indexedAt,
      ],
    };
  });
  for (let start = 0; start < statements.length; start += 40) {
    await tenantDbBatch(tenantId, statements.slice(start, start + 40));
  }
  await tenantDbBatch(tenantId, [
    {
      sql: `UPDATE knowledge_sources SET status = 'ready', updated_at = ?
            WHERE tenant_id = ? AND id = ?`,
      bindings: [indexedAt, tenantId, sourceId],
    },
    {
      sql: `UPDATE embedding_jobs SET status = ?, processed_chunks = ?, error = ?, updated_at = ?
            WHERE id = ? AND tenant_id = ?`,
      bindings: [embeddingError ? 'failed' : 'complete', embeddings?.length ?? 0, embeddingError, indexedAt, jobId, tenantId],
    },
  ]);

  return { chunks: chunks.length, embedded: Boolean(embeddings), error: embeddingError };
}

export async function reindexTenantKnowledge(tenantId: string, reason: string): Promise<void> {
  const sources = await tenantDbAll<{ id: string }>(tenantId,
    'SELECT id FROM knowledge_sources WHERE tenant_id = ? ORDER BY created_at',
    tenantId,
  );
  for (const source of sources) {
    await indexKnowledgeSource(tenantId, source.id, reason).catch(async (error) => {
      const now = new Date().toISOString();
      await tenantDbRun(tenantId,
        `UPDATE knowledge_sources SET status = 'ready', updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
        now,
        tenantId,
        source.id,
      ).catch(() => undefined);
      await tenantDbRun(tenantId,
        `INSERT INTO embedding_jobs
          (id, tenant_id, source_id, reason, status, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)`,
        `ejob_${crypto.randomUUID()}`,
        tenantId,
        source.id,
        reason,
        safeError(error),
        now,
        now,
      ).catch(() => undefined);
    });
  }
}

export async function reindexTenantCatalog(tenantId: string, reason: string): Promise<void> {
  const items = await tenantDbAll<{ id: string }>(tenantId,
    'SELECT id FROM catalog_items WHERE tenant_id = ? AND active = 1 ORDER BY created_at',
    tenantId,
  );
  for (const item of items) await indexCatalogItem(tenantId, item.id, reason).catch(() => undefined);
}

export async function retrieveKnowledgeChunks(
  tenantId: string,
  query: string,
  runtime?: TenantAiRuntime | null,
  limit = 5,
): Promise<RetrievedKnowledgeChunk[]> {
  const effectiveRuntime = runtime === undefined
    ? await getTenantAiRuntime(tenantId).catch(() => null)
    : runtime;
  let rows = await tenantDbAll<ChunkRow>(tenantId,
    `SELECT c.id, c.source_id, s.title, c.content, c.embedding_json, c.vector_id, c.status
     FROM knowledge_chunks c
     JOIN knowledge_sources s ON s.tenant_id = c.tenant_id AND s.id = c.source_id
     WHERE c.tenant_id = ? AND s.status = 'ready'`,
    tenantId,
  );

  if (!rows.length) {
    const sources = await tenantDbAll<SourceRow>(tenantId,
      `SELECT id, title, content FROM knowledge_sources
       WHERE tenant_id = ? AND status = 'ready'`,
      tenantId,
    );
    rows = sources.flatMap((source) => chunkText(source.content).map((content, index) => ({
      id: `${source.id}:temporary:${index}`,
      source_id: source.id,
      title: source.title,
      content,
      embedding_json: null,
      vector_id: null,
      status: 'ready' as const,
    })));
  }

  const queryTokens = tokenize(query);
  const mode = effectiveRuntime?.retrievalMode ?? 'keyword';
  let queryEmbedding: number[] | null = null;
  if (mode !== 'keyword' && effectiveRuntime?.embedding) {
    try {
      queryEmbedding = (await embedTenantTexts(effectiveRuntime, [query], 'query'))[0] ?? null;
    } catch {
      queryEmbedding = null;
    }
  }

  const vectorScores = new Map<string, number>();
  if (queryEmbedding) {
    const vectorIndex = await getTenantVectorIndex(tenantId);
    if (vectorIndex) {
      const matches = await vectorIndex.query(queryEmbedding, {
        topK: Math.max(limit * 4, 12),
        namespace: tenantId,
        returnMetadata: false,
        returnValues: false,
      }).catch(() => null);
      for (const match of matches?.matches ?? []) vectorScores.set(match.id, match.score);
    }
  }

  const broadPolicyIntent = /horario|reserva|reservar|cita|agenda|cancelar|reprogramar|politica|política/i.test(query);
  const scored = rows.map((row) => {
    const rawKeyword = scoreTokens(queryTokens, tokenize(row.title), 4)
      + scoreTokens(queryTokens, tokenize(row.content), 1)
      + (broadPolicyIntent ? 0.5 : 0);
    const keywordScore = rawKeyword <= 0 ? 0 : 1 - Math.exp(-rawKeyword / 5);
    const storedEmbedding = row.status === 'ready' ? parseEmbedding(row.embedding_json) : null;
    const vectorScore = row.vector_id ? vectorScores.get(row.vector_id) : undefined;
    const semanticAvailable = vectorScore !== undefined
      || Boolean(queryEmbedding && storedEmbedding && queryEmbedding.length === storedEmbedding.length);
    const semanticScore = vectorScore !== undefined
      ? Math.max(0, vectorScore)
      : semanticAvailable && queryEmbedding && storedEmbedding
        ? Math.max(0, cosineSimilarity(queryEmbedding, storedEmbedding))
        : 0;
    const score = mode === 'semantic' && semanticAvailable
      ? semanticScore
      : mode === 'hybrid' && semanticAvailable
        ? semanticScore * 0.72 + keywordScore * 0.28
        : keywordScore;
    return {
      id: row.id,
      sourceId: row.source_id,
      title: row.title,
      content: row.content,
      score,
    };
  }).filter((item) => item.score > 0.02).sort((left, right) => right.score - left.score);

  const selected: RetrievedKnowledgeChunk[] = [];
  const perSource = new Map<string, number>();
  for (const item of scored) {
    if ((perSource.get(item.sourceId) ?? 0) >= 2) continue;
    selected.push(item);
    perSource.set(item.sourceId, (perSource.get(item.sourceId) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function chunkText(value: string, targetSize = 950, overlap = 140): string[] {
  const text = value.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
  if (!text) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + targetSize);
    if (end < text.length) {
      const searchStart = Math.min(end, start + Math.floor(targetSize * 0.65));
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const sentenceBreak = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf('? ', end), text.lastIndexOf('! ', end));
      const wordBreak = text.lastIndexOf(' ', end);
      const preferred = [paragraphBreak, sentenceBreak >= 0 ? sentenceBreak + 1 : -1, wordBreak]
        .find((position) => position >= searchStart);
      if (preferred !== undefined) end = preferred;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

async function embedInBatches(runtime: TenantAiRuntime, values: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < values.length; start += 24) {
    const batch = values.slice(start, start + 24);
    vectors.push(...await embedTenantTexts(runtime, batch, 'document'));
  }
  return vectors;
}

function assertConsistentDimensions(vectors: number[][], expectedCount: number): void {
  if (vectors.length !== expectedCount) throw new Error('El proveedor devolvió una cantidad inesperada de vectores.');
  const dimensions = vectors[0]?.length ?? 0;
  if (!dimensions || vectors.some((vector) => vector.length !== dimensions)) {
    throw new Error('El proveedor devolvió embeddings con dimensiones inconsistentes.');
  }
}

function parseEmbedding(value: string | null): number[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'number' && Number.isFinite(item))
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function tokenize(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

function scoreTokens(query: Set<string>, candidate: Set<string>, weight: number): number {
  let score = 0;
  for (const token of query) if (candidate.has(token)) score += weight;
  return score;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'No fue posible generar embeddings.';
  return message.replace(/sk-[A-Za-z0-9_-]+/g, '[credencial]').slice(0, 500);
}
