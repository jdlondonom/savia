# Plantillas de Cloudflare

Los archivos de esta carpeta son referencias revisables; no están vinculados a una cuenta y no despliegan Savia.

| Archivo | Uso |
|---|---|
| `wrangler.app.staging.example.jsonc` | Aplicación de staging |
| `wrangler.events.staging.example.jsonc` | Consumidor, DLQ y Durable Object de staging |
| `wrangler.maintenance.staging.example.jsonc` | Limpieza programada de staging |
| `wrangler.app.production.example.jsonc` | Aplicación de producción |
| `wrangler.events.production.example.jsonc` | Consumidor, DLQ y Durable Object |
| `wrangler.maintenance.production.example.jsonc` | Limpieza programada |
| `tenants.production.example.json` | Catálogo de respaldo |

## Reglas

- No reemplazar los `.example` con IDs reales dentro de Git.
- Crear configuraciones reales protegidas por `.gitignore` o gestionarlas en CI.
- Declarar los bindings dedicados de todos los tenants en app, consumidor y mantenimiento.
- Mantener `SAVIA_REQUIRE_DEDICATED_TENANT_DATA=true`.
- Mantener `SAVIA_ALLOW_RUNTIME_MIGRATIONS=false`.
- Ejecutar `scripts/assert-production-config.mjs` antes de publicar.
- Ejecutar `pnpm build` antes de usar las plantillas de aplicación: el artefacto esperado es `dist/server/index.js` y los recursos estáticos quedan en `dist/client`.
- Guardar secretos con el mecanismo de secretos de Cloudflare.
- Tratar staging como un entorno público: token de arranque, secreto de autenticación fuerte, aislamiento físico y migraciones previas al despliegue.
- No usar estas plantillas como evidencia de que un despliegue ya existe.

## Workers

- La aplicación produce eventos en `SAVIA_EVENTS`.
- `workers/events-consumer.ts` consume, reintenta y usa `ConversationCoordinator`.
- `workers/maintenance.ts` republica el outbox pendiente cada minuto y aplica retención diariamente.
- La DLQ debe tener monitoreo y un procedimiento de replay manual seguro.

Consulta [el runbook](../docs/RUNBOOK_PRODUCCION.md) para el orden completo. Cualquier publicación requiere una instrucción directa del propietario.
