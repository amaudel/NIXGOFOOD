# Agente multi-tenant (chat web) — Design

## Contexto

El agente conversacional (Cloudflare Worker + Durable Object en
`AgenteRestaurante/`) hoy sirve un solo negocio: El Taca Nijo. Su
`BUSINESS_ID`/`BRANCH_ID` son secretos fijos del Worker. NIXGOFOOD ya es
multi-tenant por subdominio (`{slug}.food.nixgodigital.com` resuelve el
negocio vía middleware), pero el agente no lo sabe — **confirmado en vivo**:
`burger-house.food.nixgodigital.com` muestra el menú de El Taca Nijo en su
chat web, porque el proxy `/api/agent-chat` (agregado en la sesión del
2026-09-02) reenvía siempre al mismo Worker con el mismo negocio fijo.

Esta spec generaliza el **chat web** para que cada negocio real de
NIXGOFOOD tenga su propio agente (menú, pedidos, reservas), sin desplegar
nada nuevo por negocio.

## Alcance

**Incluido:**
- El chat web resuelve el negocio correcto (menú, sucursal, pedidos,
  reservas) para cualquier negocio activo de NIXGOFOOD, usando el mismo
  Worker compartido que ya existe.
- Aislamiento por negocio a nivel de Durable Object (conversaciones de
  negocios distintos nunca se mezclan, aunque coincida algo del
  identificador de sesión).

**Explícitamente fuera de alcance (decidido con el usuario):**
- Telegram sigue siendo exclusivo de El Taca Nijo, sin cambios. Fue usado
  solo para pruebas; el canal real a futuro es WhatsApp vía un proveedor
  externo (Zernio o similar), que se diseñará aparte.
- Sin aviso en tiempo real (ni Telegram ni ningún otro canal) para pedidos
  o reservas de negocios que no sean El Taca Nijo. El pedido/reserva queda
  bien guardado en Supabase; el dueño lo revisa desde el Panel Admin. Un
  canal de aviso real (WhatsApp) es trabajo futuro separado.
- El ambiente Demo (`menu.demo.food.nixgodigital.com`) queda fuera: corre
  en `NEXT_PUBLIC_DEMO_MODE=true`, con datos de prueba locales
  (`DemoOrderRepository`), sin pasar por la resolución de negocio por
  subdominio que esta spec generaliza. No requiere ni se beneficia de este
  cambio.
- Ningún cambio de esquema en Supabase: la tabla `branches` y sus políticas
  RLS de lectura pública "solo activos" ya existen (agregadas en sesiones
  anteriores). No hace falta ninguna tabla ni columna nueva.

## Arquitectura

Un solo Worker compartido (el mismo `agente-taca-nijo`, sin renombrar ni
volver a desplegar como "multi-negocio" todavía — el nombre interno no
importa para la lógica) resuelve el negocio **en cada mensaje del canal
web**, en vez de asumir siempre su `BUSINESS_ID` fijo. El canal Telegram
sigue usando exactamente `env.BUSINESS_ID`/`env.BRANCH_ID` como hoy — cero
cambios ahí.

### 1. NIXGOFOOD ya sabe qué negocio es cada visitante

El middleware (`src/middleware.ts`) ya resuelve el negocio por subdominio y
lo expone vía `getResolvedBusinessId()` (header `x-business-id`,
server-only). `src/app/api/agent-chat/route.ts` (la ruta proxy agregada
hoy) se modifica para:

```ts
import { getResolvedBusinessId } from '@/lib/tenant';
// ...
const businessId = await getResolvedBusinessId();
if (!businessId) {
  return NextResponse.json({ error: 'No se pudo resolver el negocio.' }, { status: 400 });
}
// ...
const agentRes = await fetch(`${AGENT_URL}/web-chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...body, businessId }),
});
```

El navegador nunca manda `businessId` — viene siempre del servidor, que ya
lo resolvió de forma confiable (el mismo mecanismo que usa el resto de la
app, no algo nuevo que inventar).

### 2. El Worker recibe `businessId` y resuelve la sucursal

`IncomingMessage` (`src/channel.ts`) gana un campo opcional:

```ts
export interface IncomingMessage {
  chatId: string;
  text: string;
  photoFileId?: string;
  location?: { latitude: number; longitude: number };
  callbackData?: string;
  channel: 'telegram' | 'web';
  businessId?: string; // solo presente en channel:'web'
}
```

`index.ts`'s ruta `/web-chat` lee `body.businessId` y lo incluye en el
`incoming` que arma. La ruta `/telegram-webhook` no cambia (nunca manda
`businessId`, el canal Telegram sigue usando el negocio fijo del Worker).

Nueva función `resolveBranchId` (archivo nuevo `src/tenant.ts`, misma
responsabilidad que `getResolvedBusinessId` de NIXGOFOOD pero del lado del
Worker — resolver identidad de tenant, no vender ni reservar):

```ts
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

Asume una sola sucursal activa por negocio (cierto hoy para los 3 negocios
existentes: El Taca Nijo, Burger House, y cualquiera nuevo que se cree
igual). Si un negocio llegara a tener más de una sucursal activa, esta
función simplemente toma la primera — comportamiento a revisar en ese
momento, no antes (YAGNI).

