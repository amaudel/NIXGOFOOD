# Table Reservations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the sales agent (Telegram + web chat, same brain) also take table reservations — independent of food orders — with server-side validation against business hours and an owner notification on confirmation.

**Architecture:** A new Supabase table + `create_reservation` RPC (SECURITY DEFINER, same pattern as `create_order`), a parallel `ReservationState` tracked alongside `OrderState` in the same Durable Object, the same confirm/cancel button UX already built for orders, and a direct Telegram notification to the owner on confirmation (bypassing the channel-agnostic `reply()` mechanism on purpose, since the owner is always notified via Telegram regardless of which channel the customer used).

**Tech Stack:** Cloudflare Workers + Durable Objects + TypeScript, Supabase (Postgres + PostgREST), Telegram Bot API. No test runner in this repo — verification is `npx tsc --noEmit` plus manual `curl`/real-channel testing, same as every prior plan here.

**Spec:** `docs/superpowers/specs/2026-08-26-table-reservations-design.md`

## Global Constraints

- v1 has no capacity/table-count limit — any reservation inside business hours is accepted.
- No new NIXGOFOOD admin screen in this plan — owner visibility is a direct Telegram message only.
- Never change Telegram's existing order-flow behavior.
- **Known, accepted v1 limitation** (documented, not engineered around): once a food order is confirmed (`order.status === 'placed'`), the existing code intercepts every message in that conversation with a status reply until the customer types "nuevo pedido" — this also blocks starting a NEW reservation in the same conversation until that reset happens. A reservation started BEFORE the food order is confirmed is unaffected (the two are tracked independently the whole time up to that point). This is a real, narrow interaction gap between two independently-built features; fixing it properly would mean redesigning the existing, well-tested order-status gate, which carries regression risk to Telegram's current behavior — out of scope for this plan. Reservations made before the order-lock kicks in work exactly as designed.
- Reservation confirm/cancel button `callback_data` values are `confirm_reservation` / `cancel_reservation` — distinct from the order's `confirm_order` / `cancel_order` so the two flows never collide.

---

### Task 1: Apply the Supabase schema

**Files:** none (SQL run directly against production Supabase by the user via the SQL Editor — same established pattern as every prior schema change in this project. No code in this repo changes for this task.)

- [ ] **Step 1: Run this SQL in the Supabase SQL Editor**

```sql
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    party_size INT NOT NULL CHECK (party_size > 0),
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    special_request TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
-- Deliberately zero public policies: nobody can read or write this table with the
-- public key directly. The only door in is the SECURITY DEFINER RPC below, same
-- model as create_order.

CREATE OR REPLACE FUNCTION create_reservation(p_payload JSONB)
RETURNS JSONB AS $$
DECLARE
  v_business_id UUID; v_branch_id UUID; v_business_active BOOLEAN;
  v_customer_name TEXT; v_customer_phone TEXT;
  v_party_size INT; v_reservation_date DATE; v_reservation_time TIME;
  v_special_request TEXT;
  v_day_of_week INT; v_open_time TIME; v_close_time TIME; v_closed BOOLEAN;
  v_reservation_id UUID; v_created_at TIMESTAMPTZ;
BEGIN
  v_business_id := (p_payload->>'businessId')::UUID;
  v_branch_id := (p_payload->>'branchId')::UUID;

  SELECT active INTO v_business_active FROM businesses WHERE id = v_business_id;
  IF v_business_active IS NOT TRUE THEN RAISE EXCEPTION 'El negocio no existe o no se encuentra activo.'; END IF;

  v_customer_name := TRIM(p_payload->'customer'->>'name');
  v_customer_phone := TRIM(p_payload->'customer'->>'phone');
  IF LENGTH(v_customer_name) = 0 OR LENGTH(v_customer_phone) < 7 THEN
    RAISE EXCEPTION 'Ingresa un nombre y teléfono válidos.';
  END IF;

  v_party_size := (p_payload->>'partySize')::INT;
  IF v_party_size IS NULL OR v_party_size <= 0 THEN
    RAISE EXCEPTION 'El número de personas debe ser mayor a 0.';
  END IF;

  v_reservation_date := (p_payload->>'date')::DATE;
  v_reservation_time := (p_payload->>'time')::TIME;
  IF v_reservation_date IS NULL OR v_reservation_time IS NULL THEN
    RAISE EXCEPTION 'Fecha u hora inválida.';
  END IF;
  IF (v_reservation_date + v_reservation_time) < clock_timestamp() THEN
    RAISE EXCEPTION 'No se puede reservar en una fecha u hora que ya pasó.';
  END IF;

  v_day_of_week := EXTRACT(DOW FROM v_reservation_date);
  SELECT open_time, close_time, closed INTO v_open_time, v_close_time, v_closed
  FROM business_hours WHERE branch_id = v_branch_id AND day_of_week = v_day_of_week;

  IF v_open_time IS NULL OR v_closed IS TRUE THEN
    RAISE EXCEPTION 'El restaurante está cerrado ese día.';
  END IF;
  IF v_reservation_time < v_open_time OR v_reservation_time > v_close_time THEN
    RAISE EXCEPTION 'Esa hora está fuera de nuestro horario de atención (% - %).', v_open_time, v_close_time;
  END IF;

  v_special_request := p_payload->>'specialRequest';

  INSERT INTO reservations (
    business_id, branch_id, customer_name, customer_phone, party_size,
    reservation_date, reservation_time, special_request, status
  ) VALUES (
    v_business_id, v_branch_id, v_customer_name, v_customer_phone, v_party_size,
    v_reservation_date, v_reservation_time, v_special_request, 'confirmed'
  ) RETURNING id, created_at INTO v_reservation_id, v_created_at;

  RETURN jsonb_build_object(
    'id', v_reservation_id,
    'partySize', v_party_size,
    'date', v_reservation_date,
    'time', v_reservation_time,
    'createdAt', v_created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_reservation(JSONB) TO public, anon, authenticated;
```

