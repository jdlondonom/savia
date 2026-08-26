# Seguridad, privacidad y recuperación

## Modelo de responsabilidad

Savia aporta controles técnicos, pero el operador sigue siendo responsable de configurar proveedores, verificar usuarios, definir políticas, atender derechos y mantener copias recuperables.

## Controles implementados

### Identidad

- registro público cerrado;
- bootstrap productivo protegido con un secreto temporal de al menos 32 caracteres;
- contraseña fuerte validada en servidor;
- MFA TOTP obligatorio;
- códigos de recuperación;
- bloqueo temporal por intentos;
- límites de autenticación por la IP confiable `cf-connecting-ip` cuando Savia opera detrás de Cloudflare;
- sesiones de duración limitada y revocables;
- invitaciones y recuperación con token hasheado, temporal y de un solo uso;
- restablecimiento de contraseña/MFA con revocación de sesiones;
- Turnstile opcional en login y recuperación.

### Autorización

- roles globales y de tenant separados;
- autorización en cada acción del servidor;
- tenant derivado desde sesión/membresía;
- protección del último `superadmin` y último `owner`;
- soporte global de solo lectura;
- auditoría de cambios privilegiados.

### Datos

- D1, R2 y Vectorize dedicados por tenant en producción;
- filtros por tenant como segunda barrera;
- relaciones y validaciones cross-tenant;
- archivos con prefijo segregado;
- secretos cifrados con AES-256-GCM;
- anillo de llaves versionado y rotación;
- logs estructurados sin cuerpos personales ni secretos.

### Integraciones

- URL opaca por tenant;
- verificación HMAC de WhatsApp antes del parseo;
- validación del número esperado;
- idempotencia por evento/hash;
- outbox, reintentos y DLQ;
- endpoints de proveedores configurados solo por `superadmin`;
- errores externos sanitizados.

### Aplicación

- CSP;
- protección contra framing;
- `nosniff`;
- política de referer restrictiva;
- permisos del navegador mínimos;
- HSTS en producción;
- endpoint de salud sin secretos.

## Datos personales

Savia puede almacenar nombre, teléfono, correo, mensajes, notas, reservas y contenido empresarial. Antes de operar se debe documentar:

- responsable y encargados;
- finalidad y fundamento jurídico;
- aviso/política de privacidad;
- datos mínimos necesarios;
- periodos de retención;
- procedimiento de acceso, corrección, exportación y eliminación;
- atención de incidentes;
- transferencias a Meta, IA, correo y Cloudflare.

Los documentos RAG no deben incluir datos sensibles innecesarios ni instrucciones secretas.

## Exportación y anonimización

La exportación está limitada a `owner` y `admin`, requiere sesión y MFA, no se almacena en caché y deja auditoría.

La anonimización:

- reemplaza nombre, teléfono y correo;
- elimina notas y texto personal asociado;
- conserva IDs, estados y métricas necesarias para trazabilidad;
- es irreversible desde la interfaz.

Debe verificarse el alcance legal antes de usar anonimización en lugar de borrado completo.

## Retención

Los valores iniciales son:

- mensajes: 730 días;
- documentos: 730 días;
- auditoría de tenant: 1.095 días.

El `superadmin` puede cambiarlos dentro de límites seguros. El worker diario elimina datos vencidos y objetos R2, y registra el resultado. Ciertas evidencias de privacidad o seguridad pueden necesitar un plazo distinto por obligación legal.

La limpieza incluye mensajes, documentos, fragmentos/vectores, generaciones de IA y eventos de outbox relacionados. Si no se puede eliminar el objeto R2, no se borra primero su registro: el error queda visible para reintento operativo.

## Gestión de secretos

Nunca se incluyen en Git:

- `.dev.vars`;
- llaves maestras;
- tokens de Meta;
- llaves de IA o correo;
- tokens de Cloudflare;
- token temporal de bootstrap;
- exportaciones y respaldos.

Producción debe usar:

```text
SAVIA_MASTER_KEYS_JSON={"<id>":"<base64-de-32-bytes>"}
SAVIA_ACTIVE_MASTER_KEY_ID=<id>
```

Rotación:

1. añadir una llave nueva sin retirar la anterior;
2. marcar el nuevo ID como activo;
3. publicar únicamente la configuración de secretos;
4. ejecutar **Rotar bóveda cifrada**;
5. verificar proveedores;
6. retirar la llave antigua solo cuando no existan sobres que dependan de ella.

La clave de Better Auth y el secreto de Turnstile se rotan mediante procedimientos propios, con evaluación de sesiones e impacto.

## Respaldo y restauración

Una copia útil incluye:

- D1 de control;
- todos los D1 de tenant;
- todos los objetos R2;
- catálogo de recursos;
- llaves maestras y secretos de infraestructura en un gestor seguro;
- versión exacta del código y migraciones.

Regla 3-2-1 recomendada: tres copias, dos medios o proveedores y una fuera de la cuenta principal.

Prueba mínima de restauración:

1. crear un ambiente aislado;
2. restaurar control y un tenant;
3. asociar recursos y secretos de prueba;
4. validar login/MFA;
5. abrir CRM, documento y conversación;
6. recuperar RAG;
7. simular webhook;
8. documentar RTO, RPO y resultado.

El script `scripts/backup-cloudflare.ps1` exporta D1 a un área temporal y lo sube a R2. La réplica de buckets R2 de origen se configura por separado mediante su API S3 y debe apuntar a una cuenta o proveedor independiente.

## Respuesta a incidentes

1. Clasificar alcance, tenants y datos afectados.
2. Contener: suspender credenciales, colas o usuarios comprometidos.
3. Preservar logs y auditoría sin alterar evidencia.
4. Rotar secretos relacionados.
5. Corregir y validar en staging.
6. Restaurar/recuperar servicio.
7. Notificar según contratos y ley.
8. Documentar causa, impacto y acciones preventivas.

No se deben copiar mensajes personales a tickets, chats o repositorios durante la investigación.

## Revisión antes de producción

- MFA probado para todas las cuentas privilegiadas.
- Dos superadministradores independientes, ambos verificados.
- Turnstile y rate limits activos.
- Correo y recuperación probados.
- Recursos dedicados validados para cada tenant.
- Pruebas cross-tenant y restauración aprobadas.
- WAF, alertas y DLQ monitoreada.
- Política, términos, DPA y subencargados revisados.
- Inventario y rotación de secretos documentados.
- Sin datos de demostración en producción.

## Estado de dependencias de compilación

La auditoría del artefacto desplegable (`pnpm audit --prod`) no reporta vulnerabilidades conocidas al 25 de agosto de 2026. La auditoría completa conserva temporalmente dos avisos altos de denegación de servicio en `image-size@2.0.2`, una dependencia indirecta de compilación de Vinext, porque la versión corregida `2.0.3` aún no está publicada en npm.

La exposición queda acotada: `image-size` solo procesa imágenes confiables del repositorio durante el build, no recibe archivos de usuarios y no aparece en `dist/`. Se debe retirar esta excepción y actualizar tan pronto exista una versión corregida; si cambia cualquiera de esas condiciones, se bloquea la publicación.
