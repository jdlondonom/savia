# Runbook de preparación y puesta en producción

Este documento gobierna la preparación de staging y la publicación futura de producción. El staging inicial se ejecutó parcialmente el 25 de agosto de 2026; su estado y pendientes se registran en [ESTADO_STAGING_CLOUDFLARE.md](ESTADO_STAGING_CLOUDFLARE.md). **Producción no ha sido publicada.**

## 1. Condiciones de entrada

Antes de publicar:

- dominio y cuenta empresarial de Cloudflare;
- plan que cubra Workers, D1, R2, Vectorize, Queues y Durable Objects;
- Meta Business verificado y número de prueba;
- proveedor de correo con dominio validado;
- proveedor(es) de IA y presupuesto;
- política de privacidad, términos y acuerdos con subencargados;
- destino externo para respaldos;
- al menos dos superadministradores designados;
- responsable de incidentes y alertas.

## 2. Crear ambientes independientes

Crear staging primero. Producción solo continúa después de una aceptación completa.

Por ambiente:

1. D1 de control.
2. Queue de eventos y Queue DLQ.
3. Worker de aplicación.
4. Worker consumidor.
5. Worker de mantenimiento.
6. dominio, DNS, TLS, Turnstile y WAF.
7. recursos dedicados de cada tenant.

Usa como base las plantillas de `cloudflare/`; cópialas a archivos sin el sufijo `.example` y reemplaza todos los marcadores. Esos archivos reales no deben incluir secretos.

## 3. Plano de control

Crear el D1 global y aplicar, en orden:

```powershell
pnpm wrangler d1 execute <CONTROL_DB> --remote --file=migrations/control/0001_control_plane.sql
pnpm wrangler d1 execute <CONTROL_DB> --remote --file=migrations/control/0002_production_control_plane.sql
```

La línea base no crea contactos, mensajes, documentos ni agenda. `0002` agrega recursos, canal, cuotas, correo, retención e idempotencia.

Validar que las migraciones se ejecutaron una única vez y registrar su versión en el cambio operativo.

## 4. Alta de cada tenant

Para cada cliente:

1. Crear un D1 dedicado.
2. Ejecutar `migrations/tenant/0001_data_plane.sql`.
3. Crear un bucket R2 dedicado.
4. Crear un índice Vectorize dedicado con métrica y dimensiones compatibles con su modelo.
5. Agregar los tres bindings a aplicación, consumidor y mantenimiento.
6. Registrar esos nombres en `tenant_resources` desde el panel global.
7. Ejecutar la validación del recurso y exigir estado `ready`.
8. Crear/invitar al `owner`.
9. Configurar IA, cuotas, retención y WhatsApp.

Si cambia la dimensión del modelo de embeddings, crear un índice Vectorize nuevo, actualizar el binding/recurso y después reindexar. Un índice existente no debe recibir vectores de otra dimensión.

## 5. Secretos

Crear secretos independientes para staging y producción:

- `BETTER_AUTH_SECRET`;
- `SAVIA_BOOTSTRAP_TOKEN`;
- `SAVIA_MASTER_KEYS_JSON`;
- `SAVIA_ACTIVE_MASTER_KEY_ID`;
- `TURNSTILE_SECRET_KEY`.

La site key de Turnstile puede ser variable pública; las demás no. Las llaves de IA, Meta y correo se introducen en el panel y quedan cifradas, no como variables de frontend.

Ejemplo de carga manual futura:

```powershell
pnpm wrangler secret put BETTER_AUTH_SECRET --config <archivo-real>
pnpm wrangler secret put SAVIA_BOOTSTRAP_TOKEN --config <archivo-real>
pnpm wrangler secret put SAVIA_MASTER_KEYS_JSON --config <archivo-real>
pnpm wrangler secret put SAVIA_ACTIVE_MASTER_KEY_ID --config <archivo-real>
pnpm wrangler secret put TURNSTILE_SECRET_KEY --config <archivo-real>
```

Nunca pases secretos como argumentos visibles ni los guardes en scripts.

`SAVIA_BOOTSTRAP_TOKEN` debe ser aleatorio, tener al menos 32 caracteres y utilizarse únicamente para crear el primer `superadmin`. Al terminar el alta y comprobar MFA, elimínalo del Worker. La aplicación rechaza el setup productivo si el token no existe o no coincide.