- [ ] **Step 2: Verify the function exists and is callable**

Run this in the SQL Editor to confirm the function was created:

```sql
select pg_get_functiondef('create_reservation(jsonb)'::regprocedure);
```

Expected: prints the function body back (confirms it compiled and registered).

---

### Task 2: `ReservationState` type + owner-chat-id secret slot

**Files:**
- Modify: `AgenteRestaurante/src/types.ts`

**Interfaces:**
- Produces: `ReservationState` (exported interface), `Env.OWNER_TELEGRAM_CHAT_ID: string`.

- [ ] **Step 1: Add the field to `Env`**

In `AgenteRestaurante/src/types.ts`, find:

```ts
export interface Env {
  CONVERSATION: DurableObjectNamespace;
  OPENAI_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  BUSINESS_ID: string;
  BRANCH_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;
}
```

Add one line so it reads:

```ts
export interface Env {
  CONVERSATION: DurableObjectNamespace;
  OPENAI_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  BUSINESS_ID: string;
  BRANCH_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OWNER_TELEGRAM_CHAT_ID: string;
}
```

- [ ] **Step 2: Add the `ReservationState` interface**

In the same file, add this new interface right after the closing brace of `OrderState` (end of file):

```ts

export interface ReservationState {
  status: 'building' | 'placed';
  partySize?: number;
  date?: string; // 'YYYY-MM-DD'
  time?: string; // 'HH:MM'
  customerName?: string;
  customerPhone?: string;
  specialRequest?: string;
  reservationId?: string;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` from `AgenteRestaurante/`
Expected: a NEW error appears complaining that `.dev.vars` / the deployed Worker doesn't provide `OWNER_TELEGRAM_CHAT_ID` — that's not a `tsc` error (env var presence isn't type-checked), so expected output is actually **zero errors** here; `ReservationState` is a new unused export at this point, which is not a `tsc` error either (no `noUnusedLocals`/`noUnusedExports` configured in `tsconfig.json`).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "Add ReservationState type and OWNER_TELEGRAM_CHAT_ID to Env"
```

---

### Task 3: `src/reservations.ts`

**Files:**
- Create: `AgenteRestaurante/src/reservations.ts`

**Interfaces:**
- Consumes: `Env`, `ReservationState` from `./types` (Task 2); `sendTelegramMessage(env, chatId, text): Promise<void>` from `./telegram` (already exists, unchanged).
- Produces: `PlaceReservationResult` (exported interface: `{ reservationId: string; partySize: number; date: string; time: string }`), `placeReservation(env: Env, reservation: ReservationState): Promise<PlaceReservationResult>`, `notifyOwnerOfReservation(env: Env, reservation: ReservationState, result: PlaceReservationResult): Promise<void>`.

- [ ] **Step 1: Write the file**

Create `AgenteRestaurante/src/reservations.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { Env, ReservationState } from './types';
import { sendTelegramMessage } from './telegram';

export interface PlaceReservationResult {
  reservationId: string;
  partySize: number;
  date: string;
  time: string;
}

export async function placeReservation(env: Env, reservation: ReservationState): Promise<PlaceReservationResult> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const payload = {
    businessId: env.BUSINESS_ID,
    branchId: env.BRANCH_ID,
    customer: {
      name: reservation.customerName,
      phone: reservation.customerPhone,
    },
    partySize: reservation.partySize,
    date: reservation.date,
    time: reservation.time,
    specialRequest: reservation.specialRequest,
  };

  const { data, error } = await supabase.rpc('create_reservation', { p_payload: payload });
  if (error) throw new Error(error.message);

  return {
    reservationId: data.id,
    partySize: data.partySize,
    date: data.date,
    time: data.time,
  };
}

