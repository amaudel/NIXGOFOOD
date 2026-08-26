# Web Chat Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers order by chatting inside the NIXGOFOOD web storefront, reusing the exact same "brain" (menu, OpenAI tool-calling, cart, `create_order`) that already powers the production Telegram bot — without duplicating any of that logic.

**Architecture:** The `ConversationAgent` Durable Object stops calling Telegram directly. It accumulates a channel-agnostic `OutgoingMessage[]` and returns it as JSON. Two thin adapters translate that array for their channel: the existing `/telegram-webhook` route (pushes each message to the real Telegram API) and a new `/web-chat` route (returns the array straight to the browser). A new `ChatWidget` React component in NIXGOFOOD renders that array and posts the customer's replies back.

**Tech Stack:** Cloudflare Workers + Durable Objects + TypeScript (agent repo), Next.js App Router + React + Tailwind (NIXGOFOOD repo). No test runner exists in either repo — verification is `npx tsc --noEmit` plus manual `curl` against `wrangler dev` / the deployed Worker, matching how this project has been verified throughout its build so far.

**Spec:** `docs/superpowers/specs/2026-08-26-web-chat-widget-design.md`

## Global Constraints

- v1 web chat supports **pickup + cash only**. If the customer asks for delivery or transfer on web, the agent tells them (in text) that those are available via the Telegram bot for now — do not build delivery/transfer UI for web.
- Never change Telegram's user-visible behavior. Every step that touches shared code (`agent.ts`, `index.ts`) must be checked against the Telegram flow before moving on.
- The `/web-chat` endpoint has no webhook secret (browsers can't hold one) — CORS restricted to `https://nixgofood.vercel.app` and `http://localhost:3000` is the only access control for v1.
- Session identity on web = a random UUID generated in the browser and stored in `localStorage`, playing the exact role Telegram's `chatId` plays today.

---

### Task 1: Channel-agnostic message types

**Files:**
- Modify: `AgenteRestaurante/src/channel.ts`

**Interfaces:**
- Produces: `IncomingMessage.channel: 'telegram' | 'web'`, `OutgoingMessage` union type, both exported from `channel.ts`.

- [ ] **Step 1: Add `channel` to `IncomingMessage` and define `OutgoingMessage`**

Replace the full contents of `AgenteRestaurante/src/channel.ts` with:

```ts
// Canal-agnóstico: la forma que ve el agente sin importar si el mensaje llegó
// por Telegram, WhatsApp, la web, o cualquier otro canal.
export interface IncomingMessage {
  chatId: string;
  text: string;
  photoFileId?: string;
  location?: { latitude: number; longitude: number };
  callbackData?: string;
  channel: 'telegram' | 'web';
}

// Lo que el agente quiere decirle al cliente, sin saber por qué canal saldrá.
export type OutgoingMessage =
  | { type: 'text'; text: string }
  | { type: 'photo'; url: string; caption: string }
  | { type: 'buttons'; text: string; buttons: { text: string; data: string }[] }
  | { type: 'request_location'; text: string };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` from `AgenteRestaurante/`
Expected: errors in `telegram.ts` and `agent.ts` (they construct `IncomingMessage` without `channel`, or still reference the old Telegram-sending functions) — that's expected, Task 2 and 3 fix them. Confirm the *only* errors are about the missing `channel` field / Telegram-sending functions, nothing about `OutgoingMessage` itself.

- [ ] **Step 3: Commit**

```bash
git add src/channel.ts
git commit -m "Add channel-agnostic IncomingMessage.channel and OutgoingMessage type"
```

---

### Task 2: Make `ConversationAgent` channel-agnostic

**Files:**
- Modify: `AgenteRestaurante/src/agent.ts`

**Interfaces:**
- Consumes: `IncomingMessage` (with `channel`), `OutgoingMessage` from `./channel` (Task 1).
- Produces: `ConversationAgent.fetch()` now returns `Response` whose JSON body is `{ messages: OutgoingMessage[] }` instead of the literal string `'ok'`. No other class changes its public shape.

This task removes every direct call to `sendTelegramMessage`, `sendTelegramPhoto`, `sendTelegramMessageWithButtons`, and `askForTelegramLocation` from `agent.ts`, replacing each with a call to a new private `this.reply(msg: OutgoingMessage)` helper that just pushes onto an in-memory array for the duration of the request.

- [ ] **Step 1: Remove the Telegram import, add the outgoing-message buffer and `reply()` helper**

In `AgenteRestaurante/src/agent.ts`, replace:

```ts
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  sendTelegramPhoto,
  downloadTelegramFile,
  askForTelegramLocation,
} from './telegram';
```

with:

```ts
import { downloadTelegramFile } from './telegram';
```

(`downloadTelegramFile` stays — it's about *receiving* the payment-proof photo from Telegram's file API, which only Telegram channel sessions ever trigger; it is not an outgoing send.)

Then update the `import { IncomingMessage } from './channel';` line to also import `OutgoingMessage`:

```ts
import { IncomingMessage, OutgoingMessage } from './channel';
```

Add this private field and helper method inside the `ConversationAgent` class, right after the constructor:

```ts
  private outgoing: OutgoingMessage[] = [];

  private reply(msg: OutgoingMessage): void {
    this.outgoing.push(msg);
  }
```

- [ ] **Step 2: Replace every `sendTelegramMessage(this.env, chatId, X)` call with `this.reply({ type: 'text', text: X })`**

There are 13 call sites in the current file. Go through `fetch()`, `runTool()`, `sendConfirmSummary()`, and `doConfirmOrder()` and replace each one. For example, this:

```ts
      await sendTelegramMessage(this.env, chatId, '¡Listo! Empecemos un pedido nuevo. ¿Qué se te antoja hoy?');
      return new Response('ok');
```

becomes:

```ts
      this.reply({ type: 'text', text: '¡Listo! Empecemos un pedido nuevo. ¿Qué se te antoja hoy?' });
      return this.finish();
```

Do this for all of these messages (search for `sendTelegramMessage(this.env, chatId,` to find every one):
- `'¡Listo! Empecemos un pedido nuevo. ¿Qué se te antoja hoy?'`
- `` `Ya tienes un pedido confirmado (${order.orderNumber}). Si quieres hacer uno nuevo, escribe "nuevo pedido".` `` (inside `callbackData === 'confirm_order'` handling)
- `'Ese pedido ya está confirmado y no se puede cancelar desde aquí.'`
- `'Pedido cancelado. Si quieres empezar de nuevo, dime qué se te antoja 🌮'`
- `` `Ese pedido ya estaba confirmado (${order.orderNumber}).` ``
- `` `No se pudo confirmar: ${result.resultText}` ``
- `` `${statusLine} Si quieres hacer uno nuevo, escribe "nuevo pedido".` ``
- `'Recibí tu ubicación, pero por ahora solo la necesito si tu pedido es delivery. Dime primero si tu pedido es para delivery.'`
- `'¡Ubicación recibida! 📍'`
- `'Recibí tu foto, pero por ahora solo la necesito si vas a pagar por transferencia. Si es tu comprobante de pago, primero dime que vas a pagar por transferencia.'`
- `'¡Recibido tu comprobante de transferencia! ✅'`
- `` `No pude procesar tu comprobante: ${err.message}. Intenta mandarlo de nuevo.` ``
- inside `runTool`'s `mostrar_fotos` branch: `` `*${p.categoryName}*` `` (the category header line)
- the whole confirmed-order message built in `doConfirmOrder` (the `✅ *Pedido confirmado...` string)

Every `return new Response('ok');` in the file becomes `return this.finish();` (Step 4 defines `finish()`).

- [ ] **Step 3: Replace `sendTelegramPhoto` and `sendTelegramMessageWithButtons` calls**

In `runTool`'s `mostrar_fotos` branch, replace:

```ts
        const caption = `*${p.name}* — $${p.price.toFixed(2)}\n${p.description}`;
        await sendTelegramPhoto(this.env, chatId, p.imageUrl!, caption);
```

with:

```ts
        const caption = `*${p.name}* — $${p.price.toFixed(2)}\n${p.description}`;
        this.reply({ type: 'photo', url: p.imageUrl!, caption });
```

In `sendConfirmSummary`, replace the whole method body:

```ts
  private async sendConfirmSummary(order: OrderState, chatId: string): Promise<void> {
    const deliveryNote = order.deliveryMethod === 'delivery' ? '\n(El costo exacto de envío se calcula según tu zona y se confirma al finalizar.)' : '';
    await sendTelegramMessageWithButtons(
      this.env,
      chatId,
      `*Resumen de tu pedido:*\n${orderSummaryText(order)}${deliveryNote}\n\n¿Confirmas tu pedido así?`,
      [
        { text: '✅ Confirmar pedido', data: 'confirm_order' },
        { text: '❌ Cancelar', data: 'cancel_order' },
      ]
    );
  }
```

with:

```ts
  private sendConfirmSummary(order: OrderState): void {
    const deliveryNote = order.deliveryMethod === 'delivery' ? '\n(El costo exacto de envío se calcula según tu zona y se confirma al finalizar.)' : '';
    this.reply({
      type: 'buttons',
      text: `*Resumen de tu pedido:*\n${orderSummaryText(order)}${deliveryNote}\n\n¿Confirmas tu pedido así?`,
      buttons: [
        { text: '✅ Confirmar pedido', data: 'confirm_order' },
        { text: '❌ Cancelar', data: 'cancel_order' },
      ],
    });
  }
```

(Note: dropped the unused `chatId` parameter and made it synchronous since it no longer awaits anything. Update every call site — `this.sendConfirmSummary(order, chatId)` becomes `this.sendConfirmSummary(order)`, no `await` needed but leaving `await` in front of a non-promise value is harmless in TypeScript, so either remove the `await` or leave it; remove it for clarity.)

Find `askForTelegramLocation(this.env, chatId, '...')` inside `actualizar_pedido`'s handling and replace:

```ts
      const justSwitchedToDelivery = newOrder.deliveryMethod === 'delivery' && !newOrder.deliveryCoords && order.deliveryMethod !== 'delivery';
      if (justSwitchedToDelivery) {
        await askForTelegramLocation(
          this.env,
          chatId,
          'Para el delivery necesito tu ubicación exacta - dale click al botón de abajo para compartirla 👇'
        );
      }
```

with:

```ts
      const justSwitchedToDelivery = newOrder.deliveryMethod === 'delivery' && !newOrder.deliveryCoords && order.deliveryMethod !== 'delivery';
      if (justSwitchedToDelivery) {
        this.reply({
          type: 'request_location',
          text: 'Para el delivery necesito tu ubicación exacta - dale click al botón de abajo para compartirla 👇',
        });
      }
```

- [ ] **Step 4: Add the `finish()` helper that returns the accumulated messages as JSON**

Add this private method next to `reply()`:

```ts
  private finish(): Response {
    return new Response(JSON.stringify({ messages: this.outgoing }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
```

Every `return new Response('ok');` left in `fetch()` must now read `return this.finish();`. Search the whole file for `new Response('ok')` and confirm none remain outside `finish()` itself.

- [ ] **Step 5: Thread `channel` through to `buildSystemPrompt` and add the web-only restriction line**

Change the `buildSystemPrompt` signature and call site. Find:

```ts
function buildSystemPrompt(menu: Menu, order: OrderState): string {
  return `Eres el asistente de ventas por chat de "El Taca Nijo", una taquería. Hablas español neutro, cálido, breve y directo, como alguien atendiendo por WhatsApp.
```

Change to:

```ts
function buildSystemPrompt(menu: Menu, order: OrderState, channel: 'telegram' | 'web'): string {
  const channelRestriction =
    channel === 'web'
      ? '\n0. IMPORTANTE: este chat web SOLO soporta pedidos para RECOGER EN EL LOCAL (pickup) pagados en EFECTIVO por ahora. Si el cliente pide delivery o pago por transferencia, dile amablemente que por ahora esas opciones están disponibles por nuestro bot de Telegram, y sigue ofreciéndole pickup + efectivo.'
      : '';
  return `Eres el asistente de ventas por chat de "El Taca Nijo", una taquería. Hablas español neutro, cálido, breve y directo, como alguien atendiendo por WhatsApp.
${channelRestriction}

Tu trabajo:
1. Recomendar del menú real de abajo (nunca inventes productos ni precios).
2. Ayudar al cliente a armar su pedido, sugiriendo combos o extras cuando tenga sentido (venta sugestiva, sin ser insistente).
3. OBLIGATORIO: cualquier vez que el cliente pregunte qué hay disponible (del menú completo, de una categoría como "tacos" o "bebidas", o de un platillo puntual) - por ejemplo "qué bebidas hay", "qué tacos tienen", "muéstrame el menú", "qué tienen de combos" - DEBES llamar a la función mostrar_fotos con esa categoría o producto. NUNCA respondas listando los productos y precios tú mismo en texto - siempre usa mostrar_fotos primero, y tu respuesta de texto debe ser corta (ej. "aquí tienes 👆, ¿cuál te antoja?").
4. Cuando el cliente agregue o cambie algo del carrito, llama a la función actualizar_pedido con el carrito COMPLETO actualizado.
5. Antes de confirmar, asegúrate de tener: al menos un producto, nombre del cliente, teléfono, y método de pago (efectivo o transferencia).
6. Pregunta si el pedido es para RECOGER EN EL LOCAL (pickup) o para DELIVERY, y llama a actualizar_pedido con deliveryMethod. Si es delivery, pide también la dirección de texto (deliveryAddress), una referencia (deliveryReference) y el tipo de lugar (deliveryLocationType: Casa/Departamento/Oficina/Local comercial). El sistema le pedirá automáticamente al cliente que comparta su ubicación GPS por Telegram (con un botón) apenas detecte que el pedido es delivery - tú no necesitas pedirla, solo espera a que el resumen del pedido diga que la ubicación GPS ya fue compartida antes de confirmar.
7. Si el cliente va a pagar por TRANSFERENCIA, dile que debe mandar la foto del comprobante de pago por este chat antes de poder confirmar el pedido (el sistema la recibe automáticamente cuando la manden). No llames a confirmar_pedido para un pago por transferencia hasta que el sistema confirme que ya se recibió el comprobante.
8. El sistema (no tú) manda automáticamente el resumen con botones de Confirmar/Cancelar en cuanto detecta que el pedido tiene todos los datos completos - no necesitas llamar ninguna función para eso, ni escribir tú el resumen en texto. Cuando eso pase, solo responde algo breve (ej. "aquí tienes 👆").
9. Nunca inventes que un pedido fue creado - solo confírmalo después de que la función confirmar_pedido te devuelva éxito.

Menú disponible:
${menuToPromptText(menu)}

Estado actual del pedido:
${orderSummaryText(order)}`;
}
```

Keep every other line of the existing prompt body (points 1-9, the menu block, the order-summary block) exactly as they are today — only the function signature and the new `channelRestriction` line change. Do not renumber the existing points; the new line is injected right after the greeting, before point 1, and is empty (`''`) for Telegram so nothing changes for that channel.

Now update the one call site inside `fetch()`. Find:

```ts
      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(menu, order) },
        ...history,
      ];
