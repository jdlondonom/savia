# Manual para conectar WhatsApp Business con Savia

Versión 1.0 · Actualizado el 26 de agosto de 2026

## Para quién es este manual

Este manual está escrito para propietarios, administradores y responsables de atención al cliente que no tienen experiencia técnica. No necesita saber programar.

Al terminar tendrá:

- una cuenta empresarial administrada por su negocio en Meta;
- un número de WhatsApp Business conectado a la plataforma oficial de Meta;
- las credenciales necesarias guardadas de forma segura en Savia;
- una dirección pública para que Meta entregue los mensajes a Savia;
- una prueba completa de recepción y respuesta.

> Importante: la integración utiliza **WhatsApp Business Platform (Cloud API)**. No es una conexión informal con WhatsApp Web ni con un código QR.

## 1. Quién debe hacer cada parte

La configuración tiene dos responsables:

| Responsable | Qué hace |
|---|---|
| Propietario del negocio | Crea o confirma el portafolio empresarial de Meta, verifica el negocio y demuestra que controla el número telefónico. |
| Administrador de Meta del negocio | Crea la aplicación de Meta, obtiene los identificadores y autoriza el acceso a WhatsApp. Puede ser la misma persona propietaria. |
| Superadministrador de Savia | Introduce las credenciales en el panel global, copia la URL del webhook y ejecuta las pruebas. |
| Usuario del tenant en Savia | Atiende conversaciones, contactos y reservas. No puede ver ni cambiar credenciales de Meta. |

Por seguridad, las claves solo se introducen desde la cuenta de **superadministrador global de Savia**. No las envíe por correo, WhatsApp, documentos compartidos ni mensajes internos.

## 2. Tiempo que debe reservar

- Preparación de cuentas y número: entre 30 y 90 minutos.
- Revisión del nombre visible o del negocio por Meta: puede ser inmediata o tardar varios días.
- Prueba en Savia: unos 15 minutos después de tener todos los datos.

Meta puede cambiar ligeramente los nombres o la ubicación de sus menús. Si una opción no aparece exactamente como se describe, busque palabras como **WhatsApp**, **Configuración**, **API Setup**, **Getting Started**, **Business settings** o **WhatsApp Manager**.

## 3. Requisitos antes de comenzar

Prepare lo siguiente:

- Una cuenta personal de Facebook o Meta perteneciente a una persona responsable del negocio.
- Acceso de administrador al portafolio empresarial de Meta.
- Autenticación en dos pasos activada en las cuentas administradoras.
- Nombre legal del negocio, dirección, teléfono, sitio web y correo empresarial.
- Política de privacidad publicada en el sitio web.
- Documentos del negocio, por si Meta solicita verificación.
- Un número telefónico que pueda recibir un SMS o una llamada de verificación.
- El nombre comercial que verán los clientes en WhatsApp.
- Acceso de superadministrador global a Savia con MFA activo.
- Un gestor de contraseñas para guardar claves y códigos de recuperación.

### Requisitos del número telefónico

Para el procedimiento estándar de Savia, use preferiblemente un número dedicado:

- debe pertenecer al negocio;
- debe incluir código de país;
- debe recibir SMS o llamadas durante la verificación;
- no debe ser un número corto;
- no debe ser una línea gratuita o de cobro revertido;
- no debe estar registrado previamente en WhatsApp Business Platform;
- no debe depender de una extensión telefónica que impida recibir el código.

Si el número está actualmente en la aplicación móvil de WhatsApp o WhatsApp Business, **no elimine la cuenta todavía**. Primero haga una copia de seguridad y confirme el plan de migración. El procedimiento estándar puede exigir retirar el número de la aplicación móvil. La modalidad de coexistencia no forma parte del alta manual inicial de Savia; si necesita conservar simultáneamente la aplicación móvil, detenga el proceso y consulte al administrador del servicio.