export async function notifyOwnerOfReservation(
  env: Env,
  reservation: ReservationState,
  result: PlaceReservationResult
): Promise<void> {
  const text = `🍽️ *Nueva reserva*\n${result.partySize} persona(s)\nFecha: ${result.date}\nHora: ${result.time}\nCliente: ${reservation.customerName} / ${reservation.customerPhone}${
    reservation.specialRequest ? `\nPetición especial: ${reservation.specialRequest}` : ''
  }`;
  await sendTelegramMessage(env, env.OWNER_TELEGRAM_CHAT_ID, text);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` from `AgenteRestaurante/`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/reservations.ts
git commit -m "Add src/reservations.ts: create_reservation RPC call + owner notification"
```

---

### Task 4: Wire reservations into `ConversationAgent`

**Files:**
- Modify: `AgenteRestaurante/src/agent.ts`

**Interfaces:**
- Consumes: `ReservationState` from `./types` (Task 2); `placeReservation`, `notifyOwnerOfReservation`, `PlaceReservationResult` from `./reservations` (Task 3).
- Produces: nothing new consumed by later tasks — this is the last code task.

This is the biggest task. It mirrors the exact patterns already in this file for orders (`emptyOrder`/`getMissingFieldsForConfirm`/`orderSummaryText`/`sendConfirmSummary`/`doConfirmOrder`) with a parallel, independent reservation flow.

- [ ] **Step 1: Update imports**

At the top of `AgenteRestaurante/src/agent.ts`, find:

```ts
import { Env, Menu, OrderState } from './types';
```

Change to:

```ts
import { Env, Menu, OrderState, ReservationState } from './types';
```

Find:

```ts
import { placeOrder, getOrderStatus } from './orders';
```

Add a new line right after it:

```ts
import { placeReservation, notifyOwnerOfReservation } from './reservations';
```

- [ ] **Step 2: Add reservation helper functions**

Find the `emptyOrder` function:

```ts
function emptyOrder(): OrderState {
  return { items: [], status: 'building' };
}
```

Add these three new functions right after it (before `getMissingFieldsForConfirm`):

```ts
function emptyReservation(): ReservationState {
  return { status: 'building' };
}

function getMissingFieldsForReservation(reservation: ReservationState): string[] {
  const missing: string[] = [];
  if (!reservation.date) missing.push('fecha de la reserva');
  if (!reservation.time) missing.push('hora de la reserva');
  if (!reservation.partySize) missing.push('número de personas');
  if (!reservation.customerName) missing.push('nombre del cliente');
  if (!reservation.customerPhone) missing.push('teléfono del cliente');
  return missing;
}

function reservationSummaryText(reservation: ReservationState): string {
  const lines: string[] = [];
  lines.push(`Fecha: ${reservation.date || '(falta)'}`);
  lines.push(`Hora: ${reservation.time || '(falta)'}`);
  lines.push(`Personas: ${reservation.partySize || '(falta)'}`);
  lines.push(`Cliente: ${reservation.customerName || '(falta)'} / Tel: ${reservation.customerPhone || '(falta)'}`);
  if (reservation.specialRequest) lines.push(`Petición especial: ${reservation.specialRequest}`);
  return lines.join('\n');
}
```

- [ ] **Step 3: Add the two new tools**

Find the closing `];` of the `TOOLS` array (right after the `confirmar_pedido` tool definition). The array currently ends like this:

```ts
  {
    type: 'function',
    function: {
      name: 'confirmar_pedido',
      description:
        'Crea el pedido de verdad en el sistema del restaurante - esto es IRREVERSIBLE y le cobra al cliente. Es un respaldo por si el cliente prefiere escribir en vez de tocar el botón "✅ Confirmar pedido". SOLO llamar cuando el ÚLTIMO mensaje del cliente sea una confirmación explícita e inequívoca de que quiere finalizar la compra AHORA MISMO (ej: "confirmo", "sí, confírmalo", "dale, así está bien", "eso es todo, procede"), y solo después de haber llamado ya a mostrar_resumen_para_confirmar en algún turno anterior. Tener todos los datos completos NO es motivo para llamar esta función por tu cuenta.',
      parameters: { type: 'object', properties: {} },
    },
  },
];
```

Insert two new tool entries before the final `];`, so it reads:

```ts
  {
    type: 'function',
    function: {
      name: 'confirmar_pedido',
      description:
        'Crea el pedido de verdad en el sistema del restaurante - esto es IRREVERSIBLE y le cobra al cliente. Es un respaldo por si el cliente prefiere escribir en vez de tocar el botón "✅ Confirmar pedido". SOLO llamar cuando el ÚLTIMO mensaje del cliente sea una confirmación explícita e inequívoca de que quiere finalizar la compra AHORA MISMO (ej: "confirmo", "sí, confírmalo", "dale, así está bien", "eso es todo, procede"), y solo después de haber llamado ya a mostrar_resumen_para_confirmar en algún turno anterior. Tener todos los datos completos NO es motivo para llamar esta función por tu cuenta.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'actualizar_reserva',
      description:
        'Reemplaza el estado completo de la reserva de mesa en construcción - es independiente del pedido de comida (el cliente puede pedir comida Y reservar mesa en la misma conversación, ninguna depende de la otra). Llamar cada vez que el cliente dé o cambie un dato de su reserva: fecha, hora, número de personas, nombre, teléfono, o petición especial.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Fecha de la reserva en formato YYYY-MM-DD' },
          time: { type: 'string', description: 'Hora de la reserva en formato HH:MM (24 horas)' },
          partySize: { type: 'integer', minimum: 1, description: 'Número de personas' },
          customerName: { type: 'string' },
          customerPhone: { type: 'string' },
          specialRequest: {
            type: 'string',
            description: 'Petición especial del cliente (opcional), ej. "mesa junto a la ventana" o "es un cumpleaños".',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_reserva',
      description:
        'Crea la reserva de mesa de verdad en el sistema del restaurante - esto es IRREVERSIBLE. Es un respaldo por si el cliente prefiere escribir en vez de tocar el botón "✅ Confirmar reserva". SOLO llamar cuando el ÚLTIMO mensaje del cliente sea una confirmación explícita e inequívoca (ej: "confirmo", "sí, confírmala", "dale, así está bien"). Tener todos los datos completos NO es motivo para llamar esta función por tu cuenta.',
      parameters: { type: 'object', properties: {} },
    },
  },
];
```

- [ ] **Step 4: Update `buildSystemPrompt` to accept and describe reservation state**

Find the function signature:

```ts
function buildSystemPrompt(menu: Menu, order: OrderState, channel: 'telegram' | 'web'): string {
```

Change to:

```ts
function buildSystemPrompt(menu: Menu, order: OrderState, reservation: ReservationState, channel: 'telegram' | 'web'): string {
```

Find point 9 and the text right after it (end of the numbered list, right before `Menú disponible:`):

```ts
9. Nunca inventes que un pedido fue creado - solo confírmalo después de que la función confirmar_pedido te devuelva éxito.

Menú disponible:
${menuToPromptText(menu)}

Estado actual del pedido:
${orderSummaryText(order)}`;
}
```

Change to:

```ts
9. Nunca inventes que un pedido fue creado - solo confírmalo después de que la función confirmar_pedido te devuelva éxito.
10. Además de vender comida, también ayudas a RESERVAR MESA - es algo totalmente independiente del pedido de comida (ninguna de las dos depende de la otra; un cliente puede hacer solo una, la otra, o ambas). Si el cliente quiere reservar, pídele fecha, hora, número de personas, nombre y teléfono (la petición especial es opcional), y llama a actualizar_reserva con cada dato que te dé, siempre con el estado COMPLETO de la reserva hasta ahora. El sistema manda automáticamente el resumen con botones de Confirmar/Cancelar en cuanto la reserva tenga todos los datos obligatorios completos - no necesitas llamar ninguna función para eso, ni escribir tú el resumen en texto.