```

and change to:

```ts
      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(menu, order, channel) },
        ...history,
      ];
```

This means `fetch()` needs `channel` in scope. Update its destructuring line:

```ts
    const { chatId, text, photoFileId, location, callbackData } = (await request.json()) as IncomingMessage;
```

becomes:

```ts
    const { chatId, text, photoFileId, location, callbackData, channel } = (await request.json()) as IncomingMessage;
```

- [ ] **Step 6: Update every remaining call-site signature that dropped `chatId` or `await`**

`runTool()` still takes `chatId` for now (it's still used to pass through to `sendConfirmSummary` before Step 3's edit, and to nothing else after it — since `mostrar_fotos` and the rest now call `this.reply(...)` which needs no `chatId`). After Step 2/3's edits, `chatId` is unused inside `runTool` and `doConfirmOrder`. Remove the now-unused `chatId` parameter from both method signatures and from every call to them:

- `private async runTool(toolCall, menu, order, chatId)` → `private async runTool(toolCall, menu, order)`, and its one call site `this.runTool(toolCall, menu, order, chatId)` → `this.runTool(toolCall, menu, order)`.
- `private async doConfirmOrder(order, chatId)` → `private async doConfirmOrder(order)`, and its two call sites (`confirmar_pedido` branch, and the `callbackData === 'confirm_order'` handler) drop the `chatId` argument.

`fetch()` itself still needs `chatId` — it's what Task 3's adapter uses to look up the Durable Object and (for Telegram) which chat to push into. Do not remove it from `fetch()`'s destructuring.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit` from `AgenteRestaurante/`
Expected: zero output (no errors). If anything still references `sendTelegramMessage`, `sendTelegramPhoto`, `sendTelegramMessageWithButtons`, or `askForTelegramLocation` inside `agent.ts`, fix that call site the same way as its sibling above.

