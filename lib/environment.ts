import { env } from 'cloudflare:workers';

const LOCAL_APP_URL = 'http://localhost:3000';

export function isDeployedEnvironment(): boolean {
  return (env.SAVIA_ENVIRONMENT ?? 'local') !== 'local';
}

export function getPublicAppUrl(): string {
  const configured = env.APP_URL?.trim() || env.BETTER_AUTH_URL?.trim();
  if (!configured) {
    if (isDeployedEnvironment()) {
      throw new Error('APP_URL es obligatorio para publicar enlaces externos de Savia.');
    }
    return LOCAL_APP_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('APP_URL debe ser una URL absoluta válida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('APP_URL debe utilizar HTTP o HTTPS.');
  }
  if (isDeployedEnvironment() && parsed.protocol !== 'https:') {
    throw new Error('APP_URL debe utilizar HTTPS fuera del entorno local.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('APP_URL no puede incluir credenciales, parámetros ni fragmentos.');
  }
  return parsed.origin;
}

export function getEnvironmentLabel(): string {
  switch (env.SAVIA_ENVIRONMENT ?? 'local') {
    case 'production':
      return 'Producción';
    case 'staging':
      return 'Ambiente de pruebas en Cloudflare';
    default:
      return 'Prototipo local';
  }
}

export function getReleaseLabel(): string {
  const release = env.SAVIA_RELEASE?.trim();
  return release ? `Versión ${release.slice(0, 7)}` : 'Desarrollo sin publicar';
}

export function allowsRuntimeMigrations(): boolean {
  const configured = env.SAVIA_ALLOW_RUNTIME_MIGRATIONS?.trim();
  if (configured !== undefined && configured !== '') return configured === 'true';
  return !isDeployedEnvironment();
}

export function requiresDedicatedTenantData(): boolean {
  return env.SAVIA_REQUIRE_DEDICATED_TENANT_DATA === 'true' || isDeployedEnvironment();
}
