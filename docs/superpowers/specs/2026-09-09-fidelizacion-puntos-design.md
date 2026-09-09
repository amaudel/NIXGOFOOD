# Diseño: Programa de fidelización por puntos

**Fecha**: 2026-09-09
**Estado**: Aprobado para pasar a plan de implementación
**Clasificación**: Arquitectural (nuevas tablas, toca el flujo de checkout y el cálculo de totales de pedido)

## Contexto y objetivo

NixGoFood no tiene hoy ninguna funcionalidad de fidelización de clientes (se verificó código, migraciones y specs existentes — no aparece en ningún lado). La investigación de mercado (ver conversación previa) muestra que es una feature estándar en SaaS de pedidos para restaurantes (Toast Loyalty, Paytronix, ChowNow, Momos) y que el 66% de los consumidores pide más seguido en restaurantes donde usa activamente un programa de lealtad.

Objetivo: que un cliente que pide repetidamente en un negocio acumule puntos por lo que gasta y pueda canjearlos como descuento en un pedido futuro, sin requerir login de cliente (hoy el checkout es de invitado, identificado por teléfono).

## Restricciones del sistema actual (verificadas en código)

- El checkout es de invitado: no hay autenticación de cliente. `customers` se resuelve por `phone` dentro del RPC `create_order` (búsqueda o creación automática).
- El cálculo de totales de un pedido (`subtotal + delivery_fee = total`) vive server-side en el RPC `create_order`, no en el frontend.
- Multi-tenant por `business_id` con RLS (ADR-002) — ninguna tabla nueva puede usar políticas `USING (true)`.
- **Deriva de esquema conocida**: el archivo `supabase/migrations/20260819091500_production_baseline.sql` no incluye las columnas `customer_id` y `order_number` de `orders`, aunque los RPCs de `create_order` (migraciones de agosto/septiembre 2026) sí las usan. Esto confirma que el baseline trackeado no es 100% fiel a producción. **Antes de escribir la migración real de este feature, hay que verificar el esquema actual de `orders` contra producción** (ver `supabase/scripts/comparar_deriva_funciones.sql`, mencionado en ADR-003), no asumir que el repo es la fuente de verdad.
- `order_status_history` ya soporta `is_rollback` — un pedido `delivered` puede retroceder a un estado anterior.

## Decisión de mecánica (por qué puntos, no sellos ni solo cupones)

- Sellos (buy N get 1 free) es más simple pero menos flexible para promos futuras (doble puntos, tiers).
- Cupones sirven para adquisición, no para premiar recurrencia — no resuelven el objetivo planteado, se pueden agregar después sin conflicto.
- Puntos acumulables aprovechan que `customer_id` ya se resuelve por teléfono en el flujo existente: no requiere construir autenticación de cliente.

## Modelo de datos

### `loyalty_programs`
Una fila por `business_id`. Configurable por cada negocio (no una regla global).

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| business_id | UUID UNIQUE, FK businesses | |
| enabled | BOOLEAN DEFAULT false | apagado por defecto |
| points_per_currency_unit | NUMERIC | ej. 1 punto por $1 gastado |
| redemption_value_per_point | NUMERIC | ej. $0.01 por punto (100 pts = $1) |
| max_redeem_percent | NUMERIC | tope de cobertura del canje sobre el subtotal, ej. 30 |
| created_at / updated_at | TIMESTAMPTZ | |

RLS: SELECT/UPDATE solo para `profiles` con `business_id` propio y `role IN ('owner','admin')`. Sin acceso `anon`.

### `loyalty_accounts`
Balance cacheado por cliente y negocio.

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| business_id | UUID FK businesses | |
| customer_id | UUID FK customers | |
| points_balance | INT DEFAULT 0 | caché derivada del ledger, nunca fuente de verdad |
| created_at / updated_at | TIMESTAMPTZ | |

`UNIQUE(business_id, customer_id)`. Sin acceso directo `anon`/`authenticated` — solo vía RPCs `SECURITY DEFINER`.

### `loyalty_transactions`
Ledger append-only, fuente de verdad del balance.

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| business_id | UUID FK businesses | |
| customer_id | UUID FK customers | |
| order_id | UUID FK orders, nullable | null para ajustes manuales futuros |
| type | TEXT CHECK IN ('earn','redeem','earn_reversal') | |
| points | INT | positivo earn, negativo redeem/reversal |
| balance_after | INT | snapshot para auditoría |
| created_at | TIMESTAMPTZ | |

`UNIQUE(order_id, type)` cuando `order_id IS NOT NULL` — evita doble acreditación o doble reversa si un RPC se reintenta.

