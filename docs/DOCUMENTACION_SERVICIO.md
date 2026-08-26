# Documentación del servicio Savia

## 1. Propósito y estado

Savia es una plataforma SaaS multitenant para atención comercial por WhatsApp con IA, RAG, CRM y agenda. La aplicación está funcional en local y dispone de un ambiente público de staging en Cloudflare para aceptación técnica.

Estado de esta entrega:

- ejecución local persistente en el PC;
- staging publicado en `savia-app-staging.jdlondonom.workers.dev`;
- Workers de aplicación, eventos y mantenimiento desplegados por separado;
- D1 de control y de tenant, R2, Vectorize, Queue, DLQ, Durable Object y Turnstile activos;
- arquitectura y plantillas separadas para staging y producción;
- bucket R2 de seguridad y bucket R2 dedicado para el tenant inicial, enlazados a los tres Workers;
- integraciones de Meta, IA y correo listas para recibir credenciales externas;
- producción, dominio comercial, WAF personalizado, alertas y respaldo externo todavía pendientes.

El inventario verificable y las limitaciones actuales están en [ESTADO_STAGING_CLOUDFLARE.md](ESTADO_STAGING_CLOUDFLARE.md).

## 2. Funcionalidades

| Área | Funcionalidad |
|---|---|
| Conversaciones | Historial, no leídos, IA/humano, asignación y respuesta manual |
| CRM | Contactos, etapas, notas y seguimiento |
| Agenda | Horarios por zona, bloqueos, duración, estados y exclusión atómica |
| Catálogo | Productos/servicios, precio, categoría, duración y disponibilidad |
| Conocimiento | Texto y archivos TXT, MD, CSV o JSON de hasta 1 MB |
| RAG | Catálogo + documentos; recuperación keyword, semantic o hybrid |
| IA | LLM principal/respaldo, embeddings independientes, trazabilidad y cuotas |
| Canales | WhatsApp por tenant, firma HMAC, idempotencia, cola y estados |
| Acceso | Invitaciones, roles, MFA obligatorio, recuperación y revocación |
| Plataforma | Tenants, recursos, IA, WhatsApp, correo, retención y auditoría |
| Privacidad | Exportación, anonimización y limpieza por retención |
| Continuidad | Respuesta determinista cuando un proveedor de IA no está disponible |

## 3. Marca

- Nombre: **Savia**.
- Lema: **Conversaciones que hacen crecer**.
- Símbolo: hoja joven integrada con una burbuja de conversación.
- Paleta: bosque `#123D31`, hoja `#D8F45F`, marfil `#F6F7F2`, salvia `#B9DED3` y texto `#172720`.

Los recursos están en `public/` y la guía en [MARCA.md](MARCA.md).

## 4. Arquitectura

Savia separa dos planos:

### Plano de control

Contiene:

- usuarios, sesiones, MFA y verificaciones;
- roles globales, membresías e invitaciones;
- tenants y asignación de recursos;
- conexiones de IA, WhatsApp y correo cifradas;
- cuotas, retención, idempotencia de integraciones y auditoría global.

### Plano de datos del tenant

Cada tenant contiene:

- contactos, conversaciones, mensajes y generaciones;
- catálogo y vectores de catálogo;
- documentos, fragmentos, embeddings y trabajos de indexación;
- reservas, slots y bloqueos;
- auditoría del tenant, solicitudes de privacidad y outbox.

En local, los planos comparten el emulador D1/R2 para facilitar el desarrollo. En producción, `SAVIA_REQUIRE_DEDICATED_TENANT_DATA=true` obliga a resolver D1, R2 y Vectorize dedicados por tenant. Si falta un binding o no coincide con el registro de control, la operación falla cerrada.

Tecnología principal:

- TypeScript estricto, React 19 y Next.js App Router sobre Vinext/Vite;
- Better Auth para credenciales, sesiones y MFA;
- Cloudflare D1, R2, Vectorize, Queues, Durable Objects y Workers;
- Vercel AI SDK para generación;
- Web Crypto para AES-GCM, HMAC y hashing;
- migraciones SQL separadas por plano.

## 5. Autenticación y autorización

### Alta

- El primer `superadmin` solo puede crearse una única vez: desde localhost en desarrollo y con `SAVIA_BOOTSTRAP_TOKEN` en producción.
- El registro público está cerrado.
- Las cuentas posteriores nacen de invitaciones privadas, con token hasheado, vencimiento y un solo uso.
- Las contraseñas exigen 12–128 caracteres, letras, número y símbolo también en el servidor.

### MFA

- TOTP es obligatorio para todas las cuentas.
- Se entregan códigos de recuperación.
- Los intentos fallidos activan bloqueo temporal.
- No se usan dispositivos confiables que omitan el segundo factor.
- Recuperar contraseña o MFA revoca las sesiones vigentes.