Menú disponible:
${menuToPromptText(menu)}

Estado actual del pedido:
${orderSummaryText(order)}

Estado actual de la reserva de mesa (independiente del pedido):
${reservationSummaryText(reservation)}`;
}
```

- [ ] **Step 5: Load and persist `reservation` state in `fetch()`**

Find, near the top of `fetch()`:

```ts
    const history: ChatMessage[] = (await this.state.storage.get('history')) || [];
    let order: OrderState = (await this.state.storage.get('order')) || emptyOrder();
    let menu: Menu | undefined = await this.state.storage.get('menu');
```

Change to:

```ts
    const history: ChatMessage[] = (await this.state.storage.get('history')) || [];
    let order: OrderState = (await this.state.storage.get('order')) || emptyOrder();
    let reservation: ReservationState = (await this.state.storage.get('reservation')) || emptyReservation();
    let menu: Menu | undefined = await this.state.storage.get('menu');
```

- [ ] **Step 6: Add a "nueva reserva" reset command**

Find:

```ts
    if (text.trim().toLowerCase() === 'nuevo pedido') {
      order = emptyOrder();
      await this.state.storage.put('order', order);
      await this.state.storage.put('history', []);
      this.reply({ type: 'text', text: '¡Listo! Empecemos un pedido nuevo. ¿Qué se te antoja hoy?' });
      return this.finish();
    }
```

