# Estado del staging en Cloudflare

Última actualización: 27 de agosto de 2026, zona horaria `America/Bogota`.

## Alcance

Este ambiente sirve para aceptación técnica y configuración inicial. No es el ambiente de producción, no tiene dominio comercial y no debe recibir información sensible de clientes hasta cerrar todos los controles pendientes.

- Aplicación: [savia-app-staging.jdlondonom.workers.dev](https://savia-app-staging.jdlondonom.workers.dev)
- Salud: [savia-app-staging.jdlondonom.workers.dev/api/health](https://savia-app-staging.jdlondonom.workers.dev/api/health)
- Release desplegada: `bf16676e38cc4c03235203a78743291fefe7627b`

## Inventario activo

| Capa | Recurso | Estado |
|---|---|---|
| Aplicación | `savia-app-staging` | Publicado |
| Eventos | `savia-events-staging` | Publicado; consume la cola |
| Mantenimiento | `savia-maintenance-staging` | Publicado; outbox cada minuto, retención y limpieza de sesiones diaria |
| Control | D1 `savia-control-staging` | Migraciones `0001` y `0002` aplicadas |
| Tenant inicial | D1 `savia-tenant-starter-staging` | Migración aplicada; binding `TENANT_STARTER_DB` validado |
| Búsqueda semántica | Vectorize `savia-tenant-starter-staging-v1` | 1536 dimensiones, coseno |
| Mensajería interna | Queue `savia-events-staging` | Activa |
| Errores definitivos | Queue `savia-events-dead-letter-staging` | Activa |
| Serialización | Durable Object `ConversationCoordinator` | Activo |
| Protección pública | Turnstile `Savia staging` | Activo en alta, acceso y recuperación |
| Archivos | R2 `savia-staging-fallback-disabled` | Activo; fallback de seguridad |
| Archivos del tenant inicial | R2 `savia-tenant-starter-staging` | Activo; binding `TENANT_STARTER_FILES` validado |

Las configuraciones reales de Wrangler contienen IDs de la cuenta, por lo que están excluidas de Git. Los archivos `cloudflare/*.example.jsonc` son la fuente versionada para reconstruirlas.

## Seguridad aplicada

- TLS administrado por Cloudflare y HSTS.
- CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, política de permisos y política de referencia.
- Turnstile configurado con secreto cifrado; su carga y resolución se verificaron en la pantalla de alta.
- Secreto de Better Auth y anillo de llaves maestras guardados como secretos de Cloudflare.
- El token temporal de bootstrap fue eliminado después de confirmar el primer superadministrador y su MFA.
- Registro público cerrado e invitaciones privadas.
- MFA TOTP obligatorio antes de acceder a plataforma o tenants.
- Las pestañas abiertas detectan el vencimiento de sesión, regresan al acceso y conservan solo destinos internos seguros.
- La pantalla de acceso explica el vencimiento sin mostrar detalles internos; la pantalla general de error ofrece reautenticación y reintento.
- Migraciones durante peticiones desactivadas con `SAVIA_ALLOW_RUNTIME_MIGRATIONS=false`.
- Datos de tenant configurados para fallar de forma segura si falta un recurso dedicado.
- Secretos y configuraciones reales excluidos del repositorio.

## Evidencia de validación

- Cloudflare confirmó como activas la versión de aplicación `197320dd-d957-41e5-9698-fc7d634c58ef` y la versión de mantenimiento `3e0fdf77-3e74-4492-a7fc-e8f751406337`, ambas publicadas con la release indicada.
- La comprobación HTTPS posterior desde el equipo de desarrollo fue interrumpida por el software de red local antes de recibir respuesta; queda pendiente la aceptación visual desde un navegador independiente.
- Las cabeceras de seguridad se observaron en la respuesta pública.
- El panel global y la configuración del tenant muestran la URL HTTPS pública completa de cada webhook; no exponen `localhost`.
- La interfaz identifica correctamente el ambiente de pruebas, la release y el simulador de WhatsApp pendiente de configurar.
- El primer superadministrador está activo con MFA y `/setup` ya redirige a `/login`.
- TypeScript, ESLint, 10 pruebas unitarias, 14 pruebas de arquitectura y el build Vinext finalizaron correctamente.
- Las pruebas cubren el destino seguro después del acceso, el cálculo de vencimiento, la recuperación en CRM y plataforma y la purga programada sin datos personales en logs.
- El formulario de alta valida en el navegador la longitud y complejidad de la contraseña antes de invocar al servidor.
- El formulario de invitación comparte la misma política de contraseña y la aceptación mantiene separadas las escrituras del plano global y del tenant.
- Los tres Workers se publicaron correctamente con sus bindings y disparadores.
- Las migraciones remotas crearon 21 tablas de control y 17 tablas del plano de tenant, sin mezclar datos operativos en el plano global.
- El bucket dedicado superó una prueba remota de escritura, lectura íntegra y eliminación; el objeto de diagnóstico fue eliminado.
- D1, R2 y Vectorize del tenant inicial fueron comprobados y `tenant_resources` quedó en estado `ready` con los bindings `TENANT_STARTER_DB`, `TENANT_STARTER_FILES` y `TENANT_STARTER_VECTORS`.
- La invitación que expuso el fallo continúa pendiente y no produjo una cuenta parcial; puede reintentarse con el mismo enlace.
- El procedimiento para incorporar una cuenta real de Meta quedó documentado en [MANUAL_USUARIO_WHATSAPP_META.md](MANUAL_USUARIO_WHATSAPP_META.md).

## Inicialización completada

1. Se creó el primer `superadmin`.
2. Se confirmó MFA TOTP obligatorio.
3. Se retiró `SAVIA_BOOTSTRAP_TOKEN` del Worker de aplicación.
4. Se confirmó que el alta inicial queda cerrada y redirige al inicio de sesión.

El token no debe copiarse a documentación, incidencias, mensajes ni archivos del repositorio.

## Activaciones pendientes antes de probar el servicio completo

### R2 y control de costos

La suscripción R2 fue autorizada y está activa. Cloudflare puede cobrar automáticamente el uso que exceda la franquicia incluida, por lo que debe configurarse seguimiento de consumo y presupuesto antes de incorporar clientes.

- `savia-staging-fallback-disabled` existe únicamente para que una resolución incorrecta falle de forma controlada; no debe almacenar documentos de clientes.
- `savia-tenant-starter-staging` es el bucket dedicado del tenant inicial.
- Ambos bindings están presentes en aplicación, consumidor y mantenimiento.
- La activación de R2 no sustituye el respaldo externo ni la prueba de restauración.

Los tres recursos del tenant inicial ya están registrados y validados en `tenant_resources`. Antes de usar documentos reales todavía debe probarse desde la aplicación el ciclo completo de carga, recuperación, retención y eliminación física.

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
