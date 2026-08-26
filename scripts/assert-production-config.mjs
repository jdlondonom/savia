import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) throw new Error('Uso: node scripts/assert-production-config.mjs <wrangler.jsonc>');
const contents = await readFile(file, 'utf8');
const failures = [];
if (/REPLACE_|example\.com|EXAMPLE/.test(contents)) failures.push('quedan marcadores de ejemplo');
if (!/"SAVIA_ENVIRONMENT"\s*:\s*"production"/.test(contents)) failures.push('SAVIA_ENVIRONMENT no es production');
if (!/"SAVIA_REQUIRE_DEDICATED_TENANT_DATA"\s*:\s*"true"/.test(contents)) failures.push('el aislamiento físico no es obligatorio');
if (!/"SAVIA_ALLOW_RUNTIME_MIGRATIONS"\s*:\s*"false"/.test(contents)) failures.push('las migraciones en runtime no están desactivadas');
if (!/"APP_URL"\s*:\s*"https:\/\//.test(contents)) failures.push('APP_URL no usa HTTPS');
if (!/"binding"\s*:\s*"DB"/.test(contents)) failures.push('falta D1 del plano de control');
if (!/"binding"\s*:\s*"TENANT_[A-Z0-9_]+_DB"/.test(contents)) failures.push('falta D1 dedicado de tenant');
if (!/"binding"\s*:\s*"TENANT_[A-Z0-9_]+_FILES"/.test(contents)) failures.push('falta R2 dedicado de tenant');
if (!/"binding"\s*:\s*"TENANT_[A-Z0-9_]+_VECTORS"/.test(contents)) failures.push('falta Vectorize dedicado de tenant');
if (!/"binding"\s*:\s*"SAVIA_EVENTS"/.test(contents)) failures.push('falta la cola de eventos');
if (!/"main"\s*:\s*"\.\.\/dist\/server\/index\.js"/.test(contents)) failures.push('la aplicación no apunta al artefacto compilado');
if (!/"directory"\s*:\s*"\.\.\/dist\/client"/.test(contents)) failures.push('faltan los recursos estáticos compilados');
if (!/"no_bundle"\s*:\s*true/.test(contents)) failures.push('el artefacto Vinext debe publicarse sin un segundo bundle');
if (failures.length) {
  throw new Error(`Configuración no apta para producción: ${failures.join('; ')}.`);
}
console.log('Configuración de producción validada.');