Add a new block right after it:

```ts

    if (text.trim().toLowerCase() === 'nueva reserva') {
      reservation = emptyReservation();
      await this.state.storage.put('reservation', reservation);
      this.reply({ type: 'text', text: '¡Listo! Empecemos una reserva nueva. ¿Para cuándo y cuántas personas?' });
      return this.finish();
    }
```

(Note: unlike "nuevo pedido", this does NOT clear `history` — the order/menu conversation context should keep flowing normally; only the reservation-in-progress fields reset.)

- [ ] **Step 7: Add `confirm_reservation` / `cancel_reservation` button handling**

Find the existing `cancel_order` / `confirm_order` blocks:

```ts
    if (callbackData === 'cancel_order') {
      if (order.status === 'placed') {
        this.reply({ type: 'text', text: 'Ese pedido ya está confirmado y no se puede cancelar desde aquí.' });
        return this.finish();
      }
      order = emptyOrder();
      await this.state.storage.put('order', order);
      await this.state.storage.put('history', []);
      this.reply({ type: 'text', text: 'Pedido cancelado. Si quieres empezar de nuevo, dime qué se te antoja 🌮' });
      return this.finish();
    }

    if (callbackData === 'confirm_order') {
      if (order.status === 'placed') {
        this.reply({ type: 'text', text: `Ese pedido ya estaba confirmado (${order.orderNumber}).` });
        return this.finish();
      }
      const result = await this.doConfirmOrder(order);
      await this.state.storage.put('order', result.order);
      if (result.order.status !== 'placed') {
        // doConfirmOrder no manda mensaje propio cuando falla - avisamos aquí.
        this.reply({ type: 'text', text: `No se pudo confirmar: ${result.resultText}` });
      }
      return this.finish();
    }
```

Add two new blocks right after them (before the `if (order.status === 'placed')` block):

```ts

    if (callbackData === 'cancel_reservation') {
      if (reservation.status === 'placed') {
        this.reply({ type: 'text', text: 'Esa reserva ya está confirmada y no se puede cancelar desde aquí.' });
        return this.finish();
      }
      reservation = emptyReservation();
      await this.state.storage.put('reservation', reservation);
      this.reply({ type: 'text', text: 'Reserva cancelada. Si quieres intentar de nuevo, dime para cuándo y cuántas personas.' });
      return this.finish();
    }

    if (callbackData === 'confirm_reservation') {
      if (reservation.status === 'placed') {
        this.reply({ type: 'text', text: 'Esa reserva ya estaba confirmada.' });
        return this.finish();
      }
      const result = await this.doConfirmReservation(reservation);
      await this.state.storage.put('reservation', result.reservation);
      if (result.reservation.status !== 'placed') {
        this.reply({ type: 'text', text: `No se pudo confirmar la reserva: ${result.resultText}` });
      }
      return this.finish();
    }
```

- [ ] **Step 8: Thread `reservation` through the `buildSystemPrompt` call site and persist it at the end of `fetch()`**

Find:

```ts
      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(menu, order, channel) },
        ...history,
      ];
```

Change to:

```ts
      const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(menu, order, reservation, channel) },
        ...history,
      ];
```

