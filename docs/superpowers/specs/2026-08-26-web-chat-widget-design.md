# Web Chat Widget — Design

## Contexto

Ya existe un agente de ventas conversacional funcionando en producción sobre Telegram
(Cloudflare Worker + Durable Object, en `AgenteRestaurante/`). Ese agente:

- Lee el menú real de El Taca Nijo desde Supabase (categorías, productos, modificadores).
- Conversa con el cliente usando OpenAI (function calling) para armar el carrito.
- Muestra fotos de productos con descripción y precio.
- Pide confirmación explícita con botones (✅ Confirmar / ❌ Cancelar) antes de crear el pedido.
- Soporta pickup y delivery (con ubicación GPS), y pago en efectivo o transferencia (con
  foto de comprobante).
- Crea el pedido real llamando al RPC `create_order` de Supabase — el mismo que usa el
  checkout web de NIXGOFOOD.

Esta spec cubre llevar esa misma experiencia conversacional **dentro de la app web**
(`nixgofood.vercel.app`), inspirado en "Ask DoorDash". El objetivo es reusar el 100% del
"cerebro" (menú, IA, carrito, creación de pedido) sin duplicar lógica de negocio — el chat
web es un canal de entrada/salida nuevo, no un sistema aparte.

## Alcance de v1

**Incluido:**
- Widget de chat flotante, visible en cualquier página de la app (burbuja + panel).
- Complementa la navegación manual existente — no la reemplaza.
- Texto libre, fotos de productos con descripción/precio, botones de Confirmar/Cancelar.
- Pickup + pago en efectivo únicamente.
- Sesión anónima por navegador (localStorage), sin login.

**Explícitamente fuera de v1** (se puede agregar después sin rediseñar):
- Delivery (ubicación GPS) por chat web.
- Pago por transferencia con foto de comprobante por chat web.
- Multi-negocio / multi-tenant (igual que el bot de Telegram, sigue fijo a El Taca Nijo).
- Persistencia de sesión entre dispositivos o navegadores distintos.

Si el cliente pide delivery o transferencia desde el chat web, el agente le indica que por
ahora esas opciones están disponibles por el bot de Telegram (mismo mensaje/enlace que
ya usa la app para WhatsApp/Telegram).

## Arquitectura

### Antes (solo Telegram)

`ConversationAgent` (Durable Object) construye su respuesta y **empuja** cada mensaje
directamente a la API de Telegram (`sendTelegramMessage`, `sendTelegramPhoto`,
`sendTelegramMessageWithButtons`) — el canal de salida está mezclado con la lógica del
agente.

### Después (canal de salida abstracto)

Se agrega a `channel.ts` (que ya define `IncomingMessage`, el lado de entrada) su
contraparte de salida:

```ts
export type OutgoingMessage =
  | { type: 'text'; text: string }
  | { type: 'photo'; url: string; caption: string }
  | { type: 'buttons'; text: string; buttons: { text: string; data: string }[] };
```

`ConversationAgent.fetch()` deja de llamar directo a `sendTelegram*`; en su lugar acumula
`OutgoingMessage[]` y los devuelve en la respuesta HTTP de la Durable Object. Cada canal
decide cómo entregarlos:

- **Telegram** (`index.ts`, ruta `/telegram-webhook`): recibe el arreglo de
  `OutgoingMessage` y lo traduce a llamadas reales de la API de Telegram (mismas
  funciones que ya existen en `telegram.ts`, ahora invocadas desde el adaptador en vez de
  desde el agente).
- **Web** (`index.ts`, ruta nueva `/web-chat`): devuelve el arreglo tal cual como JSON —
  el widget lo pinta directo.

Esto no cambia ningún comportamiento de Telegram para el usuario final; es una
refactorización interna para poder añadir el segundo canal sin duplicar el cerebro.

### Nuevo endpoint: `POST /web-chat`

Body de entrada:
```json
{ "sessionId": "uuid-generado-en-el-navegador", "text": "quiero un taco birria", "callbackData": null }
```

Respuesta:
```json
{ "messages": [ { "type": "text", "text": "..." }, { "type": "photo", "url": "...", "caption": "..." } ] }
```

- `sessionId` hace de `chatId`: `env.CONVERSATION.idFromName(sessionId)` — mismo
  mecanismo que ya usa Telegram, solo cambia el origen del identificador.
- Requiere encabezados CORS (`Access-Control-Allow-Origin` limitado al dominio de
  NIXGOFOOD — `nixgofood.vercel.app` y `localhost` en desarrollo) y manejo de `OPTIONS`
  preflight.
- Sin secreto de webhook (a diferencia de Telegram) porque no hay forma de firmar
  peticiones del navegador; el `sessionId` aleatorio + CORS + rate limiting básico (igual
  al patrón ya usado en las rutas de NIXGOFOOD como `payment-proof/upload`) son la
  mitigación razonable para v1.

### Widget (`ChatWidget`, en NIXGOFOOD)

- Componente React agregado al layout raíz — visible en toda la app.
- Botón flotante 🌮 que abre/cierra un panel de chat.
- Al montar: lee o genera `sessionId` en `localStorage`.
- Al enviar texto: `POST /web-chat`, pinta la respuesta (texto, fotos, o botones).
- Botones "Confirmar/Cancelar" del carrito: botones normales de HTML; al tocar, mandan
  `{ sessionId, callbackData: 'confirm_order' }` (equivalente al `callback_query` de
  Telegram).
- Indicador de "escribiendo..." mientras espera respuesta.
- Si la petición falla (red, 500): mensaje de error dentro del chat, sin afectar el resto
  de la página.

## Testing

- Local: `npm run dev` del Worker en `http://localhost:8787`, widget apuntando ahí en
  desarrollo (variable de entorno o detección de `NODE_ENV`).
- Producción: contra la URL publicada del Worker, probado manualmente end-to-end (pedir,
  ver fotos, confirmar con botón, verificar que el pedido real aparece en Supabase/panel
  de Admin — mismas verificaciones ya usadas para el bot de Telegram).
