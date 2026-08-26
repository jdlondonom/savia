# Arquitectura de producción de Savia

## Decisión recomendada

Para la primera etapa comercial, la recomendación es alojar Savia en Cloudflare con servicios administrados y mantener integraciones externas directas:

- Workers para la aplicación y API;
- D1 de control + un D1 por tenant;
- un bucket R2 por tenant;
- un índice Vectorize por tenant;
- Queues con DLQ para WhatsApp y trabajos asíncronos;
- Durable Objects para serializar eventos por conversación;
- Cron Triggers para retención;
- Turnstile y WAF para protección;
- observabilidad y alertas;
- Meta WhatsApp Cloud API, proveedores de IA y Resend/Postmark como servicios externos.

Cloudflare sí sirve como plataforma principal, pero no reemplaza Meta, los modelos de IA ni el correo transaccional.

## Topología

```text
Usuarios y Meta
      │
      ▼
Cloudflare DNS / TLS / WAF / Turnstile
      │
      ▼
Worker de Savia ───────────────► D1 de control
      │                           identidades, MFA, tenants,
      │                           membresías, secretos y recursos
      │
      ├── tenant A ─────────────► D1 A + R2 A + Vectorize A
      ├── tenant B ─────────────► D1 B + R2 B + Vectorize B
      └── tenant N ─────────────► D1 N + R2 N + Vectorize N
      │
      ▼
Queue de eventos ─► Durable Object ─► WhatsApp / IA
      │
      └────────────► DLQ + alertas

Cron de mantenimiento ─► retención por tenant
Respaldo externo      ◄── exportaciones D1 + réplica de R2
```

## Separación de ambientes

| Recurso | Local | Staging | Producción |
|---|---|---|---|
| Dominio | localhost | subdominio de pruebas | dominio comercial |
| Plano de control | D1/R2 emulado | recursos Cloudflare propios | recursos Cloudflare propios |
| Tenant data | fallback local | D1/R2/Vectorize dedicados | D1/R2/Vectorize dedicados |
| Meta | simulador o número de prueba | app/número de prueba | app/número productivo |
| IA | opcional/prueba | llaves y cuotas de prueba | llaves y cuotas productivas |
| Secretos | `.dev.vars` | secretos de staging | secretos de producción |

No se comparten bases, buckets, índices, colas, apps de Meta ni llaves entre staging y producción.

## Flujo de una conversación

1. Meta llama la URL única del tenant.
2. El Worker resuelve la configuración por clave opaca.
3. Verifica challenge o HMAC y valida el número.
4. Registra idempotencia en el plano de control.
5. Publica el evento en Queue.
6. Durable Object ordena los eventos de ese tenant y teléfono.
7. El consumidor escribe en el D1 dedicado.
8. Si el chat está en IA, recupera catálogo/documentos del tenant.
9. Comprueba cuota, genera o degrada a respuesta determinista.
10. Persiste la salida y su evento de outbox en una sola transacción.
11. El publicador entrega el evento a Queue y el consumidor reclama el mensaje antes de llamar a Meta.
12. Los fallos transitorios se reintentan; los definitivos pasan a DLQ y los estados ambiguos quedan señalados para reconciliación, evitando reenvíos ciegos.

## Aislamiento y escalamiento

La asignación inicial mediante bindings dedicados es adecuada para una cartera pequeña o mediana y ofrece separación clara. Cada alta productiva requiere aprovisionar recursos, aplicar migraciones, registrar bindings y validar desde el panel global.

Antes de alcanzar los límites operativos de bindings o cuando el alta de tenants deba ser totalmente automática, se debe evolucionar a uno de estos patrones:

- Worker por tenant administrado mediante Cloudflare for Platforms;
- grupos de tenants por servicio, manteniendo recursos de datos dedicados;
- servicio de aprovisionamiento que genere configuración, migraciones y despliegues controlados.

No se recomienda volver a una única base compartida para simplificar ese crecimiento si la promesa comercial es aislamiento físico.

## Disponibilidad

Para una oferta 24/7:

- ejecutar al menos la aplicación, colas y mantenimiento en infraestructura administrada;
- evitar trabajos largos en la petición HTTP;
- usar reintentos con backoff y DLQ;
- monitorear errores, latencia, backlog, cuotas y webhooks;
- definir objetivos SLO y ventanas de mantenimiento;
- mantener un procedimiento de degradación a humano;
- probar recuperación y restauración periódicamente.

Un PC es adecuado para desarrollo, no para compromisos de disponibilidad.

## Datos y residencia

La elección de Cloudflare no equivale automáticamente a cumplir requisitos de residencia o sector. Antes de contratar clientes regulados se debe comprobar:

- ubicaciones y compromisos vigentes de D1, R2, Vectorize y logs;
- transferencias internacionales de Meta, proveedores de IA y correo;
- DPA, subencargados y retención de cada proveedor;
- cifrado, respaldo y eliminación verificable;
- necesidades de salud, finanzas, menores u otros datos sensibles.

Si un cliente exige una región física específica que la plataforma no puede garantizar, su plano de datos debe alojarse en un proveedor/región compatible aunque el frontend continúe en Cloudflare.

## Seguridad perimetral sugerida

- TLS administrado y redirección HTTPS.
- HSTS después de validar dominios.
- WAF administrado y reglas contra rutas anómalas.
- Rate limiting estricto para login, recuperación, setup y webhooks.
- Turnstile en autenticación y recuperación.
- Bloqueo o Access para endpoints administrativos internos cuando aplique.
- CSP, anti-framing, `nosniff`, política de referer y permisos mínimos.
- Tokens de Cloudflare con privilegio mínimo y rotación.
- Sin secretos en variables públicas, repositorio, logs ni CI.

## Servicios externos

| Servicio | Obligatorio | Función |
|---|---:|---|
| Cloudflare | Para esta arquitectura | Cómputo, datos, red y seguridad |
| Meta WhatsApp Business | Para WhatsApp real | Canal de mensajería |
| OpenAI/Anthropic/Hugging Face/Voyage u otro | Al menos uno para IA real | LLM y/o embeddings |
| Resend o Postmark | Recomendado | Invitaciones y recuperación |
| Almacenamiento de respaldo independiente | Sí para recuperación robusta | Copia fuera de la cuenta principal |
| Monitoreo/alertas externas | Recomendado | Detectar caídas aunque Cloudflare falle |

## Lo que ya está listo y lo que no

Listo en el código:

- separación de planos y fallo cerrado en producción;
- esquemas y migraciones;
- Queue, DLQ, Durable Object y mantenimiento;
- configuración por tenant;
- seguridad, cuotas, privacidad y observabilidad;
- plantillas de staging/producción.

Desplegado en staging el 25 de agosto de 2026:

- Workers de aplicación, eventos y mantenimiento;
- D1 de control y D1 inicial de tenant con migraciones;
- Vectorize, Queue, DLQ y Durable Object;
- secretos de plataforma cifrados y Turnstile activo;
- endpoint público de salud, observabilidad y tareas programadas.

Pendiente:

- activación de R2 y creación de buckets dedicados;
- alta del primer superadministrador y comprobación manual del MFA;
- configuración de Meta y proveedores;
- pruebas pagadas/reales;
- dominio comercial, producción, reglas WAF personalizadas y alertas;
- prueba de restauración con recursos reales.

Staging no equivale a aceptación de producción. El detalle operativo está en [ESTADO_STAGING_CLOUDFLARE.md](ESTADO_STAGING_CLOUDFLARE.md).