Find, near the end of `fetch()`:

```ts
      for (const toolCall of msg.tool_calls) {
        if (toolCall.type !== 'function') continue;
        const result = await this.runTool(toolCall, menu, order);
        order = result.order;
        history.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.resultText,
        } as ChatMessage);
      }
    }

    await this.state.storage.put('order', order);
    await this.state.storage.put('history', history.slice(-40));
```

Change to:

```ts
      for (const toolCall of msg.tool_calls) {
        if (toolCall.type !== 'function') continue;
        const result = await this.runTool(toolCall, menu, order, reservation);
        order = result.order;
        reservation = result.reservation;
        history.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.resultText,
        } as ChatMessage);
      }
    }

    await this.state.storage.put('order', order);
    await this.state.storage.put('reservation', reservation);
    await this.state.storage.put('history', history.slice(-40));
```

- [ ] **Step 9: Update `runTool`'s signature and add the two new branches**

Find:

```ts
  private async runTool(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall,
    menu: Menu,
    order: OrderState
  ): Promise<{ order: OrderState; resultText: string }> {
    const args = JSON.parse(toolCall.function.arguments || '{}');
```

Change to:

```ts
  private async runTool(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall,
    menu: Menu,
    order: OrderState,
    reservation: ReservationState
  ): Promise<{ order: OrderState; reservation: ReservationState; resultText: string }> {
    const args = JSON.parse(toolCall.function.arguments || '{}');
```

Every existing `return { order, resultText: ... }` or `return { order: newOrder, resultText: ... }` inside this method must now also carry `reservation` unchanged (since those branches don't touch it). Update every one of the following returns (they exist today at the end of the `mostrar_fotos`, `actualizar_pedido` (3 return sites: the unmatched-products early return, the just-completed-order return, and the final return), `mostrar_resumen_para_confirmar`, and `confirmar_pedido` branches, plus the final `Herramienta desconocida.` fallback) by adding `reservation,` to each returned object literal. For example, find:

```ts
      if (productsToShow.length === 0) {
        return { order, resultText: 'No se encontraron productos con foto para eso. Dile al cliente qué opciones reales existen en el menú.' };
      }
```

change to:

```ts
      if (productsToShow.length === 0) {
        return { order, reservation, resultText: 'No se encontraron productos con foto para eso. Dile al cliente qué opciones reales existen en el menú.' };
      }
```

Apply that same mechanical addition (`reservation,` right after `order` or `order: newOrder`) to every other `return { order..., resultText: ... }` statement inside `runTool` — there are 6 more (7 total including the one shown above): the end of `mostrar_fotos`'s success path, the unmatched-items branch in `actualizar_pedido`, the auto-summary branch in `actualizar_pedido`, the final `actualizar_pedido` return, `mostrar_resumen_para_confirmar`'s missing-fields branch, and `mostrar_resumen_para_confirmar`'s success branch. Do NOT touch the `confirmar_pedido` branch or the final `return { order, resultText: 'Herramienta desconocida.' };` line yet — Step 10 replaces both of those together in one block, and if you edit the "Herramienta desconocida" line here first, Step 10's `Find` text below won't match anymore.

- [ ] **Step 10: Update the `confirmar_pedido` branch's return and add the two new tool branches**

Find:

```ts
    if (toolCall.function.name === 'confirmar_pedido') {
      return this.doConfirmOrder(order);
    }

    return { order, resultText: 'Herramienta desconocida.' };
  }
```

Change to:

```ts
    if (toolCall.function.name === 'confirmar_pedido') {
      const result = await this.doConfirmOrder(order);
      return { ...result, reservation };
    }

    if (toolCall.function.name === 'actualizar_reserva') {
      const newReservation: ReservationState = { ...reservation };
      if (args.date) newReservation.date = args.date;
      if (args.time) newReservation.time = args.time;
      if (args.partySize) newReservation.partySize = args.partySize;
      if (args.customerName) newReservation.customerName = args.customerName;
      if (args.customerPhone) newReservation.customerPhone = args.customerPhone;
      if (args.specialRequest) newReservation.specialRequest = args.specialRequest;

      if (getMissingFieldsForReservation(newReservation).length === 0) {
        this.sendConfirmReservationSummary(newReservation);
        return {
          order,
          reservation: newReservation,
          resultText:
            'La reserva está completa. Ya se mandó automáticamente el resumen con botones de Confirmar/Cancelar - no repitas el resumen, no llames a ninguna función más, solo responde algo breve.',
        };
      }

      return { order, reservation: newReservation, resultText: `Reserva actualizada:\n${reservationSummaryText(newReservation)}` };
    }

    if (toolCall.function.name === 'confirmar_reserva') {
      const result = await this.doConfirmReservation(reservation);
      return { order, ...result };
    }

    return { order, reservation, resultText: 'Herramienta desconocida.' };
  }
```

- [ ] **Step 11: Add `sendConfirmReservationSummary` and `doConfirmReservation` methods**

Find the existing `sendConfirmSummary` and `doConfirmOrder` methods (near the bottom of the class). Add these two new methods right after `doConfirmOrder`'s closing brace (i.e., just before the class's final closing `}`):