- [ ] **Step 8: Manually verify the Durable Object now returns JSON instead of pushing to Telegram**

Start the local dev server:

```bash
npm run dev
```

In another terminal, simulate a Telegram text message hitting the raw Durable Object endpoint indirectly is not possible without Task 3's adapter still calling it, so instead confirm the *shape* by reading the code: `grep -n "sendTelegram" src/agent.ts` from `AgenteRestaurante/` must return **zero matches**. This confirms `agent.ts` no longer imports or calls any Telegram-sending function directly.

```bash
grep -n "sendTelegram" src/agent.ts
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add src/agent.ts
git commit -m "Make ConversationAgent channel-agnostic: return OutgoingMessage[] instead of pushing to Telegram"
```

---

### Task 3: Telegram adapter + new `/web-chat` endpoint with CORS

**Files:**
- Modify: `AgenteRestaurante/src/index.ts`
- Modify: `AgenteRestaurante/src/telegram.ts` (add `channel: 'telegram'` to both `IncomingMessage` literals `parseTelegramUpdate` returns)

**Interfaces:**
- Consumes: `ConversationAgent.fetch()`'s new response shape `{ messages: OutgoingMessage[] }` (Task 2); `sendTelegramMessage`, `sendTelegramPhoto`, `sendTelegramMessageWithButtons`, `askForTelegramLocation` from `./telegram` (unchanged signatures, now called from `index.ts` instead of `agent.ts`).
- Produces: `POST /web-chat` — request body `{ sessionId: string; text: string; callbackData?: string }`, response body `{ messages: OutgoingMessage[] }`, with CORS headers for `https://nixgofood.vercel.app` and `http://localhost:3000`.

