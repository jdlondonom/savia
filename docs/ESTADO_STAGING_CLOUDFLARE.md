# Estado del staging en Cloudflare

Última actualización: 25 de agosto de 2026, zona horaria `America/Bogota`.

## Alcance

Este ambiente sirve para aceptación técnica y configuración inicial. No es el ambiente de producción, no tiene dominio comercial y no debe recibir información sensible de clientes hasta cerrar todos los controles pendientes.

- Aplicación: [savia-app-staging.jdlondonom.workers.dev](https://savia-app-staging.jdlondonom.workers.dev)
- Salud: [savia-app-staging.jdlondonom.workers.dev/api/health](https://savia-app-staging.jdlondonom.workers.dev/api/health)
- Release desplegada: `57cc2196626fca04fc99fe4bd8d768b4a97eeb2f`

## Inventario activo

| Capa | Recurso | Estado |
|---|---|---|
| Aplicación | `savia-app-staging` | Publicado |
| Eventos | `savia-events-staging` | Publicado; consume la cola |
| Mantenimiento | `savia-maintenance-staging` | Publicado; outbox cada minuto y retención diaria |
| Control | D1 `savia-control-staging` | Migraciones `0001` y `0002` aplicadas |
| Tenant inicial | D1 `savia-tenant-starter-staging` | Migración de tenant aplicada |
| Búsqueda semántica | Vectorize `savia-tenant-starter-staging-v1` | 1536 dimensiones, coseno |
| Mensajería interna | Queue `savia-events-staging` | Activa |
| Errores definitivos | Queue `savia-events-dead-letter-staging` | Activa |
| Serialización | Durable Object `ConversationCoordinator` | Activo |
| Protección pública | Turnstile `Savia staging` | Activo en alta, acceso y recuperación |
| Archivos | R2 `savia-staging-fallback-disabled` | Activo; fallback de seguridad |
| Archivos del tenant inicial | R2 `savia-tenant-starter-staging` | Activo y enlazado a los tres Workers |

Las configuraciones reales de Wrangler contienen IDs de la cuenta, por lo que están excluidas de Git. Los archivos `cloudflare/*.example.jsonc` son la fuente versionada para reconstruirlas.

## Seguridad aplicada

- TLS administrado por Cloudflare y HSTS.
- CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, política de permisos y política de referencia.
- Turnstile configurado con secreto cifrado; su carga y resolución se verificaron en la pantalla de alta.
- Secreto de Better Auth, anillo de llaves maestras y token temporal de bootstrap guardados como secretos de Cloudflare.
- Registro público cerrado e invitaciones privadas.
- MFA TOTP obligatorio antes de acceder a plataforma o tenants.
- Migraciones durante peticiones desactivadas con `SAVIA_ALLOW_RUNTIME_MIGRATIONS=false`.
- Datos de tenant configurados para fallar de forma segura si falta un recurso dedicado.
- Secretos y configuraciones reales excluidos del repositorio.

## Evidencia de validación

- `GET /api/health` respondió HTTP 200 con ambiente `staging` y la release indicada.
- Las cabeceras de seguridad se observaron en la respuesta pública.
- La pantalla `/setup` renderizó el flujo de superadministrador, solicitó el token temporal y completó una comprobación Turnstile válida.
- TypeScript, ESLint, 4 pruebas unitarias, 12 pruebas de arquitectura y el build Vinext finalizaron correctamente.
- Los tres Workers se publicaron correctamente con sus bindings y disparadores.
- Las migraciones remotas crearon 21 tablas de control y 17 tablas del plano de tenant, sin mezclar datos operativos en el plano global.
- El bucket dedicado superó una prueba remota de escritura, lectura íntegra y eliminación; el objeto de diagnóstico fue eliminado.

## Acciones manuales inmediatas

1. Abrir [el alta inicial](https://savia-app-staging.jdlondonom.workers.dev/setup).
2. Crear el primer `superadmin` usando el token temporal entregado por un canal seguro.
3. Registrar el autenticador TOTP y guardar los códigos de recuperación fuera del PC.
4. Confirmar que `/platform` exige MFA y que no vuelve a permitir otra inicialización.
5. Eliminar inmediatamente `SAVIA_BOOTSTRAP_TOKEN` del Worker de aplicación.

El token no debe copiarse a documentación, incidencias, mensajes ni archivos del repositorio.

## Activaciones pendientes antes de probar el servicio completo

### R2 y control de costos

La suscripción R2 fue autorizada y está activa. Cloudflare puede cobrar automáticamente el uso que exceda la franquicia incluida, por lo que debe configurarse seguimiento de consumo y presupuesto antes de incorporar clientes.

- `savia-staging-fallback-disabled` existe únicamente para que una resolución incorrecta falle de forma controlada; no debe almacenar documentos de clientes.
- `savia-tenant-starter-staging` es el bucket dedicado del tenant inicial.
- Ambos bindings están presentes en aplicación, consumidor y mantenimiento.
- La activación de R2 no sustituye el respaldo externo ni la prueba de restauración.

Después de crear el primer tenant desde el panel global se debe registrar y validar `TENANT_STARTER_FILES` en `tenant_resources`, y después probar carga, recuperación, retención y eliminación física de un documento desde la aplicación.

### Integraciones externas

También faltan credenciales o decisiones del propietario para:

- Meta WhatsApp Business, número y webhook;
- modelos LLM y embeddings de cada tenant;
- correo transaccional y dominio remitente;
- dominio comercial y DNS;
- reglas WAF personalizadas y alertas externas;
- respaldo cifrado fuera de la cuenta y prueba de restauración;
- revisión legal, términos, privacidad y contratos aplicables.

## Criterio para pasar a producción

No promover este ambiente directamente. Producción debe usar otros Workers, secretos, D1, R2, Vectorize, colas, Turnstile y dominio. Antes de aceptar producción deben pasar todos los criterios de [RUNBOOK_PRODUCCION.md](RUNBOOK_PRODUCCION.md), incluida restauración, pruebas reales de Meta/IA/correo, aislamiento por tenant, MFA, alertas y revisión de costos.