```ts

  private sendConfirmReservationSummary(reservation: ReservationState): void {
    this.reply({
      type: 'buttons',
      text: `*Resumen de tu reserva:*\n${reservationSummaryText(reservation)}\n\n¿Confirmas tu reserva así?`,
      buttons: [
        { text: '✅ Confirmar reserva', data: 'confirm_reservation' },
        { text: '❌ Cancelar', data: 'cancel_reservation' },
      ],
    });
  }

  private async doConfirmReservation(reservation: ReservationState): Promise<{ reservation: ReservationState; resultText: string }> {
    const missing = getMissingFieldsForReservation(reservation);
    if (missing.length > 0) {
      return { reservation, resultText: `No se pudo confirmar. Falta: ${missing.join(', ')}. Pide esos datos al cliente.` };
    }

    try {
      const finalReservation: ReservationState = { ...reservation };
      const result = await placeReservation(this.env, finalReservation);
      const placedReservation: ReservationState = {
        ...finalReservation,
        status: 'placed',
        reservationId: result.reservationId,
      };

      this.reply({
        type: 'text',
        text: `✅ *Reserva confirmada*\nFecha: ${result.date}\nHora: ${result.time}\n${result.partySize} persona(s)\n\n¡Te esperamos!`,
      });

      await notifyOwnerOfReservation(this.env, finalReservation, result);

      return {
        reservation: placedReservation,
        resultText: 'Reserva creada con éxito. Ya se le mandó el resumen al cliente por separado - tú solo responde algo breve y cálido, NO repitas el resumen de nuevo.',
      };
    } catch (err: any) {
      return { reservation, resultText: `Error al crear la reserva: ${err.message}. Informa al cliente que hubo un problema técnico y que lo intente de nuevo en un momento.` };
    }
  }
```

- [ ] **Step 12: Type-check**

Run: `npx tsc --noEmit` from `AgenteRestaurante/`
Expected: zero errors. If you see an error about a `return` inside `runTool` missing the `reservation` property, that means one of the return sites from Step 9 was missed — search the whole method body for `resultText:` and make sure every object literal that's returned includes `reservation` (or `reservation: newReservation` where that's the locally-scoped variable in that branch).

- [ ] **Step 13: Local manual test — reservation flow via `/telegram-webhook`**

Start the dev server:

```bash
npm run dev
```

In another terminal, simulate a full reservation conversation (four separate requests against the SAME `chat.id` so the Durable Object keeps state across turns):

```bash
SECRET=$(grep TELEGRAM_WEBHOOK_SECRET .dev.vars | cut -d= -f2)

curl -s -X POST http://localhost:8787/telegram-webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $SECRET" \
  -d '{"message":{"chat":{"id":555555},"text":"quiero reservar mesa para 4 personas manana a las 19:00, me llamo Ana, mi telefono es 0991112222"}}'
```

Expected: HTTP 200 `ok`. Check the terminal running `npm run dev` for any thrown errors (there should be none). This alone can't prove a reply reached Telegram (needs the real bot token to reach api.telegram.org, which the local network in this project has historically blocked — see README) — that end-to-end proof happens in Task 6.

- [ ] **Step 14: Commit**

```bash
git add src/agent.ts
git commit -m "Wire table reservations into ConversationAgent (actualizar_reserva/confirmar_reserva, auto-confirm summary, owner notification)"
```

---

### Task 5: Gather the owner's Telegram chat id, upload the secret, and deploy

**Files:** none (deploy + secret upload only)

- [ ] **Step 1: Get the owner's numeric Telegram chat id**

Ask the restaurant owner to open Telegram, search for **@userinfobot** (a well-known public bot for exactly this), send it any message, and read back the numeric `Id` field it replies with.