This task moves the "push each `OutgoingMessage` to Telegram" logic that used to live inside `agent.ts` into `index.ts`'s `/telegram-webhook` handler (the Telegram adapter), and adds the new web-facing route.

- [ ] **Step 1: Add the Telegram-delivery adapter function**

At the top of `AgenteRestaurante/src/index.ts`, change the import line:

```ts
import { setTelegramWebhook, verifyTelegramWebhookSecret, parseTelegramUpdate } from './telegram';
```

to:

```ts
import {
  setTelegramWebhook,
  verifyTelegramWebhookSecret,
  parseTelegramUpdate,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramMessageWithButtons,
  askForTelegramLocation,
} from './telegram';
import { OutgoingMessage } from './channel';
```

Add this function above the `export default` block:

```ts
async function deliverToTelegram(env: Env, chatId: string, messages: OutgoingMessage[]): Promise<void> {
  for (const msg of messages) {
    if (msg.type === 'text') {
      await sendTelegramMessage(env, chatId, msg.text);
    } else if (msg.type === 'photo') {
      await sendTelegramPhoto(env, chatId, msg.url, msg.caption);
    } else if (msg.type === 'buttons') {
      await sendTelegramMessageWithButtons(env, chatId, msg.text, msg.buttons);
    } else if (msg.type === 'request_location') {
      await askForTelegramLocation(env, chatId, msg.text);
    }
  }
}
```

