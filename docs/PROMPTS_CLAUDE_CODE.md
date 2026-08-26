# Prompts de Savia para Claude Code

Estos prompts sirven para continuar el proyecto con mínima intervención. La autoridad más reciente del propietario siempre prevalece. Claude debe leer antes `README.md`, `docs/DOCUMENTACION_SERVICIO.md`, `docs/ARQUITECTURA_PRODUCCION.md`, `docs/SEGURIDAD_Y_PRIVACIDAD.md` y el código afectado.

## 1. Prompt maestro de mantenimiento autónomo

```text
Actúa como responsable técnico de Savia, una plataforma multitenant de atención por WhatsApp con IA/RAG, CRM y agenda.

Trabaja de forma autónoma dentro del repositorio actual. Inspecciona primero el estado real, conserva cambios ajenos y no reemplaces secretos. Implementa por completo la solicitud, añade o actualiza migraciones y pruebas cuando corresponda, corrige regresiones y documenta la operación.

Invariantes obligatorias:
- En producción existen dos planos: D1 global de control y D1/R2/Vectorize dedicados por tenant.
- Producción debe fallar cerrada si faltan recursos dedicados; nunca uses silenciosamente DB o FILES globales como fallback.
- Toda operación de negocio deriva el tenant desde una sesión/membresía o desde una configuración global autorizada.
- Toda consulta y relación operativa conserva tenant_id como defensa adicional.
- Solo superadmin puede modificar proveedores, modelos, embeddings, cuotas, recursos, WhatsApp, correo, retención o bóveda.
- MFA TOTP es obligatorio; el registro público permanece cerrado.
- No serialices llaves, tokens, cuerpos personales ni prompts completos en logs.
- Verifica HMAC de WhatsApp antes de interpretar el JSON.
- Conserva idempotencia, Queue/DLQ, outbox y orden por conversación.
- Evita solapamientos de agenda mediante appointment_slots atómicos.
- Respeta exportación, anonimización, retención y auditoría.
- No inventes precios, políticas, diagnósticos, horarios, descuentos ni disponibilidad.
- No hardcodees modelos ni tarifas; son parámetros del tenant.
- No publiques ni despliegues sin una instrucción directa que diga explícitamente que se autoriza publicar.

Calidad de cierre:
1. pnpm typecheck
2. pnpm lint sin errores ni advertencias
3. pnpm test
4. pnpm build
5. prueba HTTP local cuando cambien rutas o interfaz
6. revisión de aislamiento, autorización y secretos

Entrega un resumen de cambios, validaciones y cualquier activación externa pendiente. No declares éxito si una prueba requerida falla.
```

## 2. Prompt para una funcionalidad nueva

```text
Implementa la siguiente funcionalidad en Savia: <DESCRIBIR>.

Antes de editar, traza el flujo completo navegador → acción/API → plano de control o D1 del tenant → integración → respuesta. Define explícitamente qué rol puede usarla y si sus datos pertenecen al plano global o al tenant.

Incluye estados de carga, éxito, vacío y error; validación en servidor; auditoría; idempotencia si hay efectos externos; migración compatible hacia adelante; pruebas válidas y cross-tenant; y documentación operativa. Si usa IA, registra trazabilidad, cuota y fallback. Si usa un proveedor externo, cifra credenciales y no hagas llamadas pagadas sin autorización/credenciales.

No cambies la arquitectura de aislamiento ni despliegues. Ejecuta la verificación completa y corrige hasta dejarla limpia.
```

## 3. Prompt de revisión de seguridad

```text
Audita Savia sin modificar inicialmente. Busca evidencia concreta de:
- rutas o acciones sin sesión, MFA o rol;
- IDOR/cross-tenant en D1, R2 o Vectorize;
- uso del plano global para datos operativos en producción;
- webhooks que parsean antes de validar firma;
- replay, carreras, dobles reservas o eventos duplicados;
- SSRF por base_url;
- secretos en cliente, Git, errores o logs;
- recuperación reutilizable o sesiones que sobreviven a un reset;
- prompt injection o datos no confiables tratados como instrucciones;
- bypass de cuotas/costos;
- eliminación/retención incompleta;
- migraciones irreproducibles;
- dependencia de runtime migrations en producción.

Clasifica por impacto y probabilidad con archivo/línea. Corrige únicamente hallazgos confirmados si la solicitud incluye corrección. Añade pruebas de regresión y ejecuta typecheck, lint, test, build y smoke local. No publiques.
```

## 4. Prompt de preparación de un tenant productivo

```text
Prepara, pero no publiques, el tenant <NOMBRE/SLUG> para Savia.

Genera un inventario de recursos dedicados: D1, R2, Vectorize y bindings para aplicación, consumidor y mantenimiento. Valida que las dimensiones de Vectorize coincidan con el modelo de embeddings. Prepara las entradas de tenant_resources, configuración de cuotas/retención y checklist de Meta, correo, WAF, alertas y respaldo.

No incluyas valores secretos en archivos. No ejecutes wrangler deploy, cambios de DNS, webhooks de Meta ni llamadas pagadas. Deja comandos revisables y una lista exacta de aprobaciones necesarias.
```

## 5. Prompt de despliegue autorizado

Usar solo cuando el propietario haya autorizado explícitamente publicar:

```text
Está autorizado desplegar Savia en <STAGING/PRODUCCIÓN> usando los recursos ya aprobados.

Sigue docs/RUNBOOK_PRODUCCION.md. Antes de mutar, verifica identidad de cuenta, dominio, nombres/IDs exactos, respaldo, migraciones pendientes y ausencia de marcadores REPLACE. Ejecuta primero las pruebas locales y el validador de configuración. Publica en orden compatible, realiza smoke tests, verifica aislamiento, MFA, webhook, Queue/DLQ y observabilidad. Detente ante cualquier discrepancia de cuenta, recurso o secreto.

No amplíes el alcance a otro ambiente. No habilites tráfico o Meta si las pruebas fallan. Documenta IDs de despliegue, resultado, rollback y evidencia sin exponer secretos.
```