- [ ] **Step 2: Upload the new secret**

```bash
echo -n "<the numeric chat id from Step 1>" | npx wrangler secret put OWNER_TELEGRAM_CHAT_ID
```

Expected output: `✨ Success! Uploaded secret OWNER_TELEGRAM_CHAT_ID`

- [ ] **Step 3: Deploy**

```bash
npx wrangler deploy
```

Expected: deploy succeeds, prints a new Version ID.

- [ ] **Step 4: No commit** (secret upload + deploy only; code already committed in Tasks 2-4)

---

### Task 6: End-to-end verification

**Files:** none (manual verification only)

- [ ] **Step 1: Reserve a table via Telegram**

From a phone (same network workaround as every prior Telegram test in this project — mobile data, not the office network, if the office network blocks `api.telegram.org`/`*.workers.dev`): message the bot a full reservation (date, time, party size, name, phone), confirm you get the summary with "✅ Confirmar reserva" / "❌ Cancelar" buttons, tap Confirm, and confirm you get the "✅ Reserva confirmada" message.

- [ ] **Step 2: Confirm the owner notification arrived**

Check the Telegram account tied to the chat id from Task 5, Step 1 — confirm the "🍽️ Nueva reserva" message arrived with the right details.

- [ ] **Step 3: Confirm the row landed in Supabase**

```bash
curl -s "https://vcceifjzcurhscdqjnzv.supabase.co/rest/v1/reservations?select=customer_name,party_size,reservation_date,reservation_time,status&business_id=eq.b0000000-0000-0000-0000-000000000001&order=created_at.desc&limit=1" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
```

Expected: an empty array `[]`, NOT a row — because the `reservations` table deliberately has zero public read policies (see Task 1). This confirms the lockdown is working as designed; to actually inspect the row, use the Supabase Table Editor (which bypasses RLS) instead.

- [ ] **Step 4: Repeat via the web chat widget**

Open the storefront (`https://nixgofood.vercel.app`, from a network that isn't blocking `*.workers.dev`), open the chat widget, and reserve a table the same way. Confirm the same summary/buttons/confirmation/owner-notification flow works there too — this is the whole point of the shared "brain": no reservation-specific code exists per-channel.

- [ ] **Step 5: Confirm a food order still works unaffected (regression check)**

In a **fresh** conversation (new session id for web, or "nuevo pedido" on an existing Telegram chat that has no reservation in progress), place a normal pickup + cash food order end-to-end. Confirm it still works exactly as before this plan's changes — this is the check for the "never break Telegram" / "never break existing orders" constraint.

- [ ] **Step 6: No commit** (verification only)

---

## Self-Review

**Spec coverage:**
- New `reservations` table + RLS lockdown + `create_reservation` RPC validated against `business_hours` → Task 1.
- `ReservationState` parallel to `OrderState`, independent tracking → Tasks 2, 4.
- Same confirm/cancel button UX as orders, distinct `callback_data` values → Task 4 (Steps 3, 7, 11).
- Owner notification via direct Telegram message, bypassing the channel-agnostic `reply()` → Task 3, Task 4 Step 11.
- No capacity limit, no admin panel screen → not built anywhere in this plan (correctly absent).
- Works from both Telegram and web chat (shared brain) → inherent in the design (no channel-specific reservation code anywhere), verified explicitly in Task 6 Steps 1 and 4.
- "Verify real schema before writing the RPC" → already done in this session (business_hours confirmed to use `closed`, not `is_closed`) — Task 1's SQL already reflects the real column name, so no separate verification step needed in the plan itself.

**Type consistency:** `runTool`'s return type changed from `{ order, resultText }` to `{ order, reservation, resultText }` — every existing return site in that method must be updated (Step 9 lists all of them explicitly by location rather than leaving any as "similar to the others"). `doConfirmReservation` returns `{ reservation, resultText }` (no `order` — mirrors `doConfirmOrder` returning `{ order, resultText }` with no `reservation`), and both call sites that consume it (`confirmar_reserva` tool branch, `confirm_reservation` button handler) correctly merge in the sibling field they need (`order` in Step 10's tool branch, nothing extra needed in Step 7's button handler since it already has `order` in scope untouched).

**No placeholders:** every step has literal file contents, literal SQL, or literal commands — the one spot that describes a mechanical repeated edit (Step 9's "apply the same addition to 6 more return sites") names every one of those six sites by which branch and position they're in, rather than leaving them to guesswork.