- [ ] **Step 2: Wire the adapter into the existing `/telegram-webhook` route**

Find:

```ts
      const id = env.CONVERSATION.idFromName(incoming.chatId);
      const stub = env.CONVERSATION.get(id);
      await stub.fetch('https://conversation/message', {
        method: 'POST',
        body: JSON.stringify(incoming),
      });

      return new Response('ok');
    }
```

Replace with:

```ts
      const id = env.CONVERSATION.idFromName(incoming.chatId);
      const stub = env.CONVERSATION.get(id);
      const doResponse = await stub.fetch('https://conversation/message', {
        method: 'POST',
        body: JSON.stringify(incoming),
      });
      const { messages } = (await doResponse.json()) as { messages: OutgoingMessage[] };
      await deliverToTelegram(env, incoming.chatId, messages);

      return new Response('ok');
    }
```

Also make sure `incoming` now includes `channel: 'telegram'` — find where `parseTelegramUpdate` builds the object in `telegram.ts` (two `return` statements, one for `callback_query`, one for the normal message path) and add `channel: 'telegram'` to both returned object literals:

```ts
    return { chatId: String(callbackQuery.message.chat.id), text: '', callbackData: callbackQuery.data, channel: 'telegram' };
```

```ts
  return { chatId: String(message.chat.id), text: message.text || '', photoFileId, location, channel: 'telegram' };
```

