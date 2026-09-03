# Tiempos de preparación dinámicos según carga de cocina

**Fecha:** 2026-09-03
**Estado:** aprobado en conversación, listo para implementar

## Problema

Cada restaurante maneja tiempos distintos, y ninguno maneja el mismo tiempo
todo el día. Hoy:

- El tiempo de **retiro en local** está escrito a mano en el código
  (`PICKUP_PREP_TIME = '15 - 25 min'` en `src/app/store/checkout/page.tsx`).
  Ningún negocio puede cambiarlo.
- Los tiempos de **delivery** ya son configurables por zona
  (`delivery_zones.estimated_min_minutes` / `_max_minutes`), pero son fijos:
  no reflejan que a las 21:00 de un viernes la cocina está saturada.

## Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| ¿Quién decide que hay carga? | Automático, con freno manual |
| ¿Qué mide la carga? | Cantidad de ítems pendientes |
| ¿A quién le cambia el tiempo? | Solo a quien todavía no pidió |
| ¿Cómo se define el estirado? | Escalones configurables |

## Modelo de datos

Todo **por sucursal**: cada cocina es física y tiene su propia capacidad,
igual criterio que ya se usa para las zonas de delivery.

**Tiempo base de retiro** — dos columnas en `branches`
(`pickup_prep_min_minutes`, `pickup_prep_max_minutes`). Reemplaza la
constante del checkout.

**Escalones de carga** — tabla nueva `prep_time_tiers`, calcada de
`delivery_zones`: `business_id`, `branch_id`, `from_items`, `to_items`
(nullable = sin tope), `extra_minutes`.

Ejemplo:

| from_items | to_items | extra_minutes |
|---|---|---|
| 0 | 10 | 0 |
| 11 | 25 | 10 |
| 26 | (null) | 20 |

**Freno manual y límites** — columnas en `branches`:
`auto_delay_enabled` (bool), `manual_extra_minutes` (int),
`manual_extra_until` (timestamptz, para el auto-apagado),
`max_extra_minutes` (techo).

## Cálculo

**Carga** = suma de `order_items.quantity` de los pedidos de esa sucursal
en estado `new` o `preparing`, creados en las últimas 4 horas.

El corte de 4 horas no es opcional: un pedido que alguien olvidó cerrar
quedaría contando como carga para siempre e inflaría los tiempos todos los
días. Sin el corte la función se degrada sola con el uso.

**Tiempo final:**

- Retiro: tiempo base de la sucursal + extra
- Delivery: tiempo de la zona (como hoy) + extra

El extra aplica a ambos porque el cuello de botella es la cocina en los dos
casos.

**Entre automático y manual gana el mayor**, no se suman. Si el sistema
calcula +20 y el dueño puso +10, queda +20. Sumar daría +30, que no es lo
que nadie espera.

El resultado nunca supera `max_extra_minutes`.

### Restricción de seguridad

La tabla `orders` está protegida por RLS: `anon` no puede leerla, y debe
seguir así. Por lo tanto el conteo se hace **en el servidor** con
`service_role`, y hacia el cliente sale únicamente un número de minutos —
nunca datos de pedidos. Con caché corto (~30 s) para no consultar la base en
cada visita al menú.

## Panel del restaurante

**Página nueva "Tiempos de Preparación"** (`/admin/prep-times`), en el menú
lateral debajo de Delivery. Con selector de sucursal, igual que Delivery.
Contiene: tiempo base de retiro, tabla de escalones (alta/edición/baja,
mismo patrón que las zonas), techo máximo, e interruptor del automático.

**El freno manual NO vive ahí.** Va en la **pantalla de Cocina (KDS)** y en
el Resumen: cuando la cocina se satura nadie entra a Configuración a buscar
un formulario. Botón grande con estado visible (`A FULL · +15 min`).

**Transparencia obligatoria:** el panel muestra en vivo por qué está
estirando (`28 ítems pendientes · +20 min aplicados`). Un sistema que cambia
números solo, sin explicar, genera desconfianza y termina apagado.

## Qué ve el cliente

- Menú y checkout muestran el tiempo ya estirado.
- Cuando hay extra, una línea discreta: *"Hoy con más demora de lo habitual"*.
  Avisar reduce reclamos: quien espera 40 min sabiéndolo reclama menos que
  quien esperaba 20.
- **A quien ya pidió no se le mueve el número.** Sale gratis: `orders`
  ya guarda `estimated_minutes` propio por pedido al crearse.
- Con la tienda cerrada no aplica nada, como hoy.

## Errores y casos límite

**Regla de oro: esto nunca puede impedir una venta.** Si la consulta de
carga falla o tarda, el extra es 0 y se muestra el tiempo base.

| Situación | Comportamiento |
|---|---|
| Sin escalones cargados | Extra 0 — la función es opt-in |
| Sin tiempo base de retiro | Usa 15-25, el valor actual: ningún negocio existente cambia al desplegar |
| Escalones con huecos | Validación al guardar; si igual queda un hueco, aplica el escalón inferior más cercano |
| Extra mayor al techo | Se recorta al techo |
| Negocio que nunca cierra | El freno manual tiene tope de horas además del apagado al cerrar |
| Modo demo | Funciona sin base de datos, con los pedidos del seed |

## Pruebas

El corazón es una **función pura** (carga + configuración → minutos extra),
con TDD y cobertura exhaustiva: cada tramo, bordes exactos, tramo abierto,
huecos, sin configuración, techo, y la regla del mayor entre automático y
manual.

Aparte:

- Conteo: que sume solo `new` + `preparing`, respete el corte de 4 horas y
  separe por sucursal.
- Checkout: que el tiempo mostrado sea base + extra, que el pedido guarde su
  snapshot, y que un fallo de la consulta no impida comprar.
