# Savia

**Conversaciones que hacen crecer.**

Savia es una plataforma multitenant de atención por WhatsApp con IA, RAG, CRM y agenda. Puede ejecutarse completamente en un PC para desarrollo y demostraciones. También existe un ambiente público de **staging** en Cloudflare para validación; producción y el dominio comercial todavía no están publicados.

Estado de staging: [savia-app-staging.jdlondonom.workers.dev](https://savia-app-staging.jdlondonom.workers.dev). Consulta [el estado operativo y sus pendientes](docs/ESTADO_STAGING_CLOUDFLARE.md) antes de usarlo con datos reales.

## Inicio local

Requisitos: Windows, Node.js 22 o superior y pnpm.

```powershell
.\start-savia.ps1
```

Después abre [http://localhost:3000/setup](http://localhost:3000/setup), crea el primer superadministrador y registra el MFA. El script genera `.dev.vars` con secretos aleatorios si todavía no existe. Para detener Savia usa `Ctrl+C`.

## Capacidades

- WhatsApp Cloud API por cliente, con URL y credenciales independientes, validación HMAC, idempotencia, colas, reintentos y estados de entrega.
- Bandeja de conversaciones con IA automática, toma manual por un asesor y devolución controlada a IA.
- CRM básico con contactos, etapas, notas y próximos seguimientos.
- Agenda con zona horaria, horarios semanales, bloqueos y prevención atómica de solapamientos.
- Catálogo de productos y servicios indexado junto con los documentos del negocio.
- RAG textual, semántico o híbrido; LLM principal/respaldo y embeddings configurables por tenant.
- OpenAI, Anthropic, Hugging Face, Voyage y endpoints compatibles con OpenAI.
- Cuotas diarias/mensuales y estimación de costo por tenant; al alcanzar el límite, la conversación pasa a un asesor.
- Panel global para tenants, recursos, accesos, proveedores, WhatsApp, correo, retención, recuperación y auditoría.
- Roles globales `superadmin` y `support`; roles de tenant `owner`, `admin` y `advisor`.
- Registro público cerrado, invitaciones privadas, MFA TOTP obligatorio, códigos de recuperación, Turnstile opcional y bloqueo por intentos.
- Exportación de datos y anonimización de contactos, más retención automatizable.
- Bóveda AES-GCM con llaves versionadas y rotación desde el panel global.

## Aislamiento multitenant

En local se usa una base y almacenamiento emulados compartidos para simplificar el desarrollo, conservando filtros y relaciones por `tenant_id`.

En producción Savia falla de forma segura si no existe aislamiento dedicado. La arquitectura prevista asigna a cada tenant:

- una base D1 propia para CRM, conversaciones, agenda y RAG;
- un bucket R2 propio para documentos;
- un índice Vectorize propio para embeddings;
- una configuración de WhatsApp, IA, cuotas y retención administrada solo desde el plano global.

El plano de control mantiene identidades, sesiones, membresías, conexiones cifradas y el catálogo de recursos, separado de los datos operativos de cada cliente.

## Administración inicial

1. Entra a [Administración global](http://localhost:3000/platform).
2. Crea el tenant del cliente.
3. Invita al propietario o administrador del tenant desde **Accesos**.
4. Configura sus modelos, límites, WhatsApp y recursos desde **Proveedores IA** y **Operaciones**.
5. El usuario invitado crea su contraseña y MFA antes de acceder; solo verá los tenants asignados.

## Comprobación y respaldo local

```powershell
# Con Savia iniciada
.\verify-savia.ps1

# Con Savia detenida
.\backup-savia.ps1
```

También están disponibles:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:load
pnpm build
```

## Documentación

- [Manual para conectar WhatsApp Business con Meta](docs/MANUAL_USUARIO_WHATSAPP_META.md)
- [Documentación funcional y técnica](docs/DOCUMENTACION_SERVICIO.md)
- [Operación local paso a paso](docs/OPERACION_LOCAL.md)
- [Arquitectura de producción](docs/ARQUITECTURA_PRODUCCION.md)
- [Runbook de preparación y puesta en producción](docs/RUNBOOK_PRODUCCION.md)
- [Estado del staging en Cloudflare](docs/ESTADO_STAGING_CLOUDFLARE.md)
- [Seguridad, privacidad y recuperación](docs/SEGURIDAD_Y_PRIVACIDAD.md)
- [Plantillas de Cloudflare](cloudflare/README.md)
- [Marca, logo y paleta](docs/MARCA.md)
- [Prompts de mantenimiento para Claude Code](docs/PROMPTS_CLAUDE_CODE.md)

## Servicios externos necesarios para producción

Cloudflare puede alojar la aplicación y sus datos, pero no sustituye los servicios de negocio. Para una operación real se requieren una cuenta de Meta WhatsApp Business, credenciales de los proveedores de IA seleccionados y un proveedor de correo transaccional (Resend o Postmark). También se necesita un dominio administrado, reglas de seguridad, monitoreo y copias externas probadas.

Los archivos bajo `cloudflare/*.example.jsonc` son exclusivamente plantillas. No contienen IDs ni secretos reales y no ejecutan despliegues. Las configuraciones reales usadas para staging permanecen excluidas de Git.