- [ ] **Step 3: Add CORS helper and the `/web-chat` route**

Add near the top of `index.ts`, after the imports:

```ts
const ALLOWED_ORIGINS = ['https://nixgofood.vercel.app', 'http://localhost:3000'];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
```

Add this route inside the `fetch` handler, after the `/telegram-webhook` block and before the final fallback `return`:

```ts
    if (url.pathname === '/web-chat' && request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request.headers.get('Origin')) });
    }

    if (url.pathname === '/web-chat' && request.method === 'POST') {
      const body = (await request.json()) as { sessionId: string; text?: string; callbackData?: string };
      if (!body.sessionId) {
        return new Response(JSON.stringify({ error: 'sessionId requerido' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(request.headers.get('Origin')) },
        });
      }

      const incoming = {
        chatId: body.sessionId,
        text: body.text || '',
        callbackData: body.callbackData,
        channel: 'web' as const,
      };

      const id = env.CONVERSATION.idFromName(incoming.chatId);
      const stub = env.CONVERSATION.get(id);
      const doResponse = await stub.fetch('https://conversation/message', {
        method: 'POST',
        body: JSON.stringify(incoming),
      });
      const { messages } = (await doResponse.json()) as { messages: OutgoingMessage[] };

      return new Response(JSON.stringify({ messages }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request.headers.get('Origin')) },
      });
    }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit` from `AgenteRestaurante/`
Expected: zero output.

- [ ] **Step 5: Local manual test — Telegram path unaffected**

```bash
npm run dev
```

In another terminal:

```bash
curl -s -X POST http://localhost:8787/telegram-webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET del .dev.vars>" \
  -d '{"message":{"chat":{"id":999999},"text":"menu"}}'
```

Expected: HTTP 200 with body `ok`. This alone doesn't prove Telegram delivery worked (that needs the real bot token to actually reach api.telegram.org), but it proves the route didn't crash. Full confirmation happens in Task 4 against the deployed Worker with the real bot.

- [ ] **Step 6: Local manual test — new `/web-chat` route**

```bash
curl -s -X POST http://localhost:8787/web-chat \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"sessionId":"test-session-1","text":"hola"}'
```

Expected: HTTP 200, JSON body shaped like `{"messages":[{"type":"text","text":"..."}]}` (or more entries if the model called tools), and the response headers include `access-control-allow-origin: http://localhost:3000`.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/telegram.ts
git commit -m "Add Telegram delivery adapter and new CORS-enabled /web-chat endpoint"
```

---

### Task 4: Deploy and verify both channels in production

**Files:** none (deploy + manual verification only)

- [ ] **Step 1: Deploy**

```bash
npx wrangler deploy
```

Expected: deploy succeeds, prints a new Version ID.

- [ ] **Step 2: Verify Telegram still works end-to-end (regression check)**

From Telegram (on a phone with mobile data, same as prior verification in this project): send `nuevo pedido`, then `menu`, confirm photos with captions arrive. This confirms Task 2's refactor didn't change Telegram's visible behavior.

- [ ] **Step 3: Verify `/web-chat` against the deployed Worker**

```bash
curl -s -X POST https://agente-taca-nijo.andresdelgado1984.workers.dev/web-chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://nixgofood.vercel.app" \
  -d '{"sessionId":"prod-test-1","text":"hola, que tacos tienen"}'