### Roles

| Ámbito | Rol | Facultades |
|---|---|---|
| Global | `superadmin` | Administración completa del servicio |
| Global | `support` | Consulta global sin cambios |
| Tenant | `owner` | Operación, configuración, catálogo, conocimiento y privacidad |
| Tenant | `admin` | Administración operativa del tenant |
| Tenant | `advisor` | Conversaciones, CRM y agenda |

Las acciones vuelven a comprobar sesión, MFA, usuario activo, rol y tenant en el servidor. El navegador no decide la autorización.

## 6. Invariantes multitenant

1. El tenant efectivo proviene de una membresía autorizada o de una acción global autenticada.
2. Toda entidad operativa conserva `tenant_id`, aun dentro de una base dedicada.
3. Las lecturas y mutaciones filtran por tenant y validan relaciones cruzadas.
4. Los archivos usan un prefijo de tenant y una fuente autorizada.
5. D1, R2 y Vectorize se resuelven desde `tenant_resources`.
6. Los vectores se guardan además con namespace de tenant.
7. Cada `phone_number_id` y cada clave de webhook son únicos.
8. Producción no cae silenciosamente al almacenamiento compartido.

Esta defensa en profundidad reduce tanto accesos horizontales como errores de configuración.

## 7. IA, cuotas y RAG

### Proveedores

| Proveedor | LLM | Embeddings |
|---|---:|---:|
| OpenAI | Sí | Sí |
| Anthropic | Sí | No |
| Hugging Face | Sí | Sí |
| Voyage | No | Sí |
| Compatible OpenAI | Sí | Sí |

Solo el `superadmin` administra conexiones, modelos y límites. Una asignación por tenant incluye LLM principal/respaldo, temperatura, máximo de tokens, embeddings, dimensiones, modo de recuperación y versión.

### Indexación

1. Se valida contenido y pertenencia.
2. Se fragmenta la fuente.
3. Se persiste un trabajo de indexación.
4. Se generan embeddings cuando están configurados.
5. Se escribe en Vectorize o, en local, en D1.
6. Se registra proveedor, modelo, dimensiones y versión.

El catálogo usa el mismo principio mediante `catalog_chunks`. Cambiar embeddings marca datos anteriores como obsoletos y reindexa únicamente ese tenant.

### Generación

1. Se comprueba la cuota antes de llamar a un proveedor.
2. Se recuperan hechos del catálogo y documentos.
3. Se crea una generación `pending`.
4. Se intenta el modelo principal y luego el respaldo.
5. Si ambos fallan, se usa una respuesta determinista.
6. Se guardan fuentes, tokens, costo estimado, estado y modelo.

El prompt trata el conocimiento como datos y prohíbe inventar precios, políticas, diagnósticos, descuentos, horarios o disponibilidad.

### Límites

Se admiten límites por solicitudes diarias, tokens mensuales y costo mensual estimado. Las tarifas de entrada/salida son configurables por tenant para evitar depender de precios hardcodeados. Cuando una cuota se agota, el chat pasa a modo humano.

## 8. WhatsApp

Cada tenant tiene una configuración cifrada y una URL única:

`/api/webhooks/whatsapp/<webhook_key>`

Para el alta guiada de una cuenta real, consulte el [manual para conectar WhatsApp Business con Meta](MANUAL_USUARIO_WHATSAPP_META.md). Está escrito para usuarios sin conocimientos técnicos y separa las tareas del cliente de las reservadas al superadministrador global.

Entrada:

1. se localiza la configuración por una clave opaca;
2. se verifica el challenge o la firma `x-hub-signature-256`;
3. solo después se interpreta el JSON;
4. se valida `phone_number_id`;
5. se registra un hash de payload para idempotencia;
6. el evento se encola cuando `SAVIA_EVENTS` está disponible;
7. un Durable Object serializa eventos de la misma conversación;
8. se actualizan contacto, conversación, respuesta y estados.

Salida:

- los mensajes usan un outbox;
- mensaje y evento de outbox se guardan en una sola transacción;
- el mantenimiento republica cada minuto los eventos aún no entregados a Queue;
- el consumidor reclama el mensaje como `sending` antes de invocar Meta para evitar reenvíos ciegos;
- el consumidor reintenta fallos transitorios;
- después del máximo de intentos, el evento llega a una DLQ;
- los estados `sent`, `delivered`, `read` y `failed` se vinculan a mensaje y tenant.

La ruta global sin clave responde como deshabilitada. En local, si no existe cola, el procesamiento ocurre en segundo plano dentro de la petición.

## 9. Agenda

- La zona horaria pertenece al tenant.
- El horario semanal se configura por día.
- Los bloqueos admiten intervalos cerrados.
- Cada reserva ocupa slots UTC de 15 minutos.
- Una operación por lote inserta todos los slots con restricción única, impidiendo solapamientos aun con solicitudes concurrentes.
- Cancelar libera slots; reactivar vuelve a adquirirlos.

