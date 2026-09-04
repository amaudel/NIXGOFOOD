# ADR-003: `search_path` fijo en toda función `SECURITY DEFINER`

**Fecha**: 2026-09-03 (decisión ya tomada; documentada retroactivamente)
**Estado**: Accepted
**Decisores**: Andres Delgado
**Migraciones**: `20260827000000_rls_hardening.sql`, `20260827000200_final_review_fixes.sql`, `20260903000200_fix_gen_random_bytes_calificado.sql`, `20260903000400_endurecer_create_reservation.sql`

## Contexto

Una función `SECURITY DEFINER` corre con los privilegios de su dueño, no de quien la invoca. Si no fija `search_path`, quien pueda influir en el `search_path` de la sesión puede lograr que la función resuelva nombres de tabla sin calificar (`businesses`, `orders`, etc.) contra objetos que no son los suyos, abusando de esos privilegios elevados.

Esto no era teórico: el 2026-09-03 se verificó que `create_reservation` era invocable por el rol `anon` sin autenticación, y llegaba hasta la validación de negocio de la propia función — no a un error de permisos.

## Drivers

- El esquema tiene 11 funciones `SECURITY DEFINER`; una sola inconsistente ya es superficie de ataque.
- `create_order` había sufrido un incidente relacionado: un arreglo (`gen_random_bytes` calificado) corrido a mano en producción se perdió al reaplicar la versión sin fijar del repo.
- Los RPCs (`create_order`, `create_reservation`, `verify_payment_status`, `transition_order_status`) son, a propósito, el único camino de escritura sobre `orders`/`reservations` — si están expuestos, comprometen la única puerta de entrada.

## Decisión

Toda función `SECURITY DEFINER` fija `SET search_path TO ''` (o `= public` cuando la función necesita resolver tipos/tablas de `public` sin calificarlos explícitamente) y califica sus referencias a tablas con el schema (`public.orders`, no `orders`).

`create_reservation` fue la última en corregirse (`20260903000400_endurecer_create_reservation.sql`): quedó con `search_path` vacío y sus tres tablas (`businesses`, `business_hours`, `reservations`) calificadas como `public.*`.

### Consecuencias positivas
- Ninguna de las 11 funciones `SECURITY DEFINER` actuales queda con `search_path` sin fijar (verificado 2026-09-04).
- El contrato de cada RPC no cambia (mismo payload, misma respuesta) — el consumidor externo (AgenteRestaurante, el bot de chat) no requiere ajustes.

### Consecuencias negativas
- Toda función `SECURITY DEFINER` nueva debe seguir este patrón desde el día uno, o vuelve a abrir el mismo hueco — no hay un lint/test automático que lo verifique todavía (candidato a `supabase/tests/`).
- Si se corrige una función a mano en el SQL Editor sin versionar el `SET search_path`, se repite el incidente de `create_order`/`gen_random_bytes` (ver ADR-002 y `supabase/scripts/comparar_deriva_funciones.sql`).

## Links
- ADR-002: RLS multi-tenant por `business_id`
- `supabase/scripts/comparar_deriva_funciones.sql` — detecta si una función en producción difiere de la versionada en el repo