```

Expected: HTTP 200, `messages` array containing at least one `{"type":"photo", ...}` entry (the Tacos category), because the request went through the same `mostrar_fotos` tool Telegram uses. Note this curl will hit the same network restriction documented earlier in this project if run from the office network (`workers.dev` gets blocked by the local proxy) — run it from mobile data or ask the user to run it if the corporate network blocks it, same workaround already established for this project.

- [ ] **Step 4: No commit** (deployment only, code already committed in Tasks 1-3)

---

### Task 5: NIXGOFOOD — agent URL environment variable

**Files:**
- Modify: `NIXGOFOOD/.env.example`
- Modify: `NIXGOFOOD/.env.local` (local dev only, not committed)

**Interfaces:**
- Produces: `process.env.NEXT_PUBLIC_AGENT_CHAT_URL`, read by the `ChatWidget` component (Task 6).

- [ ] **Step 1: Add the new variable to `.env.example`**

Append to `NIXGOFOOD/.env.example`:

```
# URL del Worker del agente de chat (Telegram + Web)
NEXT_PUBLIC_AGENT_CHAT_URL=https://agente-taca-nijo.andresdelgado1984.workers.dev
```

- [ ] **Step 2: Add the same variable to your local `.env.local`**

```
NEXT_PUBLIC_AGENT_CHAT_URL=https://agente-taca-nijo.andresdelgado1984.workers.dev
```

(Use `http://localhost:8787` here instead if you're running the Worker locally with `npm run dev` in `AgenteRestaurante/` while developing the widget.)

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "Add NEXT_PUBLIC_AGENT_CHAT_URL for the chat widget"
```

(`.env.local` is gitignored — nothing to commit there.)

---

### Task 6: `ChatWidget` component

**Files:**
- Create: `NIXGOFOOD/src/components/ChatWidget.tsx`
- Modify: `NIXGOFOOD/src/app/layout.tsx`

**Interfaces:**
- Consumes: `POST ${process.env.NEXT_PUBLIC_AGENT_CHAT_URL}/web-chat` with body `{ sessionId, text?, callbackData? }`, response `{ messages: OutgoingMessage[] }` where each message is `{type:'text',text} | {type:'photo',url,caption} | {type:'buttons',text,buttons:{text,data}[]}` (the `request_location` variant never reaches web in v1 scope, since delivery is excluded — no need to render it, but don't crash if it appears: render its `text` like a plain text message as a defensive fallback).
- Produces: default export `ChatWidget`, a client component with no required props.

- [ ] **Step 1: Create the component**

Create `NIXGOFOOD/src/components/ChatWidget.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

type OutgoingMessage =
  | { type: 'text'; text: string }
  | { type: 'photo'; url: string; caption: string }
  | { type: 'buttons'; text: string; buttons: { text: string; data: string }[] }
  | { type: 'request_location'; text: string };

interface ChatEntry {
  from: 'user' | 'bot';
  message: OutgoingMessage;
}

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_CHAT_URL || '';
const SESSION_STORAGE_KEY = 'nixgofood_chat_session_id';

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, fresh);
  return fresh;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, loading]);

  async function send(payload: { text?: string; callbackData?: string }) {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/web-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { messages: OutgoingMessage[] };
      setEntries((prev) => [...prev, ...data.messages.map((message) => ({ from: 'bot' as const, message }))]);
    } catch (err) {
      setError('No se pudo enviar, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setEntries((prev) => [...prev, { from: 'user', message: { type: 'text', text } }]);
    setInput('');
    send({ text });
  }

  function handleButtonClick(data: string, label: string) {
    setEntries((prev) => [...prev, { from: 'user', message: { type: 'text', text: label } }]);
    send({ callbackData: data });
  }

  if (!AGENT_URL) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="mb-3 flex h-[28rem] w-80 flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className="flex items-center justify-between rounded-t-xl bg-zinc-800 px-4 py-3">
            <span className="font-semibold text-zinc-100">🌮 Asistente El Taca Nijo</span>
            <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-100" aria-label="Cerrar chat">
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {entries.length === 0 && (
              <p className="text-sm text-zinc-400">¡Hola! Pregúntame por el menú o pide directo aquí 🌮</p>
            )}
            {entries.map((entry, i) => (
              <ChatBubble key={i} entry={entry} onButtonClick={handleButtonClick} />
            ))}
            {loading && <p className="text-xs text-zinc-500">Escribiendo...</p>}
          </div>

          {error && <p className="px-4 pb-1 text-xs text-red-400">{error}</p>}

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-zinc-800 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu mensaje..."
              className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-2xl shadow-lg hover:bg-rose-500"
        aria-label="Abrir chat"
      >
        {open ? '✕' : '🌮'}
      </button>
    </div>
  );
}

