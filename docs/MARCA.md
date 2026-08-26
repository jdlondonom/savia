# Marca Savia

## Concepto

- **Nombre:** Savia
- **Descriptor:** Atención inteligente para negocios
- **Lema principal:** Conversaciones que hacen crecer

Savia representa el flujo que alimenta una relación comercial: cada conversación aporta contexto, cada dato nutre el servicio y cada seguimiento ayuda a convertir una consulta en una relación duradera. Es un nombre breve, pronunciable en español y suficientemente amplio para atender salud, belleza, servicios profesionales, comercio y otros sectores.

## Personalidad verbal

- Cercana, serena y resolutiva.
- Clara antes que técnica.
- Humana sin fingir ser una persona.
- Precisa con precios, políticas, agenda y datos del cliente.
- Transparente cuando no dispone de información confirmada.

Ejemplo de presentación: “Soy Savia, la asistente virtual de Clínica Aurora. Puedo orientarte sobre servicios y ayudarte a solicitar una cita.”

## Logo

El símbolo combina una hoja joven con una burbuja de conversación. Las tres nervaduras internas también evocan rutas de datos y conocimiento. La forma transmite crecimiento, diálogo y tecnología sin recurrir al aspecto genérico de un robot.

Archivos entregados:

- `public/savia-mark.png`: símbolo principal para interfaz e icono.
- `public/og.png`: pieza horizontal para vista previa y presentación.

Reglas de uso:

- Deja alrededor del símbolo un espacio libre mínimo equivalente a una cuarta parte de su ancho.
- Usa el símbolo sobre marfil, blanco o verde bosque.
- No lo estires, inclines, contornee ni cambies a gradientes ajenos a la paleta.
- En tamaños inferiores a 28 px utiliza solo el símbolo, sin lema.

## Paleta

| Color | Hex | Uso principal |
|---|---:|---|
| Verde bosque | `#123D31` | Marca, navegación, botones principales |
| Lima savia | `#D8F45F` | Estado activo, foco y acentos |
| Marfil | `#F6F7F2` | Fondo general |
| Salvia clara | `#B9DED3` | Superficies suaves y estados positivos |
| Verde tinta | `#172720` | Texto principal |
| Durazno suave | `#FFD7CF` | Alertas humanas y excepciones |

Combinaciones recomendadas: blanco sobre verde bosque, verde tinta sobre lima, y verde tinta sobre marfil. Evita texto blanco sobre lima por contraste insuficiente.

## Tipografía

La interfaz usa la pila local `Aptos`, `Segoe UI Variable`, `Segoe UI`, sans-serif. Esto evita descargas externas, funciona bien en Windows y mantiene un tono contemporáneo y legible. Para piezas comerciales puede usarse Manrope cuando esté disponible.

## Prompts exactos para regenerar los recursos

Modo utilizado: generación de imágenes integrada de OpenAI (`imagegen`), salida raster PNG.

### Símbolo principal

```text
Create an original, premium logo mark for a Spanish-language B2B SaaS named “Savia”, focused on AI-powered WhatsApp customer service, CRM, appointments, and private business knowledge. Design one compact symbol only, with no words or letters: a young leaf that also reads immediately as a rounded conversation bubble, containing exactly three elegant vein lines that subtly resemble connected data paths. Flat vector-like geometry, friendly but professional, memorable at favicon size, deep forest green #123D31 as the dominant color with a fresh lime #D8F45F accent and a restrained pale sage #B9DED3 detail. Centered square composition, generous clear space, transparent background, crisp edges, no mockup, no shadow, no gradients, no robot, no WhatsApp logo, no stock-icon look.
```

### Portada de marca

```text
Create a polished 16:9 brand cover for “Savia”, a Spanish-language B2B SaaS for AI-assisted WhatsApp service, CRM, appointments, and private company knowledge. Use a refined editorial layout on warm ivory #F6F7F2, with a large forest-green #123D31 conversation-bubble leaf symbol, subtle lime #D8F45F data veins, pale sage #B9DED3 supporting shapes, and one restrained warm peach accent. Convey calm intelligence, continuous service, organized conversations, and business growth through abstract modular cards and flowing botanical-data paths. Include the brand name “Savia” and the Spanish tagline “Conversaciones que hacen crecer” clearly and correctly. Premium software identity, generous whitespace, crisp flat shapes, no device mockup, no robots, no WhatsApp trademark, no photorealism.
```

Los recursos finales usados por la aplicación son las copias guardadas dentro de `public/`; no dependen de las rutas temporales del generador.