### Cambios a `orders`
- `discount_total NUMERIC(10,2) DEFAULT 0.00`
- `points_redeemed INT DEFAULT 0` (snapshot histórico)
- `points_earned INT DEFAULT 0` (snapshot histórico, se completa al pasar a `delivered`)
- `total` pasa a calcularse como `subtotal - discount_total + delivery_fee`

Los snapshots en `orders` siguen el mismo criterio que `product_name_snapshot` en `order_items`: nunca recalcular un pedido histórico con las reglas de puntos vigentes hoy.

## Flujo de canje (checkout)

1. El cliente escribe su teléfono (ya obligatorio hoy).
2. El frontend llama `get_loyalty_quote(business_id, phone, subtotal)` — RPC `SECURITY DEFINER`, callable por `anon`.
3. La función devuelve `{ available_points, max_discount }`, donde `max_discount = min(available_points × redemption_value_per_point, subtotal × max_redeem_percent / 100)`. Si `enabled = false` o el cliente no existe todavía, devuelve `{ available_points: 0, max_discount: 0 }` sin error.
4. Si el cliente elige canjear, el checkout manda `redeem_points` al crear el pedido.
5. `create_order` (dentro de la misma transacción que ya crea `orders`/`order_items`):
   - Bloquea la fila de `loyalty_accounts` (`SELECT ... FOR UPDATE`) para evitar que dos pestañas canjeen el mismo saldo simultáneamente.
   - Revalida `redeem_points <= available_points` y el tope `max_redeem_percent`.
   - Calcula `discount_total`, ajusta `total`.
   - Inserta la fila `redeem` en `loyalty_transactions` y descuenta `loyalty_accounts.points_balance`.
   - Si la validación falla, aborta toda la transacción — el pedido no se crea con un descuento inválido.

## Flujo de acreditación

Cuando `transition_order_status` mueve un pedido a `to_status = 'delivered'`:

1. `points_earned = floor((subtotal - discount_total) × points_per_currency_unit)`.
2. Inserta transacción `earn` (protegida por `UNIQUE(order_id, type)` contra reintentos).
3. Suma a `loyalty_accounts.points_balance` y completa `orders.points_earned`.

### Rollback de `delivered`

Si `order_status_history` registra un rollback desde `delivered` a un estado anterior: se inserta una transacción `earn_reversal` (puntos negativos) por el mismo `order_id`, protegida también por `UNIQUE(order_id, type)` — nunca se hace `UPDATE` directo del balance ni se borra la transacción `earn` original. El ledger queda completo y auditable.

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| Saldo insuficiente al confirmar (race condition) | Transacción completa se aborta, frontend vuelve a pedir el saldo actualizado vía `get_loyalty_quote` |
| `loyalty_programs.enabled = false` | Cotización devuelve 0 sin error, checkout no muestra la opción |
| Reintento de `create_order` con mismo pedido | `UNIQUE(order_id, type)` en `loyalty_transactions` evita doble canje/doble acreditación |
| Rollback de `delivered` | Reversa automática vía `earn_reversal`, nunca edición directa |

## RLS

Sigue ADR-002: aislamiento por `business_id`, sin políticas `USING (true)`, usando el mismo patrón de funciones helper `SECURITY DEFINER` con `search_path` fijo (ADR-003).

- `loyalty_programs`: lectura/escritura solo `owner`/`admin` del negocio dueño.
- `loyalty_accounts`, `loyalty_transactions`: sin acceso directo para `anon`/`authenticated`; todo pasa por RPCs.
- Pruebas negativas obligatorias: negocio A no puede leer ni canjear puntos de negocio B (mismo patrón que ADR-002 exige para `orders`/`branches`).

## Testing

Sigue el patrón de `src/lib/__tests__/orderSupervision.test.ts` (batería de escenarios):

- Funciones puras de cálculo: cuota de canje, tope `max_redeem_percent`, cálculo de puntos ganados.
- Canje mayor al tope disponible → rechazado.
- Dos canjes simultáneos del mismo saldo (race condition) → solo uno prospera.
- Rollback de `delivered` → reversa exacta de los puntos, sin doble reversa en reintentos.
- Negocio con `enabled = false` → cotización siempre en 0.
- RLS negativa: negocio A vs. negocio B en las tres tablas nuevas.

## Riesgo abierto a resolver antes de migrar

Verificar el esquema real de `orders` en producción (no el baseline trackeado) antes de escribir la migración de `discount_total`/`points_redeemed`/`points_earned`, dada la deriva documentada en ADR-002/ADR-003.