function ChatBubble({
  entry,
  onButtonClick,
}: {
  entry: ChatEntry;
  onButtonClick: (data: string, label: string) => void;
}) {
  const align = entry.from === 'user' ? 'ml-auto bg-rose-600 text-white' : 'mr-auto bg-zinc-800 text-zinc-100';
  const msg = entry.message;

  if (msg.type === 'photo') {
    return (
      <div className={`max-w-[85%] rounded-lg ${align} overflow-hidden`}>
        <img src={msg.url} alt={msg.caption} className="h-32 w-full object-cover" />
        <p className="whitespace-pre-wrap p-2 text-sm">{msg.caption}</p>
      </div>
    );
  }

  if (msg.type === 'buttons') {
    return (
      <div className={`max-w-[85%] rounded-lg p-3 text-sm ${align}`}>
        <p className="whitespace-pre-wrap">{msg.text}</p>
        <div className="mt-2 flex gap-2">
          {msg.buttons.map((b) => (
            <button
              key={b.data}
              onClick={() => onButtonClick(b.data, b.text)}
              className="rounded-md bg-zinc-950/40 px-2 py-1 text-xs font-medium hover:bg-zinc-950/60"
            >
              {b.text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 'text' and the defensive 'request_location' fallback both render as plain text.
  return (
    <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg p-3 text-sm ${align}`}>{msg.text}</div>
  );
}
```

- [ ] **Step 2: Wire it into the root layout**

In `NIXGOFOOD/src/app/layout.tsx`, add the import:

```tsx
import ChatWidget from '@/components/ChatWidget';
```

and render it as the last child inside `<AppProvider>`, after `<ModalWrapper />`:

```tsx
            <ModalWrapper />
            <ChatWidget />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` from `NIXGOFOOD/` (or `npm run build` if that's the project's usual check — follow whatever `package.json` already defines).
Expected: zero new errors attributable to `ChatWidget.tsx` or `layout.tsx`.

- [ ] **Step 4: Manual local test**

```bash
npm run dev
```

Open `http://localhost:3000`, click the floating 🌮 button, confirm the panel opens, type "hola" and confirm a reply appears (talking to whichever `NEXT_PUBLIC_AGENT_CHAT_URL` you set in `.env.local` — local Worker or the deployed one).

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatWidget.tsx src/app/layout.tsx
git commit -m "Add floating web chat widget calling the agent's /web-chat endpoint"
```

---

### Task 7: End-to-end order via the web widget

**Files:** none (manual verification only)

- [ ] **Step 1: Place a full pickup + cash order through the widget**

With the widget open (against the deployed Worker), chat through a full order: ask for the menu, add a taco, give a name and phone, choose pickup, choose cash, confirm via the button.

- [ ] **Step 2: Verify the real order landed in Supabase**

```bash
curl -s "https://vcceifjzcurhscdqjnzv.supabase.co/rest/v1/orders?select=order_number,customer_name,delivery_method,payment_method,total,status&business_id=eq.b0000000-0000-0000-0000-000000000001&order=created_at.desc&limit=1" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
```

Expected: the most recent order shows `delivery_method: "pickup"`, `payment_method: "cash"`, and matches the order just placed through the widget.

- [ ] **Step 3: Verify asking for delivery or transfer on web gets redirected, not silently accepted**

In the widget, type "quiero delivery" — expect a reply saying delivery isn't available on web yet and to use Telegram, per the `channelRestriction` prompt line added in Task 2.

- [ ] **Step 4: No commit** (verification only)

---

## Self-Review

**Spec coverage:**
- Floating widget, site-wide, complements manual flow → Task 6.
- Session via `localStorage` UUID → Task 6, Step 1 (`getOrCreateSessionId`).
- `OutgoingMessage` channel abstraction, Telegram adapter, `/web-chat` endpoint, CORS → Tasks 1-3.
- v1 scope (pickup + cash only, delivery/transfer redirected to Telegram) → Task 2 Step 5 (system prompt), Task 7 Step 3 (verification).
- Error handling in the widget (network/5xx failure doesn't break the page) → Task 6 Step 1 (`catch` sets `error`, rest of the page unaffected).
- Testing against local + deployed Worker → Tasks 3-4, 6-7.

**Type consistency:** `OutgoingMessage` is defined once in `AgenteRestaurante/src/channel.ts` (Task 1) and re-declared structurally-identically in `ChatWidget.tsx` (Task 6) since the two are separate repos/deployments with no shared package — the shapes must be kept in sync by hand if either changes later; noted here for future readers rather than solved with a shared package, which would be over-engineering for a two-repo hobby project at this stage.

**No placeholders:** every step above has literal file paths, literal code, and literal commands — none deferred to "add appropriate X".

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-26-web-chat-widget.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
`;