## 6. Validación previa

Sobre el código:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:load
pnpm build
node scripts/assert-production-config.mjs <archivo-real-de-produccion>
```

Sobre staging:

- salud HTTP 200;
- setup solo disponible cuando corresponde;
- login, MFA, logout y recuperación;
- invitación y acceso restringido a un tenant;
- rechazo cross-tenant;
- prueba de LLM y embeddings;
- indexación de documento y catálogo;
- cuota agotada transfiere a humano;
- webhook con challenge y firma;
- idempotencia del mismo evento;
- salida, estados, reintento y DLQ;
- republicación del outbox pendiente y reconciliación de cualquier mensaje detenido en `sending`;
- reserva concurrente sin solapamiento;
- exportación, anonimización y retención;
- headers de seguridad;
- respaldo y restauración.

## 7. Orden de publicación

Cuando exista autorización:

1. Aprobar cambio y ventana.
2. Confirmar respaldo recuperable.
3. Aplicar migraciones compatibles hacia adelante.
4. Publicar consumidor y mantenimiento.
5. Publicar aplicación.
6. Ejecutar smoke tests.
7. Configurar/activar webhook de Meta.
8. Aumentar tráfico progresivamente.
9. Vigilar errores, latencia, cola y costos.
10. Cerrar cambio con evidencia.

Nunca se publican migraciones destructivas y código dependiente en el mismo paso sin una estrategia expand/contract.

## 8. WAF y límites

Configurar al menos:

- rate limit por IP/cuenta para `/api/auth/*`;
- límites más estrictos para login, recuperación y setup;
- protección de `/api/webhooks/whatsapp/*` sin bloquear IPs legítimas de Meta por reglas genéricas;
- bloqueo de métodos inesperados;
- reglas administradas y alertas por picos;
- acceso administrativo restringido según el modelo operativo.

Los límites de aplicación por tenant complementan, no sustituyen, los límites perimetrales.

Savia usa `cf-connecting-ip` para los límites de Better Auth fuera del ambiente local. El origen productivo debe permanecer detrás de Cloudflare y no aceptar una ruta alternativa donde un cliente pueda inyectar esa cabecera.

## 9. Monitoreo

Alertas mínimas:

- tasa de 5xx y latencia;
- fallos de autenticación anómalos;
- webhook rechazado o sin eventos;
- backlog y DLQ;
- errores de envío a Meta;
- fallos/latencia de IA;
- consumo por tenant y presupuesto;
- errores de D1/R2/Vectorize;
- resultado de mantenimiento y respaldo;
- expiración de dominio o integraciones.

Los logs deben usar IDs técnicos y nunca cuerpos de mensajes o llaves.

## 10. Respaldo

`scripts/backup-cloudflare.ps1` espera un catálogo real basado en `cloudflare/tenants.production.example.json` y un token de mínimo privilegio.

Procedimiento:

1. exportar D1 de control y todos los D1 de tenant;
2. cifrar y copiar fuera de la cuenta principal;
3. replicar cada R2 por API S3 a un destino independiente;
4. conservar código, migraciones y anillo de llaves;
5. verificar checksums;
6. restaurar una muestra periódicamente.

No se considera exitoso un respaldo que nunca se ha restaurado.

## 11. Rollback

Si falla la publicación:

- desactivar tráfico o volver a la versión anterior del Worker;
- conservar consumidores compatibles con eventos ya en cola;
- no revertir una migración destructivamente;
- detener Meta temporalmente solo si duplicados o respuestas incorrectas agravan el incidente;
- mantener mensajes en Queue/DLQ;
- validar datos antes de reanudar.

El esquema debe evolucionar de forma compatible para permitir rollback de código.

## 12. Criterio de salida

Producción queda aceptada solo si:

- todos los tenants muestran recursos dedicados `ready`;
- no existen datos demo;
- MFA, correo, Meta, IA y recuperación pasaron;
- aislamiento y reservas concurrentes pasaron;
- WAF, alertas, cuotas y DLQ están activos;
- respaldo/restauración están documentados;
- privacidad y contratos están aprobados;
- existe un responsable de guardia.