La [guía oficial de incorporación de WhatsApp Business Platform](https://whatsappbusiness.com/wp-content/uploads/2026/04/Onboarding-to-the-WhatsApp-Business-Platform.pdf) explica los requisitos del número, del nombre visible y de la verificación.

## 4. Palabras que encontrará durante el proceso

| Nombre | Explicación sencilla |
|---|---|
| Portafolio empresarial | El espacio de Meta que demuestra qué empresa es propietaria de sus páginas, aplicaciones y cuentas de WhatsApp. |
| WABA | Significa *WhatsApp Business Account*. Es la cuenta empresarial de WhatsApp dentro de Meta. |
| WABA ID | Número interno que identifica la cuenta empresarial de WhatsApp. No es el número telefónico. |
| Phone Number ID | Número interno que Meta asigna a su línea telefónica. Tampoco es el teléfono visible. |
| App de Meta | Aplicación administrativa que autoriza a Savia para comunicarse con WhatsApp Cloud API. |
| App Secret | Clave privada de la aplicación de Meta. Savia la usa para comprobar que los eventos vienen de Meta. |
| Token de acceso | Credencial que permite a Savia consultar el número y enviar respuestas autorizadas. |
| Token de verificación | Clave creada para comprobar la URL del webhook. Debe ser exactamente igual en Savia y Meta. |
| Webhook | Dirección HTTPS a la que Meta entrega mensajes y estados. Cada cliente de Savia tiene una diferente. |
| Graph API | Servicio oficial de Meta que usa Savia para comunicarse con WhatsApp. |

## 5. Parte A: preparar el negocio en Meta

### Paso 1. Entrar a Meta Business Suite

1. Abra [Meta Business Suite](https://business.facebook.com/).
2. Inicie sesión con la cuenta responsable del negocio.
3. Compruebe en la parte superior que está trabajando en el negocio correcto.
4. Si ya existe un **portafolio empresarial**, selecciónelo.
5. Si no existe, elija la opción para crear un negocio o portafolio empresarial.
6. Escriba el nombre legal del negocio, el nombre de la persona responsable y el correo empresarial.

No cree un portafolio nuevo si la empresa ya tiene uno. Tener varios portafolios para la misma empresa suele causar problemas de propiedad y permisos.

### Paso 2. Completar la información del negocio

1. Entre en **Configuración** o **Business settings**.
2. Abra **Información del negocio**.
3. Revise nombre legal, dirección, sitio web, teléfono y correo.
4. Verifique que esos datos coincidan con los documentos oficiales.
5. Active la autenticación en dos pasos para las personas administradoras.

### Paso 3. Verificar el negocio cuando Meta lo solicite

1. En la configuración del negocio, busque **Centro de seguridad** o **Security Center**.
2. Si aparece **Iniciar verificación**, selecciónelo.
3. Complete los datos legales sin abreviaturas distintas a las de sus documentos.
4. Cargue los documentos solicitados.
5. Complete la confirmación por correo, teléfono o dominio.
6. Espere la respuesta de Meta antes de cambiar nuevamente los datos.

Es posible realizar pruebas iniciales sin que toda la revisión haya terminado. Sin embargo, Meta puede exigir la verificación para ampliar límites, activar ciertas funciones o pasar a operación real.

## 6. Parte B: crear la aplicación de Meta

### Paso 4. Crear o seleccionar la aplicación

1. Abra [Meta for Developers](https://developers.facebook.com/apps/).
2. Inicie sesión con la misma cuenta administradora.
3. Seleccione **Mis aplicaciones**.
4. Revise si el negocio ya tiene una aplicación creada para WhatsApp.
5. Si no existe, elija **Crear aplicación**.
6. Cuando Meta pregunte el objetivo o caso de uso, seleccione la opción relacionada con **WhatsApp** o comunicación con clientes.
7. Si Meta solicita un tipo de aplicación, elija **Business** o la opción empresarial equivalente.
8. Use un nombre fácil de reconocer, por ejemplo: `WhatsApp - Nombre del negocio`.
9. Seleccione el portafolio empresarial correcto.
10. Finalice la creación.

No use una aplicación personal o perteneciente a otra agencia sin un acuerdo claro de propiedad. El negocio debe conservar el control de la aplicación y de la cuenta de WhatsApp.

### Paso 5. Añadir WhatsApp a la aplicación

1. Dentro del panel de la aplicación, busque **Añadir producto**.
2. Seleccione **WhatsApp**.
3. Pulse **Configurar** o **Set up**.
4. Seleccione el portafolio empresarial del negocio.
5. Meta creará o conectará una cuenta de WhatsApp Business.
6. Abra **WhatsApp → API Setup**, **Getting Started** o **Configuración de la API**.

Meta puede mostrar un número de prueba y un token temporal. Son útiles para una primera prueba, pero no deben utilizarse como credenciales permanentes de Savia.

## 7. Parte C: añadir y verificar el número del negocio

### Paso 6. Crear o seleccionar la cuenta de WhatsApp Business

1. En la configuración de WhatsApp, elija **Añadir número de teléfono**.
2. Seleccione o cree la cuenta de WhatsApp Business del negocio.
3. Escriba el nombre que reconocerán internamente los administradores.
4. Seleccione la zona horaria, categoría y descripción del negocio.

### Paso 7. Definir el nombre visible

El nombre visible es lo que verá el cliente. Debe:

- representar claramente al negocio;
- coincidir con el sitio web, redes o material comercial;
- evitar textos promocionales, símbolos innecesarios o afirmaciones engañosas;
- cumplir las políticas comerciales de WhatsApp.

Use desde el principio el nombre definitivo. Los cambios posteriores pueden requerir una nueva revisión.

### Paso 8. Verificar el número

1. Escriba el número con su código de país.
2. Elija recibir el código por SMS o llamada.
3. Compruebe que la línea esté disponible.
4. Introduzca el código enviado por Meta.
5. Configure el PIN de seis dígitos para la verificación en dos pasos del número.
6. Guarde el PIN en el gestor de contraseñas del negocio.

No comparta el código SMS ni el PIN con personas que no administren la cuenta.

### Paso 8A. Revisar la facturación antes del uso real

Meta puede cobrar determinados mensajes. Antes de atender clientes reales:

1. Abra **WhatsApp Manager** desde la configuración del negocio.
2. Seleccione la cuenta de WhatsApp Business correcta.
3. Busque **Facturación**, **Métodos de pago** o **Payment settings**.
4. Añada un método de pago que pertenezca al negocio, si Meta se lo solicita.
5. Confirme quién recibirá las alertas y comprobantes de cobro.
6. Revise el país y la moneda antes de confirmar; algunos datos no se pueden cambiar fácilmente después.

Los datos de la tarjeta se administran en Meta, no en Savia. No los introduzca en ningún campo de Savia.

## 8. Parte D: reunir los datos que necesita Savia

Antes de salir de Meta, reúna estos valores. No los copie en un documento sin protección.

### Paso 9. Encontrar el Phone Number ID y el WABA ID

1. Abra **WhatsApp → API Setup** o **Getting Started**.
2. Seleccione el número real del negocio.
3. Busque **Phone number ID**. Copie únicamente el identificador numérico.
4. Busque **WhatsApp Business Account ID**. Este es el **WABA ID**.
5. Compruebe que no está copiando el número de teléfono visible ni el Business Portfolio ID.

La [colección oficial de Meta para WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) confirma que Phone Number ID, WABA ID y token son valores diferentes.

### Paso 10. Encontrar el App Secret

1. En el menú de la aplicación, abra **Configuración de la aplicación → Básica** o **App settings → Basic**.
2. Busque **App Secret**.
3. Pulse **Mostrar**.
4. Meta puede volver a pedir la contraseña o el MFA.
5. Mantenga esa pestaña abierta hasta introducir la clave en Savia.

El App Secret es confidencial. No tome una captura de pantalla ni lo envíe por chat.

### Paso 11. Crear un token de acceso de sistema

El token temporal de la pantalla inicial suele expirar rápidamente. Para operación continua, cree un token de **usuario del sistema**:

1. Regrese a **Configuración del negocio**.
2. Abra **Usuarios → Usuarios del sistema** o **System users**.
3. Cree un usuario del sistema para Savia, por ejemplo `savia-whatsapp`.
4. Asígnele el rol administrativo necesario.
5. Asigne como activos la aplicación de Meta y la cuenta de WhatsApp Business correctas.
6. Conceda control suficiente para administrar y enviar mensajes.
7. Seleccione **Generar token**.
8. Elija la aplicación creada para WhatsApp.
9. Active como mínimo los permisos:
   - `whatsapp_business_management`;
   - `whatsapp_business_messaging`.
10. Si Meta ofrece una duración, elija la más adecuada para la política del negocio. Si el token vence, registre su fecha de caducidad.
11. Copie el token una sola vez y llévelo directamente al formulario seguro de Savia.

Meta admite tokens de usuario y de sistema. Para una conexión estable, la documentación oficial recomienda un token de sistema; los tokens temporales de usuario pueden expirar en 24 horas.

### Paso 12. Crear el token de verificación

Este token lo crea usted; Meta no lo entrega.

1. Abra el generador de contraseñas de su gestor de contraseñas.
2. Genere una clave aleatoria de al menos 32 caracteres.
3. Use letras y números. Evite espacios si quiere reducir errores al copiar.
4. Guárdela con el nombre `Token de verificación de webhook - Savia`.
5. Introduzca exactamente la misma clave primero en Savia y después en Meta.

No utilice la contraseña de Facebook, el token de acceso, el App Secret ni el PIN del número como token de verificación.

## 9. Parte E: configurar WhatsApp en Savia

Esta sección solo puede realizarla un superadministrador global de Savia.

### Paso 13. Abrir el formulario correcto

1. Inicie sesión en Savia.
2. Complete el MFA.
3. Abra **Administración global**.
4. Entre en **Operación**.
5. En **Cliente**, seleccione cuidadosamente el negocio que está configurando.
6. Localice la tarjeta **WhatsApp Cloud API**.

### Paso 14. Completar los campos

| Campo en Savia | Qué debe pegar |
|---|---|
| Phone number ID | El identificador numérico de la línea, no el teléfono visible. |
| WABA ID | El identificador numérico de la cuenta de WhatsApp Business. |
| Token de acceso | El token del usuario del sistema. |
| Secreto de la app | El App Secret de la aplicación de Meta. |
| Token de verificación | La clave aleatoria creada en el paso 12. |
| Graph API | Conserve `v23.0` salvo que el administrador técnico haya validado otra versión compatible. |

1. Revise que Phone Number ID y WABA ID solo tengan dígitos.
2. Pegue cada secreto en su campo una sola vez.
3. Pulse **Guardar WhatsApp**.
4. Savia cifrará las credenciales y no volverá a mostrarlas.
5. Si más adelante deja un campo secreto vacío, Savia conservará el valor anterior.

### Paso 15. Probar la conexión con Meta

1. Pulse **Probar conexión**.
2. Espere el mensaje `Meta validó el número configurado`.
3. Si la prueba falla, no continúe con el webhook. Revise Phone Number ID, token, permisos y vencimiento.

Esta prueba confirma que Meta reconoce el número y que el token puede consultarlo. Todavía falta conectar la entrega de mensajes mediante el webhook.

### Paso 16. Copiar la URL del webhook

1. En la misma tarjeta, busque **Webhook HTTPS exclusivo**.
2. Compruebe que empieza por `https://`.
3. Compruebe que no contiene `localhost`.
4. Pulse **Copiar URL**.
5. No cambie ni acorte la parte final de la dirección.

Cada tenant tiene una URL diferente. Nunca use la URL de otro cliente.

## 10. Parte F: registrar el webhook en Meta

### Paso 17. Abrir la configuración de webhook

1. Regrese al panel de la aplicación en [Meta for Developers](https://developers.facebook.com/apps/).
2. Abra la aplicación del negocio.
3. Entre en **WhatsApp → Configuración** o **Configuration**.
4. Busque la sección **Webhook**.
5. Pulse **Editar**, **Configurar** o **Configure a webhook**.

### Paso 18. Verificar la dirección

1. En **Callback URL**, pegue la URL HTTPS copiada desde Savia.
2. En **Verify token**, pegue el token de verificación creado en el paso 12.
3. Pulse **Verificar y guardar**.
4. Meta hará una comprobación automática.
5. El resultado debe indicar que la dirección fue verificada.

Si Meta rechaza la verificación:

- confirme que la URL empieza por `https://`;
- confirme que el canal fue guardado y probado en Savia;
- copie de nuevo el token sin espacios al inicio o al final;
- compruebe que no mezcló el token de verificación con el token de acceso;
- confirme que está configurando la aplicación y WABA correctas.

### Paso 19. Suscribirse a mensajes

1. En la lista de campos del webhook, busque `messages`.
2. Pulse **Suscribirse** o active su interruptor.
3. Si Meta pregunta por la cuenta de WhatsApp, elija la WABA del negocio.
4. Compruebe que la aplicación quedó suscrita a esa WABA.

La suscripción se hace una vez por WABA; no es necesario repetirla para cada mensaje. La [referencia oficial de suscripciones WABA de Meta](https://www.postman.com/meta/whatsapp-business-platform/folder/gumbt4j/waba-subscriptions) explica esta relación.

### Paso 19A. Revisar el modo de la aplicación

En la parte superior del panel de Meta puede aparecer **En desarrollo** o **Development**. Para atender clientes reales, siga la indicación de Meta para cambiar la aplicación a **En vivo** o **Live** cuando corresponda.

Meta puede pedir antes:

- correo de contacto;
- categoría e icono de la aplicación;
- URL de la política de privacidad;
- verificación del negocio;
- confirmación de permisos o acceso a WhatsApp.

Complete únicamente la información real del negocio. Si Meta solicita una revisión que no sabe responder, conserve la aplicación en desarrollo y pida ayuda al superadministrador de Savia; no seleccione opciones al azar.

## 11. Parte G: prueba completa con un mensaje real

### Paso 20. Probar la recepción

1. Use un teléfono personal diferente al número empresarial conectado.
2. Envíe al negocio un mensaje sencillo, por ejemplo: `Hola, quiero información`.
3. Abra Savia y entre al tenant correcto.
4. Abra **Conversaciones**.
5. Confirme que aparece el contacto y el mensaje.

### Paso 21. Probar la respuesta

1. Responda desde Savia con un texto sencillo.
2. Confirme que la respuesta llega al teléfono personal.
3. Revise en Savia si el estado cambia a enviado, entregado o leído.
4. Tome manualmente la conversación como asesor.
5. Envíe una segunda respuesta.
6. Devuelva el chat a la IA únicamente después de comprobar el flujo manual.

### Paso 22. Registrar el resultado

Anote en el control interno del negocio:

- fecha y hora de la prueba;
- número empresarial probado;
- tenant de Savia;
- persona que realizó la prueba;
- resultado de recepción;
- resultado de respuesta;
- fecha de vencimiento del token, si aplica.

## 12. Reglas de uso que el negocio debe conocer

### Consentimiento del cliente

El negocio solo debe iniciar mensajes a personas que hayan entregado su número y autorizado recibir comunicaciones por WhatsApp. También debe respetar inmediatamente una solicitud de no recibir más mensajes.

### Ventana de atención de 24 horas

Cuando una persona escribe al negocio, se abre una ventana de atención de 24 horas. Durante ese periodo se pueden enviar respuestas de servicio. Fuera de esa ventana, Meta exige una plantilla aprobada para iniciar o retomar la conversación.

La versión inicial de Savia está enfocada en recibir mensajes y responder conversaciones de servicio. El envío de plantillas para iniciar conversaciones fuera de la ventana de 24 horas requiere un módulo adicional; no debe prometerse esa función hasta que aparezca habilitada en la plataforma.

### Escalamiento a una persona

La [Política de mensajería de WhatsApp Business](https://whatsappbusiness.com/policy/) permite automatización, pero exige una forma clara y directa de escalar a una persona. Savia ofrece la toma manual del chat por un asesor.

### Privacidad

- Mantenga actualizada la política de privacidad del negocio.
- Informe al cliente sobre el uso de sus datos.
- No solicite números completos de tarjetas, cuentas financieras, documentos de identidad u otros datos altamente sensibles por WhatsApp.
- Limite los accesos en Savia a las personas que realmente atienden clientes.
- Retire inmediatamente los accesos de personas que dejan el negocio.

### Costos de Meta

Meta puede cobrar por mensaje entregado según país y categoría. No use una cifra copiada de otro sitio: consulte siempre la [página oficial de precios de WhatsApp Business Platform](https://whatsappbusiness.com/products/platform-pricing/). Meta indica que los mensajes de servicio dentro de la ventana de atención no tienen el mismo tratamiento que los mensajes de marketing, utilidad o autenticación.

## 13. Problemas frecuentes y solución sencilla

### Savia muestra `Meta respondió 401` o `403`

- El token puede estar vencido.
- Puede pertenecer a otra aplicación o negocio.
- Puede faltar `whatsapp_business_management` o `whatsapp_business_messaging`.
- El usuario del sistema puede no tener asignada la WABA.

Genere o reasigne un token correcto y vuelva a guardarlo en Savia.

### Savia muestra `Meta respondió 404`

- Phone Number ID puede ser incorrecto.
- Se pudo copiar el número visible en lugar del identificador.
- La línea puede pertenecer a otra WABA.

Regrese a **WhatsApp → API Setup** y copie nuevamente el Phone Number ID.

### Meta dice que no pudo verificar el webhook

- La URL contiene `localhost` o no usa HTTPS.
- El token de verificación no coincide.
- Las credenciales no se guardaron primero en Savia.
- Se está usando la URL de otro tenant.

### La conexión de Savia funciona, pero los mensajes no aparecen

- El campo `messages` puede no estar suscrito.
- La aplicación puede no estar suscrita a la WABA correcta.
- El mensaje se envió al número de prueba y no al número real, o al contrario.
- El webhook puede haber sido reemplazado posteriormente en Meta.

### Los mensajes llegan, pero Savia no puede responder

- El token pudo vencer después de la prueba.
- El número puede no estar completamente registrado.
- La conversación puede estar fuera de la ventana de 24 horas.
- Meta puede haber restringido temporalmente la cuenta o el número.

### Meta no acepta el número

- El número puede seguir registrado en WhatsApp o WhatsApp Business móvil.
- Puede estar registrado en otra WABA.
- Puede no recibir SMS o llamadas.
- El nombre visible o la actividad comercial puede requerir revisión.

No elimine cuentas ni mueva activos repetidamente. Confirme primero quién es el propietario del número y en qué WABA está registrado.

## 14. Cambio o rotación de credenciales

Cambie el token si vence, se expone, cambia el administrador o Meta lo revoca:

1. Genere el nuevo token en Meta.
2. Abra **Administración global → Operación → WhatsApp Cloud API**.
3. Pegue únicamente el nuevo token de acceso.
4. Deje vacíos los demás secretos si no desea cambiarlos.
5. Pulse **Guardar WhatsApp**.
6. Ejecute **Probar conexión**.
7. Revoque el token anterior en Meta después de comprobar el nuevo.

Si cambia el App Secret o el token de verificación, actualícelo en Savia antes de modificar Meta para evitar interrupciones.

## 15. Lista final de comprobación

Marque cada punto antes de considerar terminada la integración:

- [ ] El portafolio empresarial pertenece al negocio correcto.
- [ ] Las cuentas administradoras tienen MFA.
- [ ] El número pertenece al negocio y fue verificado.
- [ ] El nombre visible representa correctamente la marca.
- [ ] Phone Number ID y WABA ID fueron identificados.
- [ ] Se utiliza un token de sistema y se conoce su vencimiento.
- [ ] El token tiene los permisos requeridos.
- [ ] Los secretos se introdujeron directamente en Savia.
- [ ] Savia confirmó la prueba de conexión.
- [ ] La URL del webhook comienza por HTTPS y no contiene `localhost`.
- [ ] Meta verificó la Callback URL.
- [ ] El campo `messages` está suscrito.
- [ ] Un mensaje real apareció en Savia.
- [ ] Una respuesta enviada desde Savia llegó al teléfono.
- [ ] El negocio conoce la regla de consentimiento y la ventana de 24 horas.
- [ ] Se revisaron precios, políticas y privacidad.

## 16. Enlaces oficiales

- [Meta Business Suite](https://business.facebook.com/)
- [Meta for Developers — Aplicaciones](https://developers.facebook.com/apps/)
- [Documentación oficial de WhatsApp Cloud API publicada por Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)
- [Suscripciones de una cuenta WhatsApp Business (WABA)](https://www.postman.com/meta/whatsapp-business-platform/folder/gumbt4j/waba-subscriptions)
- [Guía oficial de incorporación a WhatsApp Business Platform](https://whatsappbusiness.com/wp-content/uploads/2026/04/Onboarding-to-the-WhatsApp-Business-Platform.pdf)
- [Política de mensajería de WhatsApp Business](https://whatsappbusiness.com/policy/)
- [Precios de WhatsApp Business Platform](https://whatsappbusiness.com/products/platform-pricing/)

> Meta modifica periódicamente sus menús, requisitos, precios y políticas. Antes de integrar un nuevo cliente, revise la fecha de este manual y los enlaces oficiales.
