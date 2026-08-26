import { env } from 'cloudflare:workers';
import { dbFirst, dbRun, ensureDatabase, getDatabase } from '@/lib/database';
import { allowsRuntimeMigrations, requiresDedicatedTenantData } from '@/lib/environment';
import { TENANT_SCHEMA_STATEMENTS } from '@/lib/tenant-schema';

export type TenantIsolationMode = 'shared_local' | 'dedicated';
export type TenantProvisioningStatus = 'local' | 'pending' | 'ready' | 'error';

export type TenantResources = {
  tenantId: string;
  isolationMode: TenantIsolationMode;
  databaseBinding: string | null;
  filesBinding: string | null;
  vectorBinding: string | null;
  provisioningStatus: TenantProvisioningStatus;
  lastError: string | null;
};

type ResourceRow = {
  tenant_id: string;
  isolation_mode: TenantIsolationMode;
  database_binding: string | null;
  files_binding: string | null;
  vector_binding: string | null;
  provisioning_status: TenantProvisioningStatus;
  last_error: string | null;
};

const schemaInitialization = new WeakMap<object, Promise<void>>();

function dynamicBinding<T>(name: string | null): T | null {
  if (!name) return null;
  return ((env as unknown as Record<string, unknown>)[name] as T | undefined) ?? null;
}

export async function getTenantResources(tenantId: string): Promise<TenantResources> {
  await ensureDatabase();
  let row = await dbFirst<ResourceRow>(
    `SELECT tenant_id, isolation_mode, database_binding, files_binding, vector_binding,
            provisioning_status, last_error
     FROM tenant_resources WHERE tenant_id = ?`,
    tenantId,
  );

  if (!row) {
    if (requiresDedicatedTenantData()) {
      throw new Error(`El tenant ${tenantId} no tiene un registro de recursos dedicados.`);
    }
    const now = new Date().toISOString();
    await dbRun(
      `INSERT INTO tenant_resources
       (tenant_id, isolation_mode, provisioning_status, created_at, updated_at)
       VALUES (?, 'shared_local', 'local', ?, ?)`,
      tenantId,
      now,
      now,
    );
    row = {
      tenant_id: tenantId,
      isolation_mode: 'shared_local',
      database_binding: null,
      files_binding: null,
      vector_binding: null,
      provisioning_status: 'local',
      last_error: null,
    };
  }

  return {
    tenantId: row.tenant_id,
    isolationMode: row.isolation_mode,
    databaseBinding: row.database_binding,
    filesBinding: row.files_binding,
    vectorBinding: row.vector_binding,
    provisioningStatus: row.provisioning_status,
    lastError: row.last_error,
  };
}

export async function getTenantDatabase(tenantId: string): Promise<D1Database> {
  const resources = await getTenantResources(tenantId);
  const dedicated = resources.isolationMode === 'dedicated'
    ? dynamicBinding<D1Database>(resources.databaseBinding)
    : null;

  if (resources.isolationMode === 'dedicated' && resources.provisioningStatus === 'ready' && dedicated) {
    await ensureTenantSchema(dedicated);
    return dedicated;
  }

  if (requiresDedicatedTenantData()) {
    throw new Error(
      `El plano de datos del cliente ${tenantId} no está aprovisionado en recursos dedicados.`,
    );
  }

  const shared = getDatabase();
  await ensureTenantSchema(shared);
  return shared;
}

export async function getTenantFiles(tenantId: string): Promise<R2Bucket> {
  const resources = await getTenantResources(tenantId);
  const dedicated = resources.isolationMode === 'dedicated'
    ? dynamicBinding<R2Bucket>(resources.filesBinding)
    : null;
  if (resources.isolationMode === 'dedicated' && resources.provisioningStatus === 'ready' && dedicated) {
    return dedicated;
  }
  if (requiresDedicatedTenantData()) {
    throw new Error(`El almacenamiento dedicado del cliente ${tenantId} no está disponible.`);
  }
  if (!env.FILES) throw new Error('El almacenamiento local FILES no está disponible.');
  return env.FILES;
}

export async function getTenantVectorIndex(tenantId: string): Promise<VectorizeIndex | null> {
  const resources = await getTenantResources(tenantId);
  const index = dynamicBinding<VectorizeIndex>(resources.vectorBinding);
  if (requiresDedicatedTenantData()) {
    if (
      resources.isolationMode !== 'dedicated'
      || resources.provisioningStatus !== 'ready'
      || !resources.vectorBinding
      || !index
    ) {
      throw new Error(`El índice vectorial dedicado del cliente ${tenantId} no está disponible.`);
    }
  }
  return index;
}

export async function validateDedicatedTenantResources(tenantId: string): Promise<void> {
  const resources = await getTenantResources(tenantId);
  if (resources.isolationMode !== 'dedicated') throw new Error('El tenant no está configurado en modo dedicado.');
  const database = dynamicBinding<D1Database>(resources.databaseBinding);
  const files = dynamicBinding<R2Bucket>(resources.filesBinding);
  const vectors = dynamicBinding<VectorizeIndex>(resources.vectorBinding);
  if (!database || !files || !vectors) {
    throw new Error('Falta enlazar D1, R2 o Vectorize en el entorno de ejecución antes de validar.');
  }
  await database.prepare('SELECT 1 FROM contacts LIMIT 1').first();
  await files.list({ limit: 1 });
  await vectors.describe();
}

export async function tenantDbAll<T>(tenantId: string, sql: string, ...bindings: unknown[]): Promise<T[]> {
  const result = await (await getTenantDatabase(tenantId)).prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

export async function tenantDbFirst<T>(tenantId: string, sql: string, ...bindings: unknown[]): Promise<T | null> {
  return (await getTenantDatabase(tenantId)).prepare(sql).bind(...bindings).first<T>();
}

export async function tenantDbRun(tenantId: string, sql: string, ...bindings: unknown[]): Promise<D1Result<unknown>> {
  return (await getTenantDatabase(tenantId)).prepare(sql).bind(...bindings).run();
}

export async function tenantDbBatch(
  tenantId: string,
  items: Array<{ sql: string; bindings?: unknown[] }>,
): Promise<D1Result<unknown>[]> {
  const database = await getTenantDatabase(tenantId);
  return database.batch(items.map((item) => database.prepare(item.sql).bind(...(item.bindings ?? []))));
}

async function ensureTenantSchema(database: D1Database): Promise<void> {
  const key = database as unknown as object;
  let pending = schemaInitialization.get(key);
  if (pending) return pending;

  pending = (async () => {
    const allowRuntimeMigrations = allowsRuntimeMigrations();
    if (allowRuntimeMigrations) {
      await database.batch(TENANT_SCHEMA_STATEMENTS.map((statement) => database.prepare(statement)));
      await ensureTenantColumn(database, 'knowledge_chunks', 'vector_id', 'TEXT');
      await ensureTenantColumn(database, 'embedding_jobs', 'catalog_item_id', 'TEXT');
      return;
    }
    await database.prepare('SELECT 1 FROM contacts LIMIT 1').first();
  })().catch((error) => {
    schemaInitialization.delete(key);
    throw error;
  });
  schemaInitialization.set(key, pending);
  return pending;
}

async function ensureTenantColumn(
  database: D1Database,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if ((columns.results ?? []).some((item) => item.name === column)) return;
  await database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}
