import { env } from 'cloudflare:workers';

export function isDeployedEnvironment(): boolean {
  return (env.SAVIA_ENVIRONMENT ?? 'local') !== 'local';
}

export function allowsRuntimeMigrations(): boolean {
  const configured = env.SAVIA_ALLOW_RUNTIME_MIGRATIONS?.trim();
  if (configured !== undefined && configured !== '') return configured === 'true';
  return !isDeployedEnvironment();
}

export function requiresDedicatedTenantData(): boolean {
  return env.SAVIA_REQUIRE_DEDICATED_TENANT_DATA === 'true' || isDeployedEnvironment();
}
