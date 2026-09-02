# Agente multi-tenant (chat web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared Cloudflare Worker agent resolve the correct business/branch per request for the web-chat channel, so every real NIXGOFOOD business (not just El Taca Nijo) gets its own menu, orders, and reservations through the chat widget.

**Architecture:** NIXGOFOOD's `/api/agent-chat` proxy route already knows which business a visitor belongs to (middleware resolves it by subdomain); it now forwards that `businessId` to the Worker. The Worker resolves the business's active branch from Supabase once per conversation, stores both as `ConversationAgent` instance fields, and threads them into every menu/order/reservation call instead of reading its fixed `BUSINESS_ID`/`BRANCH_ID` secrets (which stay exactly as-is for the Telegram channel, untouched).

**Tech Stack:** Cloudflare Workers + Durable Objects (TypeScript), Next.js Route Handlers, Supabase (PostgREST via `@supabase/supabase-js`).

**Spec:** `docs/superpowers/specs/2026-09-02-agent-multi-tenant-design.md`

## Global Constraints

- Zero Supabase schema/RLS changes — the `branches` table and its public "active-only" read policy already exist and already support this.
- Telegram channel (El Taca Nijo only) must behave identically after this plan — no regression, no code path changes for `channel === 'telegram'` beyond reading `this.businessId`/`this.branchId` instead of `this.env.BUSINESS_ID`/`this.env.BRANCH_ID` directly (same values, for Telegram).
- El Taca Nijo's web chat must behave identically after this plan — same menu, same order/reservation flow, same owner Telegram notification on reservation confirm.
- Owner Telegram notification on reservation confirm stays exclusive to El Taca Nijo: only fires when the resolved `businessId` equals `env.BUSINESS_ID` (El Taca Nijo's own fixed id) and `env.OWNER_TELEGRAM_CHAT_ID` is set. No other business gets any real-time notification in this plan — that's an intentional, explicitly-decided scope cut, not a gap to fill.
- One active branch is assumed per business. `resolveBranchId` takes the first active branch found for a `business_id` and throws a clear error if none exists — this is correct, intended failure behavior for a business with incomplete setup data, not a bug to route around.
- The Demo environment (`NEXT_PUBLIC_DEMO_MODE=true`) is out of scope entirely — it doesn't use subdomain-based business resolution and isn't touched by this plan.
- Same single Worker (`agente-taca-nijo`), same `wrangler deploy` — no new Cloudflare resources.

---

### Task 1: NIXGOFOOD proxy resolves and forwards `businessId`

**Files:**
- Modify: `src/app/api/agent-chat/route.ts`

**Interfaces:**
- Consumes: `getResolvedBusinessId(): Promise<string | null>` from `@/lib/tenant` (already exists and is already used the same way in `src/app/api/orders/lookup/route.ts:74`).
- Produces: the JSON body this route forwards to the Worker's `/web-chat` now always includes `businessId: string` (in addition to whatever fields the browser sent: `sessionId`, `text`, `callbackData`). Task 2 consumes this field.

- [ ] **Step 1: Add the businessId resolution and forwarding**

Find this exact current content in `src/app/api/agent-chat/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getClientIp, checkRateLimit } from '@/lib/security/rateLimiter';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_CHAT_URL || '';
```

Change to:

```ts
import { NextResponse } from 'next/server';
import { getClientIp, checkRateLimit } from '@/lib/security/rateLimiter';
import { getResolvedBusinessId } from '@/lib/tenant';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_CHAT_URL || '';
```

Find this exact current content (later in the same file):

```ts
    if (!AGENT_URL) {
      return NextResponse.json({ error: 'Chat no disponible.' }, { status: 503 });
    }

    const body = await request.json();

    const agentRes = await fetch(`${AGENT_URL}/web-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
```

Change to:

```ts
    if (!AGENT_URL) {
      return NextResponse.json({ error: 'Chat no disponible.' }, { status: 503 });
    }

    const businessId = await getResolvedBusinessId();
    if (!businessId) {
      return NextResponse.json({ error: 'No se pudo resolver el negocio.' }, { status: 400 });
    }

    const body = await request.json();

    const agentRes = await fetch(`${AGENT_URL}/web-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, businessId }),
    });
```

The rest of the file (rate limiting above, error handling below) is untouched.

- [ ] **Step 2: Type-check**

Run: `cd "C:\Users\andres.delgado\Desktop\Aplicaciones\NIXGOFOOD" && npx tsc --noEmit -p tsconfig.json`
Expected: exit code 0, no output.

- [ ] **Step 3: Manual verification (no regression, businessId present)**

The Worker doesn't consume `businessId` yet (that's Task 2/3), so this step only proves the field is being sent correctly and nothing broke. Deploy is not needed to check this locally is not possible (no local dev server config in this plan) — this step is verified live after Task 1 ships to Vercel, using the browser tool:

1. Push this task's commit (see Step 4) — deploy happens automatically via Vercel.
2. Using the browser tool, navigate to `https://el-taca-nijo.food.nixgodigital.com`, open dev tools via `javascript_tool`, and run:
   ```js
   fetch('/api/agent-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ sessionId: 'plan-task1-check', text: 'hola' }) })
     .then(r => r.json()).then(d => console.log(JSON.stringify(d)))
   ```
   Expected: `status: 200`, a normal bot reply in `messages` (same El Taca Nijo menu behavior as before — the Worker still ignores `businessId` at this point, so no visible change yet).
3. Repeat on `https://burger-house.food.nixgodigital.com`. Expected: also 200, still showing El Taca Nijo's menu (unchanged until Task 3 lands) — confirms this task introduced no regression.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\andres.delgado\Desktop\Aplicaciones\NIXGOFOOD"
git add src/app/api/agent-chat/route.ts
git commit -m "Resolve and forward businessId to the agent Worker from the chat proxy"
```

Do NOT push yet — pushing to `origin/main` triggers Vercel auto-deploy and needs the user's explicit confirmation each time (established project norm). Ask for it when this task is ready to verify live (Step 3 needs the push to have happened — ask for push confirmation immediately before Step 3, then proceed).

---

### Task 2: Worker carries `businessId` through and can resolve a branch

**Files:**
- Modify: `src/channel.ts`
- Modify: `src/index.ts`
- Create: `src/tenant.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly (the new field is optional — nothing breaks if NIXGOFOOD's deploy hasn't landed yet; this task is independently deployable and testable).
- Produces: `IncomingMessage.businessId?: string` (consumed by Task 3's `agent.ts` changes). `resolveBranchId(env: Env, businessId: string): Promise<string>` exported from `./tenant` (consumed by Task 3). The Worker's Durable Object id for the web channel is now derived from `businessId:chatId` instead of bare `chatId` (isolation boundary — no other task depends on this exact format, but Task 3 must not re-derive it differently).

- [ ] **Step 1: Add `businessId` to `IncomingMessage`**

Find this exact current content in `src/channel.ts`:

```ts
export interface IncomingMessage {
  chatId: string;
  text: string;
  photoFileId?: string;
  location?: { latitude: number; longitude: number };
  callbackData?: string;
  channel: 'telegram' | 'web';
}
```

Change to:

```ts
export interface IncomingMessage {
  chatId: string;
  text: string;
  photoFileId?: string;
  location?: { latitude: number; longitude: number };
  callbackData?: string;
  channel: 'telegram' | 'web';
  businessId?: string; // solo presente en channel:'web' — el canal 'telegram' sigue usando env.BUSINESS_ID
}
```

- [ ] **Step 2: Create `src/tenant.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import { Env } from './types';

// Resuelve la sucursal activa de un negocio para el canal web (el canal
// Telegram sigue usando env.BRANCH_ID fijo). Asume una sola sucursal activa
// por negocio — si un negocio no tiene ninguna, esto lanza a propósito: es
// un negocio con datos incompletos en la plataforma, no algo que debamos
// adivinar o enmascarar silenciosamente.
export async function resolveBranchId(env: Env, businessId: string): Promise<string> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from('branches')
    .select('id')
    .eq('business_id', businessId)
    .eq('active', true)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`No se encontró una sucursal activa para el negocio ${businessId}.`);
  }
  return data.id;
}
```

- [ ] **Step 3: `/web-chat` reads and forwards `businessId`, Durable Object id includes it**

Find this exact current content in `src/index.ts`:

```ts
    if (url.pathname === '/web-chat' && request.method === 'POST') {
      let body: { sessionId: string; text?: string; callbackData?: string };
      try {
        body = (await request.json()) as { sessionId: string; text?: string; callbackData?: string };
      } catch {
        return new Response(JSON.stringify({ error: 'JSON inválido' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(request.headers.get('Origin')) },
        });
      }
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

      try {
        const id = env.CONVERSATION.idFromName(incoming.chatId);
        const stub = env.CONVERSATION.get(id);
```

Change to:

```ts
    if (url.pathname === '/web-chat' && request.method === 'POST') {
      let body: { sessionId: string; text?: string; callbackData?: string; businessId?: string };
      try {
        body = (await request.json()) as { sessionId: string; text?: string; callbackData?: string; businessId?: string };
      } catch {
        return new Response(JSON.stringify({ error: 'JSON inválido' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(request.headers.get('Origin')) },
        });
      }
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
        businessId: body.businessId,
      };

      try {
        const doIdName = incoming.businessId ? `${incoming.businessId}:${incoming.chatId}` : incoming.chatId;
        const id = env.CONVERSATION.idFromName(doIdName);
        const stub = env.CONVERSATION.get(id);
```

The `/telegram-webhook` route (its own separate `idFromName(incoming.chatId)` a few lines above) is untouched.

- [ ] **Step 4: Type-check**

Run: `cd "C:\Users\andres.delgado\Desktop\Andres\Agente\AgenteRestaurante" && npx tsc --noEmit`
Expected: exit code 0, no output.

- [ ] **Step 5: Manual verification of `resolveBranchId` against real data**

`resolveBranchId`'s query is `select id from branches where business_id = X and active = true limit 1`. Verify it against real Supabase data directly (same values this plan's author already confirmed live):

```bash
cd "C:\Users\andres.delgado\Desktop\Andres\Agente\AgenteRestaurante"
export $(grep -E '^(SUPABASE_URL|SUPABASE_ANON_KEY)=' .dev.vars | xargs)
curl -s "$SUPABASE_URL/rest/v1/branches?select=id&business_id=eq.b0000000-0000-0000-0000-000000000001&active=eq.true&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Expected: `[{"id":"b0000000-0000-0000-0000-000000000002"}]` (El Taca Nijo's real branch — confirms the query shape `resolveBranchId` uses is correct).

```bash
curl -s "$SUPABASE_URL/rest/v1/branches?select=id&business_id=eq.c0000000-0000-0000-0000-000000000099&active=eq.true&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Expected: `[]` (Burger House genuinely has zero branches today — confirmed by this plan's author via the service-role key too, so this isn't an RLS artifact). This means `resolveBranchId` will correctly THROW for Burger House until someone adds it a branch in the admin — that's expected, correct behavior per this plan's Global Constraints, not a bug. Note this for the user in Task 4's report; it does not block this plan.

- [ ] **Step 6: Commit**

```bash
git add src/channel.ts src/index.ts src/tenant.ts
git commit -m "Carry businessId through the web channel; add resolveBranchId for per-tenant branch lookup"
```

---

### Task 3: `ConversationAgent` resolves and uses business/branch per conversation

**Files:**
- Modify: `src/menu.ts`
- Modify: `src/orders.ts`
- Modify: `src/reservations.ts`
- Modify: `src/agent.ts`

**Interfaces:**
- Consumes: `IncomingMessage.businessId?: string` (Task 2), `resolveBranchId(env, businessId): Promise<string>` from `./tenant` (Task 2).
- Produces: `fetchMenu(env, businessId)`, `placeOrder(env, businessId, branchId, order)`, `getOrderStatus(env, businessId, trackingToken)`, `placeReservation(env, businessId, branchId, reservation)` — new signatures, no other task consumes these directly (only `agent.ts`, updated in this same task).

- [ ] **Step 1: `fetchMenu` takes `businessId` explicitly**

Find this exact current content in `src/menu.ts`:

```ts
export async function fetchMenu(env: Env): Promise<Menu> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name, icon, sort_order')
    .eq('business_id', env.BUSINESS_ID)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (catError) throw new Error(`Error leyendo categorías: ${catError.message}`);

  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, category_id, name, description, price, image_url, active, available, sort_order')
    .eq('business_id', env.BUSINESS_ID)
    .eq('active', true)
    .eq('available', true)
    .order('sort_order', { ascending: true });
```

Change to:

```ts
export async function fetchMenu(env: Env, businessId: string): Promise<Menu> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name, icon, sort_order')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (catError) throw new Error(`Error leyendo categorías: ${catError.message}`);

  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, category_id, name, description, price, image_url, active, available, sort_order')
    .eq('business_id', businessId)
    .eq('active', true)
    .eq('available', true)
    .order('sort_order', { ascending: true });
```

- [ ] **Step 2: `placeOrder` and `getOrderStatus` take `businessId`/`branchId` explicitly**

Find this exact current content in `src/orders.ts`:

```ts
export async function placeOrder(env: Env, order: OrderState): Promise<PlaceOrderResult> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const subtotal = order.items.reduce((sum, item) => {
    const modsTotal = item.selectedModifiers.reduce((s, m) => s + m.price, 0);
    return sum + (item.unitPrice + modsTotal) * item.quantity;
  }, 0);

  const payload = {
    businessId: env.BUSINESS_ID,
    branchId: env.BRANCH_ID,
```

Change to:

```ts
export async function placeOrder(env: Env, businessId: string, branchId: string, order: OrderState): Promise<PlaceOrderResult> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const subtotal = order.items.reduce((sum, item) => {
    const modsTotal = item.selectedModifiers.reduce((s, m) => s + m.price, 0);
    return sum + (item.unitPrice + modsTotal) * item.quantity;
  }, 0);

  const payload = {
    businessId,
    branchId,
```

Find this exact current content (same file):

```ts
export async function getOrderStatus(
  env: Env,
  trackingToken: string
): Promise<{ status: string; estimatedMinutes: string | null } | null> {
  // Usa service_role (no la llave pública): el trackingToken es un secreto random
  // de 32 caracteres, así que conocerlo ya prueba que el pedido es del cliente -
  // no necesitamos ni queremos un permiso público de lectura sobre "orders"
  // (expondría teléfonos de otros clientes).
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('orders')
    .select('status, estimated_minutes')
    .eq('tracking_token', trackingToken)
    .eq('business_id', env.BUSINESS_ID)
    .single();
```

Change to:

```ts
export async function getOrderStatus(
  env: Env,
  businessId: string,
  trackingToken: string
): Promise<{ status: string; estimatedMinutes: string | null } | null> {
  // Usa service_role (no la llave pública): el trackingToken es un secreto random
  // de 32 caracteres, así que conocerlo ya prueba que el pedido es del cliente -
  // no necesitamos ni queremos un permiso público de lectura sobre "orders"
  // (expondría teléfonos de otros clientes).
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('orders')
    .select('status, estimated_minutes')
    .eq('tracking_token', trackingToken)
    .eq('business_id', businessId)
    .single();
```

- [ ] **Step 3: `placeReservation` takes `businessId`/`branchId` explicitly**

Find this exact current content in `src/reservations.ts`:

```ts
export async function placeReservation(env: Env, reservation: ReservationState): Promise<PlaceReservationResult> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const payload = {
    businessId: env.BUSINESS_ID,
    branchId: env.BRANCH_ID,
```

Change to:

```ts
export async function placeReservation(env: Env, businessId: string, branchId: string, reservation: ReservationState): Promise<PlaceReservationResult> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const payload = {
    businessId,
    branchId,
```

- [ ] **Step 4: `agent.ts` imports `resolveBranchId`**

Find this exact current content in `src/agent.ts`:

```ts
import { placeReservation, notifyOwnerOfReservation } from './reservations';
```

Change to:

```ts
import { placeReservation, notifyOwnerOfReservation } from './reservations';
import { resolveBranchId } from './tenant';
```

- [ ] **Step 5: `ConversationAgent` gets `businessId`/`branchId` instance fields**

Find this exact current content in `src/agent.ts`:

```ts
  private outgoing: OutgoingMessage[] = [];
```

Change to:

```ts
  private outgoing: OutgoingMessage[] = [];
  private businessId!: string;
  private branchId!: string;
```

- [ ] **Step 6: `handleFetch` resolves business/branch before anything else uses them**

Find this exact current content in `src/agent.ts`:

```ts
  private async handleFetch(request: Request): Promise<Response> {
    this.outgoing = [];
    const { text, photoFileId, location, callbackData, channel } = (await request.json()) as IncomingMessage;

    const history: ChatMessage[] = (await this.state.storage.get('history')) || [];
    let order: OrderState = (await this.state.storage.get('order')) || emptyOrder();
    let reservation: ReservationState = (await this.state.storage.get('reservation')) || emptyReservation();
    let menu: Menu | undefined = await this.state.storage.get('menu');

    if (!menu || Date.now() - menu.fetchedAt > MENU_TTL_MS) {
      menu = await fetchMenu(this.env);
      await this.state.storage.put('menu', menu);
    }
```

Change to:

```ts
  private async handleFetch(request: Request): Promise<Response> {
    this.outgoing = [];
    const { text, photoFileId, location, callbackData, channel, businessId: incomingBusinessId } = (await request.json()) as IncomingMessage;

    if (channel === 'web') {
      if (!incomingBusinessId) throw new Error('businessId requerido para el canal web.');
      this.businessId = incomingBusinessId;
      const cachedBranchId: string | undefined = await this.state.storage.get('branchId');
      this.branchId = cachedBranchId || (await resolveBranchId(this.env, this.businessId));
      await this.state.storage.put('branchId', this.branchId);
    } else {
      this.businessId = this.env.BUSINESS_ID;
      this.branchId = this.env.BRANCH_ID;
    }

    const history: ChatMessage[] = (await this.state.storage.get('history')) || [];
    let order: OrderState = (await this.state.storage.get('order')) || emptyOrder();
    let reservation: ReservationState = (await this.state.storage.get('reservation')) || emptyReservation();
    let menu: Menu | undefined = await this.state.storage.get('menu');

    if (!menu || Date.now() - menu.fetchedAt > MENU_TTL_MS) {
      menu = await fetchMenu(this.env, this.businessId);
      await this.state.storage.put('menu', menu);
    }
```

Note: any thrown error here (missing `businessId`, or `resolveBranchId` finding no active branch) is already caught by the outer `fetch()` try/catch (added earlier this session) — the customer sees a clear technical-error message instead of silence. Nothing further to add for error handling.

- [ ] **Step 7: `getOrderStatus` call site**

Find this exact current content in `src/agent.ts`:

```ts
      const liveStatus = order.trackingToken ? await getOrderStatus(this.env, order.trackingToken) : null;
```

Change to:

```ts
      const liveStatus = order.trackingToken ? await getOrderStatus(this.env, this.businessId, order.trackingToken) : null;
```

- [ ] **Step 8: `uploadPaymentProof` call site uses `this.businessId` (same value, consistent source)**

Find this exact current content in `src/agent.ts`:

```ts
        const uploaded = await uploadPaymentProof(this.env, this.env.BUSINESS_ID, bytes);
```

Change to:

```ts
        const uploaded = await uploadPaymentProof(this.env, this.businessId, bytes);
```

This call site only runs for Telegram messages (photo upload isn't offered on the web channel), where `this.businessId === this.env.BUSINESS_ID` always — same value, just read from one consistent place instead of two.

- [ ] **Step 9: `doConfirmOrder`'s `placeOrder` call site**

Find this exact current content in `src/agent.ts`:

```ts
      const finalOrder: OrderState = { ...order };
      const result = await placeOrder(this.env, finalOrder);
```

Change to:

```ts
      const finalOrder: OrderState = { ...order };
      const result = await placeOrder(this.env, this.businessId, this.branchId, finalOrder);
```

- [ ] **Step 10: `actualizar_reserva` tool branch — remove the leftover debug logging**

Find this exact current content in `src/agent.ts`:

```ts
    if (toolCall.function.name === 'actualizar_reserva') {
      const newReservation: ReservationState = { ...reservation };
      const { dateStr: debugToday } = getGuayaquilNow();
      console.log(`[DEBUG reserva] hoy=${debugToday} args.date=${args.date} args.time=${args.time} reservation.date-previo=${reservation.date}`);
      if (args.date) newReservation.date = args.date;
```

Change to:

```ts
    if (toolCall.function.name === 'actualizar_reserva') {
      const newReservation: ReservationState = { ...reservation };
      if (args.date) newReservation.date = args.date;
```

(This debug line was added earlier the same session while diagnosing an unrelated date bug and was never cleaned up — removing it here since this task already touches this exact function.)

- [ ] **Step 11: `doConfirmReservation` — `placeReservation` call site, owner-notify gate, and debug cleanup**

Find this exact current content in `src/agent.ts`:

```ts
    let placedReservation: ReservationState;
    try {
      const finalReservation: ReservationState = { ...reservation };
      console.log(`[DEBUG reserva] enviando al RPC date=${finalReservation.date} time=${finalReservation.time}`);
      const result = await placeReservation(this.env, finalReservation);
      placedReservation = {
        ...finalReservation,
        status: 'placed',
        reservationId: result.reservationId,
      };

      this.reply({
        type: 'text',
        text: `✅ *Reserva confirmada*\nFecha: ${result.date}\nHora: ${result.time}\n${result.partySize} persona(s)\n\n¡Te esperamos!`,
      });

      try {
        await notifyOwnerOfReservation(this.env, finalReservation, result);
      } catch (notifyErr: any) {
        console.error('Error notificando al dueño de la reserva:', notifyErr.message);
      }
    } catch (err: any) {
      const { dateStr: debugToday, timeStr: debugNow } = getGuayaquilNow();
      console.log(`[DEBUG reserva] RPC error: ${err.message} (date=${reservation.date} time=${reservation.time})`);
      return {
        reservation,
        resultText: `Error al crear la reserva: ${err.message}. Informa al cliente que hubo un problema técnico y que lo intente de nuevo en un momento. [DEBUG hoy=${debugToday} ahora=${debugNow} reserva.date=${reservation.date} reserva.time=${reservation.time}]`,
      };
    }
```

Change to:

```ts
    let placedReservation: ReservationState;
    try {
      const finalReservation: ReservationState = { ...reservation };
      const result = await placeReservation(this.env, this.businessId, this.branchId, finalReservation);
      placedReservation = {
        ...finalReservation,
        status: 'placed',
        reservationId: result.reservationId,
      };

      this.reply({
        type: 'text',
        text: `✅ *Reserva confirmada*\nFecha: ${result.date}\nHora: ${result.time}\n${result.partySize} persona(s)\n\n¡Te esperamos!`,
      });

      if (this.businessId === this.env.BUSINESS_ID && this.env.OWNER_TELEGRAM_CHAT_ID) {
        try {
          await notifyOwnerOfReservation(this.env, finalReservation, result);
        } catch (notifyErr: any) {
          console.error('Error notificando al dueño de la reserva:', notifyErr.message);
        }
      }
    } catch (err: any) {
      return {
        reservation,
        resultText: `Error al crear la reserva: ${err.message}. Informa al cliente que hubo un problema técnico y que lo intente de nuevo en un momento.`,
      };
    }
```

- [ ] **Step 12: Type-check**

Run: `cd "C:\Users\andres.delgado\Desktop\Andres\Agente\AgenteRestaurante" && npx tsc --noEmit`
Expected: exit code 0, no output. If `getGuayaquilNow` now shows an "unused" concern anywhere — it's still used by `buildSystemPrompt`, so no unused-import errors are expected.

- [ ] **Step 13: Local manual test with `wrangler dev`**

```bash
cd "C:\Users\andres.delgado\Desktop\Andres\Agente\AgenteRestaurante"
npm run dev
```

In a separate terminal, with the dev server's printed port (e.g. 8787):

```bash
curl -s -X POST http://127.0.0.1:8787/web-chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"plan-task3-elt","text":"hola","businessId":"b0000000-0000-0000-0000-000000000001"}'
```

Expected: HTTP 200, `messages` array with a normal greeting — El Taca Nijo behaves exactly as before this plan.

```bash
curl -s -X POST http://127.0.0.1:8787/web-chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"plan-task3-burger","text":"que hamburguesas tienen?","businessId":"c0000000-0000-0000-0000-000000000099"}'
```

Expected: HTTP 200, `messages` mentioning Burger House's own "Hamburguesas" category (its real menu) — **not** El Taca Nijo's tacos. This is the direct proof the core bug is fixed. (Confirming an actual order for this business will still fail with a clear "no se encontró una sucursal activa" error per Task 2 Step 5's finding — expected, not a regression.)

```bash
curl -s -X POST http://127.0.0.1:8787/web-chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"plan-task3-noid","text":"hola"}'
```

Expected: HTTP 200, `messages` containing `⚠️ Error técnico interno: businessId requerido para el canal web.` (the top-level `fetch()` try/catch from earlier this session converts the thrown error into a visible message instead of silence — confirms the guard works).

Stop the dev server afterward (`taskkill //F //IM node.exe //T` on Windows, or Ctrl+C).

- [ ] **Step 14: Commit**

```bash
git add src/menu.ts src/orders.ts src/reservations.ts src/agent.ts
git commit -m "Resolve business/branch per web-chat conversation instead of the Worker's fixed BUSINESS_ID/BRANCH_ID"
```

---

### Task 4: Deploy, push, and end-to-end verification

No file diffs — this task deploys the Worker, pushes the already-committed NIXGOFOOD change (Task 1, if not already pushed during that task's own verification step), and proves the whole thing works live across two real businesses. The controller executes this task directly (same precedent as every deploy/verification task in this project's prior plans) rather than dispatching an implementer subagent.

- [ ] **Step 1: Deploy the Worker**

```bash
cd "C:\Users\andres.delgado\Desktop\Andres\Agente\AgenteRestaurante"
CLOUDFLARE_API_TOKEN=cfut_PrPOlAVHuPnagAoMyj9ro5eQ9F2IUBI9TvsYCDD11a6d026f npx wrangler deploy
```

Expected: `Uploaded agente-taca-nijo`, a new Version ID printed, exit code 0.

- [ ] **Step 2: Confirm the NIXGOFOOD change is pushed**

If Task 1's commit hasn't been pushed yet (it may already have been, to run that task's own verification step), ask the user to confirm pushing `origin/main` now — same per-instance confirmation norm as every other push to this repo this session. Wait for an explicit yes before pushing.

- [ ] **Step 3: Live verification — El Taca Nijo (regression check)**

Using the browser tool, navigate to `https://el-taca-nijo.food.nixgodigital.com` and run via `javascript_tool`:

```js
fetch('/api/agent-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: 'plan-task4-elt-' + Date.now(), text: 'hola' }) })
  .then(r => r.json()).then(d => console.log(JSON.stringify(d)))
```

Expected: HTTP 200, a normal greeting referencing El Taca Nijo's menu when asked — identical behavior to before this plan.

- [ ] **Step 4: Live verification — Burger House (the actual fix)**

Navigate to `https://burger-house.food.nixgodigital.com` and run:

```js
fetch('/api/agent-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: 'plan-task4-burger-' + Date.now(), text: 'que hamburguesas tienen?' }) })
  .then(r => r.json()).then(d => console.log(JSON.stringify(d)))
```

Expected: HTTP 200, a reply about Burger House's own "Hamburguesas" category — **not** El Taca Nijo's tacos. This is the definitive proof: two different subdomains now get two different, correct menus from the same shared Worker.

- [ ] **Step 5: Live verification — a real completed order for El Taca Nijo**

`placeOrder`'s signature changed (Task 3, Step 2) — prove the new `businessId`/`branchId` threading actually produces a working real order, not just a compiling one. Using the browser tool on `https://el-taca-nijo.food.nixgodigital.com`'s chat widget (the real UI, not raw curl — same depth of proof used earlier this session to catch the `gen_random_bytes` bug), complete one full test order: ask for a product, provide a fake customer name/phone, choose pickup + cash, and confirm via the button. Expected: a real `✅ Pedido confirmado` message with an order number — proves `placeOrder(this.env, this.businessId, this.branchId, ...)` still reaches `create_order` with the correct, valid values for a business that already has both a business and a branch. If this fails, do not proceed to Step 6 — return to Task 3 and re-check the signature threading.

- [ ] **Step 6: Report the pre-existing Burger House data gap to the user**

Tell the user directly (not a plan step to "fix"): Burger House has zero rows in `branches` today, so while its chat now correctly shows its own menu, actually placing an order or reservation for it will fail with a clear technical error until someone adds it an active branch via the Admin Panel or Supabase. This is expected per this plan's Global Constraints, not a regression — but the user should know before they demo it to anyone.

- [ ] **Step 7: Final report**

Summarize to the user: both businesses verified live, El Taca Nijo unchanged (Telegram + web, including a real completed test order), Burger House now shows its real menu. Mention the Burger House branch gap from Step 6 again in the same message so it isn't missed.
