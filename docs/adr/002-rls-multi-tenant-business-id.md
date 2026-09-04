# ADR-002: Aislamiento multi-tenant vía RLS por `business_id`

**Fecha**: 2026-08-27 (decisión ya tomada; documentada retroactivamente)
**Estado**: Accepted
**Decisores**: Andres Delgado
**Migración**: `supabase/migrations/20260827000000_rls_hardening.sql`

## Contexto

`supabase/scripts/master_setup.sql` (script manual corrido en el SQL Editor, nunca trackeado por `supabase db push`) había dejado políticas `USING (true)` / `WITH CHECK (true)` en `orders`, `branches`, `delivery_zones` y `motorizados`, además de un `GRANT UPDATE` directo sobre `orders` a `anon`/`authenticated`. Cada restaurante (tenant) debía quedar aislado del resto sin depender de que ese script manual se reaplicara correctamente.

## Drivers

- Un negocio no debe poder leer ni escribir pedidos, sucursales o zonas de delivery de otro negocio.
- Las políticas RLS no pueden recursionar contra la tabla que protegen.
- La fuente de verdad debe ser reproducible desde migraciones versionadas, no desde SQL corrido a mano.

## Opciones consideradas

1. **RLS por `business_id`** usando funciones helper `SECURITY DEFINER` (`current_user_business_id()`, `current_user_can_dispatch()`) que evitan la recursión de RLS al consultar `profiles`.
2. Aislamiento a nivel de aplicación (filtrar `business_id` en cada query de Next.js, sin RLS en la base).
3. Un schema Postgres por negocio.

## Decisión

Opción 1. `supabase/migrations/20260827000000_rls_hardening.sql` es la fuente única y reproducible de RLS para el esquema real de producción (`business_id`/`active`/`available` en las tablas de negocio, `branches`/`customer_id`/`order_number` en `orders`, tabla `motorizados`).

### Consecuencias positivas
- El aislamiento vive en la base, no depende de que cada endpoint de Next.js recuerde filtrar por `business_id`.
- Reproducible: reaplicar las migraciones desde cero reconstruye las mismas políticas.

### Consecuencias negativas
- Cualquier política nueva sobre estas tablas debe pasar por migración versionada — un cambio manual en el SQL Editor vuelve a producir deriva (ver ADR-003 y `supabase/scripts/comparar_deriva_funciones.sql`).
- Las funciones helper son `SECURITY DEFINER`: deben fijar `search_path` (ver ADR-003) para no quedar explotables.

## Links
- ADR-003: search_path fijo en funciones SECURITY DEFINER
- `supabase/migrations/20260827000100_fix_rpc_auto_provision_backdoor.sql` (siguiente hardening sobre el mismo problema)
