# Operación local de Savia

Esta guía cubre el uso en un PC Windows. El modo local sirve para desarrollo, demostraciones y validación con clientes; no ofrece alta disponibilidad 24/7.

## 1. Inicio y cierre

Desde la carpeta del proyecto:

```powershell
.\start-savia.ps1
```

Abre [http://localhost:3000](http://localhost:3000) y conserva abierta la ventana del servicio. Para detenerlo usa `Ctrl+C`.

En el primer inicio se crea `.dev.vars` con secretos aleatorios. Nunca compartas ese archivo: contiene la clave que protege sesiones y credenciales cifradas. Si Windows impide ejecutar scripts:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-savia.ps1
```

## 2. Primer superadministrador y MFA

1. Abre [http://localhost:3000/setup](http://localhost:3000/setup).
2. Registra nombre, correo y una contraseña de 12 a 128 caracteres con letras, número y símbolo.
3. Escanea el QR con una aplicación TOTP.
4. Guarda los códigos de recuperación fuera del PC.
5. Confirma el código MFA.

La configuración inicial queda cerrada después del primer usuario. No hay registro público y ninguna cuenta entra al CRM sin MFA.

## 3. Crear un tenant y entregar acceso

1. Ve a **Administración global → Clientes**.
2. Crea el cliente con nombre, sector, identificador y zona horaria.
3. Ve a **Accesos** y crea una invitación de **Usuario de cliente**.
4. Selecciona tenant y rol:

   - `owner`: operación, perfil, catálogo, conocimiento y privacidad;
   - `admin`: administración operativa del tenant;
   - `advisor`: conversaciones, contactos y agenda.

5. Envía el enlace de activación por un canal privado.

El enlace vence, es de un solo uso y solo se almacena mediante hash. Si hay correo transaccional configurado, Savia intenta enviarlo; en todo caso el superadministrador recibe un enlace de una sola visualización para entregarlo manualmente.

Para personal de la plataforma usa:

- `superadmin`: administración global completa;
- `support`: consulta del panel global sin mutaciones.

Suspender una cuenta revoca sus sesiones. Savia protege al último superadministrador y al último propietario de cada tenant.

## 4. Proveedores y modelos de IA

Solo un `superadmin` puede modificar esta configuración.

### Conexión

En **Administración global → Proveedores IA**:

1. Crea una conexión y selecciona OpenAI, Anthropic, Hugging Face, Voyage o Compatible OpenAI.
2. Define si se usará para LLM, embeddings o ambos.
3. Indica URL base únicamente cuando corresponda.
4. Guarda la llave API y ejecuta la prueba.

La llave se cifra con AES-GCM. La interfaz solo vuelve a mostrar una pista; para reemplazarla se escribe una nueva.

### Asignación por tenant

Selecciona:

- LLM principal, modelo, temperatura y máximo de salida;
- LLM de respaldo opcional;
- proveedor/modelo de embeddings y dimensiones;
- recuperación por palabras, semántica o híbrida.

Al cambiar embeddings Savia versiona la configuración y reindexa documentos y catálogo del tenant afectado. Si el proveedor falla, la recuperación textual y la respuesta determinista siguen disponibles.

### Límites de consumo

En **Administración global → Operaciones** define por tenant:

- solicitudes máximas por día;
- tokens máximos por mes;
- presupuesto estimado mensual;
- tarifa de entrada y salida por millón de tokens.

Cuando se alcanza un límite, Savia no inicia otra llamada pagada y pasa la conversación a atención humana.

## 5. WhatsApp por tenant

El simulador local funciona sin Meta. Para una conexión real:

1. En **Administración global → Operaciones**, selecciona el tenant.
2. Guarda `phone_number_id`, token de verificación, secreto de la app, token de acceso y versión de Graph.
3. Ejecuta la prueba de conexión.
4. Copia la URL única mostrada, con formato:

   `https://<dominio>/api/webhooks/whatsapp/<clave-del-tenant>`

5. Registra esa URL y el mismo token de verificación en Meta.
6. Suscribe mensajes y estados.

Las credenciales se cifran y cada número solo puede pertenecer a un tenant. El endpoint global `/api/webhooks/whatsapp` está deshabilitado; se usa siempre la URL única. Los POST sin firma HMAC válida son rechazados antes de interpretar el cuerpo.

En producción los eventos entran a una cola con reintentos y cola de errores. En local se procesan en el mismo servicio.

## 6. Correo, recuperación y acceso

En **Administración global → Operaciones** configura Resend o Postmark, remitente y llave API. Usa **Probar** antes de depender del correo para invitaciones.

Opciones de recuperación:

- el usuario puede pedir un enlace desde **Olvidé mi contraseña**;
- un `superadmin` puede generar un enlace de recuperación de un solo uso;
- un `superadmin` puede restablecer el MFA de otra cuenta.

La recuperación revoca sesiones existentes. Entrega enlaces manuales solo después de verificar la identidad del destinatario.

Turnstile se activa cuando `TURNSTILE_SECRET_KEY` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY` están presentes en `.dev.vars`.

## 7. Uso diario del tenant

- **Conversaciones**: revisar mensajes, tomar el chat, responder manualmente o devolverlo a IA.
- **Contactos**: mantener etapa, notas y fecha de seguimiento.
- **Agenda**: crear reservas, confirmar/cancelar y administrar bloqueos.
- **Conocimiento**: cargar TXT, MD, CSV o JSON de hasta 1 MB.
- **Catálogo**: crear productos/servicios, precio, duración y estado.
- **Configuración**: identidad, tono, reglas y horario semanal del asistente.

La agenda interpreta los horarios en la zona horaria del tenant, usa intervalos de 15 minutos y rechaza reservas fuera de atención, bloqueadas o solapadas.

## 8. Privacidad y retención

Un `owner` o `admin` puede:

- exportar los datos del tenant o de un contacto;
- anonimizar de forma irreversible un contacto;
- conservar la trazabilidad empresarial sin retener nombre, teléfono, correo ni texto personal.

El `superadmin` define en **Operaciones** la retención de mensajes, documentos y auditoría, y puede activar la limpieza programada. En local esa tarea no se ejecuta sola: debe invocarse mediante el worker de mantenimiento o realizarse al migrar a la configuración de producción.

## 9. Verificación y respaldo

Con Savia iniciada:

```powershell
.\verify-savia.ps1
```

Para un respaldo local consistente:

1. Detén Savia.
2. Ejecuta `.\backup-savia.ps1`.
3. Copia el resultado a un medio cifrado diferente.
4. Prueba periódicamente una restauración en otra carpeta.

El respaldo debe incluir `.wrangler` y `.dev.vars`; sin la llave maestra no se pueden recuperar las credenciales cifradas.

## 10. Problemas frecuentes

| Síntoma | Acción |
|---|---|
| La página no abre | Confirma que el proceso sigue activo y que el puerto 3000 está libre |
| Aparece `/setup` | Completa el primer administrador y MFA |
| MFA no valida | Sincroniza la hora del teléfono o usa un código de recuperación |
| El usuario no ve el cliente | Revisa su membresía y que tenant/usuario estén activos |
| El proveedor de IA falla | Prueba conexión, URL y modelo desde el panel global |
| RAG solo recupera palabras | Revisa embeddings y vuelve a guardar para reindexar |
| WhatsApp no valida | Comprueba URL única, token, secreto de app y firma de Meta |
| WhatsApp no envía | Revisa token, `phone_number_id`, versión Graph y estado del número |
| Correo no llega | Prueba el proveedor y valida el dominio remitente |
| Una reserva es rechazada | Revisa zona horaria, horario, bloqueos y solapamientos |

## 11. Qué no hacer

- No expongas directamente el puerto local a Internet.
- No guardes `.dev.vars`, tokens, exportaciones o respaldos en Git.
- No uses el mismo ambiente, base o secreto para pruebas y producción.
- No prometas 24/7 desde un PC sin energía redundante, monitoreo y conectividad de respaldo.

Para producción sigue [RUNBOOK_PRODUCCION.md](RUNBOOK_PRODUCCION.md). Las plantillas existentes no publican nada por sí solas.