No se incluye sincronización con Google Calendar o Microsoft 365 en esta versión.

## 10. Privacidad, retención y auditoría

- Exportación autenticada del tenant o un contacto en JSON.
- Anonimización irreversible de datos personales, conservando relaciones y trazabilidad comercial.
- Política separada para mensajes, documentos y auditoría.
- Worker programado para republicación del outbox y limpieza.
- Limpieza de mensajes, documentos, generaciones de IA y eventos de outbox vencidos.
- Eliminación del objeto R2 cuando expira un documento.
- Auditoría de acciones globales y del tenant.
- Logs estructurados sin cuerpos de mensajes ni secretos.

Antes de utilizar datos reales, el responsable del servicio debe definir fundamento legal, avisos, encargados, tiempos y procedimiento de derechos aplicable a su jurisdicción.

## 11. Bóveda y correo

Las credenciales se cifran con AES-256-GCM. Se soportan:

- sobre legado `v1` con `SAVIA_MASTER_KEY`;
- anillo `SAVIA_MASTER_KEYS_JSON`;
- llave activa `SAVIA_ACTIVE_MASTER_KEY_ID`;
- rotación de conexiones IA, WhatsApp y correo desde el panel.

Las llaves maestras solo viven como secretos del entorno. Perderlas impide descifrar las credenciales.

El correo transaccional usa Resend o Postmark y sirve para invitaciones, recuperación de contraseña y pruebas operativas.

## 12. Rutas principales

| Método | Ruta | Protección | Uso |
|---|---|---|---|
| GET | `/setup` | Localhost y primer uso | Crear superadmin |
| GET | `/login` | Pública + Turnstile opcional | Inicio de sesión |
| GET | `/forgot-password` | Pública + Turnstile opcional | Solicitar recuperación |
| GET | `/reset-password` | Token temporal | Cambiar contraseña |
| GET | `/mfa`, `/mfa-enroll` | Flujo autenticado | Segundo factor |
| GET | `/invite/:token` | Invitación válida | Activar cuenta |
| GET | `/` | Sesión + MFA + tenant | CRM |
| GET | `/platform` | Rol global + MFA | Administración global |
| GET | `/generations/:id` | Tenant autorizado | Trazabilidad IA |
| GET | `/api/health` | Pública | Salud, ambiente y versión |
| POST | `/api/demo/inbound` | Sesión + MFA, no producción | Simulador |
| GET/POST | `/api/webhooks/whatsapp/:key` | Token/HMAC de Meta | WhatsApp |
| GET | `/api/privacy/export` | Owner/admin + MFA | Exportación |
| GET/POST | `/api/auth/*` | Better Auth | Identidad |

## 13. Persistencia y migraciones

- `migrations/control/0001_control_plane.sql`: línea base de identidad, acceso, tenants e IA del plano global.
- `migrations/control/0002_production_control_plane.sql`: recursos, canal, correo, idempotencia, cuotas y retención.
- `migrations/tenant/0001_data_plane.sql`: esquema operativo de cada tenant.
- `drizzle/`: línea base histórica del prototipo local.
- `ensureDatabase()`: compatibilidad y siembra del ambiente local.

En producción, las migraciones se ejecutan de forma explícita antes de publicar código y `SAVIA_ALLOW_RUNTIME_MIGRATIONS=false`. La aplicación solo verifica la disponibilidad del esquema.

## 14. Continuidad y observabilidad

- Endpoint de salud sin datos sensibles.
- Logs JSON con evento, nivel, ambiente, release y metadatos permitidos.
- Cloudflare observability habilitable en plantillas.
- Queue + DLQ para integración.
- Respuesta determinista para degradación de IA.
- Respaldos D1 exportables y R2 sincronizable a almacenamiento separado.

La recuperación completa exige probar restauraciones y conservar secretos, bases y objetos de manera coherente.

## 15. Alcance pendiente de activación externa

El código no puede completar sin cuentas del propietario:

- verificación y configuración de Meta WhatsApp Business;
- llaves/modelos de IA;
- dominio remitente y llave de Resend o Postmark;
- dominio comercial y ambiente de producción en Cloudflare;
- reglas WAF personalizadas, alertas y destino externo de respaldo;
- revisión legal y política de privacidad aplicables.

Estas son activaciones de infraestructura o negocio, no funciones faltantes del prototipo. Consulta [ESTADO_STAGING_CLOUDFLARE.md](ESTADO_STAGING_CLOUDFLARE.md), [ARQUITECTURA_PRODUCCION.md](ARQUITECTURA_PRODUCCION.md) y [RUNBOOK_PRODUCCION.md](RUNBOOK_PRODUCCION.md).