### 3. Identidad del Durable Object: aislamiento por negocio

Hoy: `env.CONVERSATION.idFromName(incoming.chatId)` — para el canal web,
`chatId` es un UUID de `localStorage`, ya aislado por origen del navegador
(cada subdominio tiene su propio `localStorage`), pero se hace explícito
para no depender de esa propiedad implícita:

```ts
const doIdName = incoming.channel === 'web' && incoming.businessId
  ? `${incoming.businessId}:${incoming.chatId}`
  : incoming.chatId;
const id = env.CONVERSATION.idFromName(doIdName);
```

Esto va en `index.ts`, en el único lugar de `/web-chat` que llama
`idFromName` (Telegram no cambia).

### 4. `ConversationAgent`: resolver negocio/sucursal una vez por conversación

En `handleFetch()`, justo después de leer `businessId` del payload, se
resuelven `businessId`/`branchId` como **campos de instancia** (no se pasan
como parámetro por cada método — evita tener que tocar la firma de
`runTool`, `doConfirmOrder`, `doConfirmReservation`, etc.):

```ts
private businessId!: string;
private branchId!: string;

// dentro de handleFetch, después de leer el body:
if (channel === 'web') {
  if (!incomingBusinessId) throw new Error('businessId requerido para el canal web.');
  this.businessId = incomingBusinessId;
  this.branchId = (await this.state.storage.get('branchId')) as string
    || await resolveBranchId(this.env, this.businessId);
  await this.state.storage.put('branchId', this.branchId);
} else {
  this.businessId = this.env.BUSINESS_ID;
  this.branchId = this.env.BRANCH_ID;
}
```

`branchId` se cachea en el storage del Durable Object (igual que ya se
cachea `menu`) — se resuelve una sola vez por conversación, no en cada
mensaje.

### 5. Funciones existentes: reciben negocio/sucursal explícitos en vez de leerlos de `env`

Cambios de firma (mismo archivo, mismo cuerpo, solo cambia de dónde sale el
dato):

- `fetchMenu(env, businessId)` — antes leía `env.BUSINESS_ID` en sus dos
  `.eq('business_id', ...)`.
- `placeOrder(env, businessId, branchId, order)` — antes leía ambos de
  `env` para armar el payload del RPC.
- `getOrderStatus(env, businessId, trackingToken)` — antes leía
  `env.BUSINESS_ID` para el filtro extra de seguridad.
- `placeReservation(env, businessId, branchId, reservation)` — antes leía
  ambos de `env`.

Todos los call-sites dentro de `agent.ts` pasan `this.businessId` /
`this.branchId` en vez de `this.env.BUSINESS_ID` / `this.env.BRANCH_ID`.

`uploadPaymentProof(env, businessId, bytes)` **no cambia** — ya recibe
`businessId` explícito, y su único call-site (subida de comprobante de
transferencia) solo ocurre en el canal Telegram (el chat web es
pickup+efectivo únicamente), así que `this.env.BUSINESS_ID` ahí sigue
siendo correcto tal cual está.

### 6. Aviso al dueño: sigue siendo exclusivo de El Taca Nijo

`doConfirmReservation` gana una condición antes de llamar
`notifyOwnerOfReservation`:

```ts
if (this.businessId === this.env.BUSINESS_ID && this.env.OWNER_TELEGRAM_CHAT_ID) {
  try {
    await notifyOwnerOfReservation(this.env, finalReservation, result);
  } catch (notifyErr: any) {
    console.error('Error notificando al dueño de la reserva:', notifyErr.message);
  }
}
```

Para cualquier otro negocio, la reserva se crea igual (vía
`placeReservation`, sin cambios) pero no se intenta avisar a nadie — el
`if` simplemente no entra.

## Manejo de errores

- `businessId` ausente en un mensaje de canal web → error claro
  ("businessId requerido...") capturado por el try/catch ya existente en
  `ConversationAgent.fetch()` (agregado hoy) — el cliente ve un mensaje de
  error técnico en vez de silencio total.
- `resolveBranchId` sin sucursal activa → mismo mecanismo: error claro,
  capturado, visible al cliente como error técnico.
- Negocio inactivo o inexistente: nunca llega a este punto — NIXGOFOOD ya
  filtra `active=true` antes de resolver `x-business-id`; el Worker confía
  en ese resultado (mismo patrón que ya usa para todo lo demás).

## Testing

Mismo patrón del proyecto: typecheck (`tsc --noEmit` en ambos repos),
prueba real end-to-end por navegador en al menos dos subdominios distintos
(`el-taca-nijo.food.nixgodigital.com` y `burger-house.food.nixgodigital.com`)
confirmando que cada uno:
1. Muestra su propio menú real en el chat.
2. Puede completar un pedido de prueba que aparezca en Supabase con el
   `business_id`/`branch_id` correctos.
3. El Taca Nijo sigue mandando el aviso de reserva al dueño; Burger House
   no manda ningún aviso (comportamiento esperado, no un bug).
4. Telegram (El Taca Nijo) sigue funcionando exactamente igual que antes
   de este cambio — regresión, no feature nueva.
