# Table Reservations — Design

## Contexto

El agente conversacional (Cloudflare Worker + Durable Object en `AgenteRestaurante/`,
compartido por el bot de Telegram y el chat web de NIXGOFOOD) hoy solo vende comida.
Esta spec agrega una segunda capacidad, independiente de los pedidos: **reservar mesa**.

Confirmado por exploración del código: NIXGOFOOD no tiene ningún concepto de reservas
hoy (ni tabla, ni tipos, ni rutas). Es una función nueva desde cero.

## Alcance de v1

**Incluido:**
- El agente puede tomar una reserva (fecha, hora, número de personas, nombre, teléfono,
  petición especial opcional) en la misma conversación donde el cliente puede además
  pedir comida — son dos cosas independientes que el agente rastrea por separado.
- Validación server-side de que la fecha/hora cae dentro del horario de atención
  (tabla `business_hours`, que ya existe) y no es una fecha/hora ya pasada.
- Confirmación con el mismo patrón ya construido para pedidos: resumen + botones
  ✅ Confirmar / ❌ Cancelar antes de guardar de verdad.
- Aviso al dueño del negocio por Telegram (mensaje directo a un chat fijo) cuando se
  confirma una reserva.
- Funciona igual desde Telegram y desde el chat web (mismo cerebro).

**Explícitamente fuera de v1:**
- Límite de capacidad / número de mesas disponibles — no existe ese concepto en el
  negocio hoy; el agente acepta cualquier reserva dentro del horario, sin validar cupo.
- Pantalla nueva en el panel de Admin de NIXGOFOOD para ver/gestionar reservas — el
  aviso por Telegram cubre "enterarme de que llegó una reserva" por ahora. Se puede
  agregar después reusando el patrón ya existente de la pantalla de Pedidos
  (`OrdersClientPage.tsx`), sin rediseñar nada de esta spec.
- Cancelar o modificar una reserva ya confirmada desde el chat (el cliente puede seguir
  chateando para pedir comida normalmente, pero "cambiar mi reserva" no está cubierto).

## Antes de implementar: verificar el esquema real

Este proyecto ya tuvo un caso de "schema drift" (las migraciones en el repo no
coincidían con las columnas reales en producción — pasó con `categories`/`products`).
**Antes de escribir el RPC final**, correr esta consulta de solo lectura en el SQL
Editor de Supabase y usar los nombres de columna REALES que devuelva, no los que
aparecen en `supabase/migrations/*.sql`:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('business_hours', 'businesses', 'branches')
order by table_name, ordinal_position;
```

El diseño de abajo asume las columnas de `business_hours` que aparecen en
`production_baseline.sql` (`business_id`, `branch_id`, `day_of_week`, `open_time`,
`close_time`, `is_closed`) — **confirmar esto contra la consulta real antes de
implementar** el RPC, igual que se hizo para `create_order`.

## Arquitectura

### 1. Tabla nueva `reservations`

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
-- Deliberadamente CERO políticas públicas: nadie puede leer ni escribir esta tabla
-- directo con la llave pública. La única puerta de entrada es el RPC de abajo
-- (SECURITY DEFINER), igual que ya pasa con `create_order`.
```

### 2. RPC `create_reservation(p_payload jsonb)`

`SECURITY DEFINER`, mismo patrón que `create_order`. Payload de entrada:

```json
{
  "businessId": "...", "branchId": "...",
  "customer": { "name": "...", "phone": "..." },
  "partySize": 4,
  "date": "2026-09-01",
  "time": "19:30",
  "specialRequest": "Mesa junto a la ventana, es un cumpleaños"
}
```

Validaciones dentro de la función (rechaza con `RAISE EXCEPTION` y un mensaje en
español si falla, igual que `create_order`):
- El negocio existe y está activo.
- Nombre y teléfono no vacíos (teléfono al menos 7 caracteres).
- `partySize` es un entero mayor a 0.
- La fecha+hora combinada no es anterior al momento actual.
- El día de la semana de `reservation_date` (`EXTRACT(DOW FROM ...)`) tiene una fila en
  `business_hours` para esa sucursal, no está marcado como cerrado, y la hora pedida
  cae entre `open_time` y `close_time`.

Si todo pasa: inserta la fila con `status = 'confirmed'` y devuelve
`{ id, partySize, date, time, createdAt }`.

```sql
GRANT EXECUTE ON FUNCTION create_reservation(JSONB) TO public, anon, authenticated;
```

### 3. Worker: nuevo estado en paralelo al pedido

Hoy el Durable Object guarda `order: OrderState` en su storage. Se agrega, en
paralelo, `reservation: ReservationState` — independiente, no reemplaza nada del
pedido:

```ts
export interface ReservationState {
  status: 'building' | 'placed';
  partySize?: number;
  date?: string;   // 'YYYY-MM-DD'
  time?: string;   // 'HH:MM'
  customerName?: string;
  customerPhone?: string;
  specialRequest?: string;
  reservationId?: string;
}
```

Un archivo nuevo `src/reservations.ts` (mismo rol que `src/orders.ts`):
- `placeReservation(env, reservation)`: llama al RPC `create_reservation` con la
  llave pública (igual que `placeOrder`, el RPC ya es `SECURITY DEFINER`).
- `notifyOwnerOfReservation(env, reservation, result)`: manda un mensaje de Telegram
  **directo al dueño** (`env.OWNER_TELEGRAM_CHAT_ID`, un secreto nuevo del Worker) con
  los detalles de la reserva confirmada. Esto llama a `sendTelegramMessage` de
  `telegram.ts` directamente — es la única excepción deliberada al patrón
  "canal-agnóstico" (`this.reply()`) que ya usa el resto del agente, porque este aviso
  siempre va por Telegram al dueño sin importar si el cliente reservó por Telegram o
  por el chat web.

### 4. Conversación: mismo patrón que los pedidos

- Herramienta nueva `actualizar_reserva` (partySize, date, time, customerName,
  customerPhone, specialRequest) — igual que `actualizar_pedido`, reemplaza el estado
  completo de la reserva en construcción.
- En cuanto la reserva tenga todos los datos obligatorios completos (fecha, hora,
  personas, nombre, teléfono — la petición especial es opcional), el sistema manda
  automáticamente el resumen con botones ✅ Confirmar reserva / ❌ Cancelar — mismo
  mecanismo ya construido para pedidos (`sendConfirmSummary`), replicado como
  `sendConfirmReservationSummary`.
- Botones con `callback_data` nuevos y distintos de los de pedido:
  `confirm_reservation` / `cancel_reservation`.
- Al confirmar: llama a `placeReservation`, si tiene éxito manda un mensaje garantizado
  al cliente (igual que `doConfirmOrder` ya hace) y llama a `notifyOwnerOfReservation`.
- El system prompt gana instrucciones nuevas explicando esta segunda capacidad y
  aclarando que pedir comida y reservar mesa son independientes (el cliente puede hacer
  ambas cosas, ninguna depende de la otra).

## Testing

Mismo patrón ya usado en este proyecto: typecheck, prueba local con `wrangler dev` vía
`curl` simulando el flujo completo, despliegue, y prueba real de punta a punta por
Telegram y por el chat web — reservando una mesa completa y confirmando que (a) llega
el aviso al dueño y (b) el registro aparece en la tabla `reservations` en Supabase.
