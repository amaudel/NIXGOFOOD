# ADR-001: Modo demo con localStorage vs backend Supabase

**Fecha**: 2026-09-04 (decisión ya tomada; documentada retroactivamente)
**Estado**: Accepted
**Decisores**: Andres Delgado

## Contexto

NIXGOFOOD necesita poder mostrarse en demos comerciales y desplegarse gratis (Vercel Hobby) sin exigirle al prospecto una base Supabase configurada, pero en producción real necesita persistencia, auth y RLS multi-tenant de verdad.

## Drivers

- Costo cero para demos/pitches a restaurantes que todavía no son clientes.
- El pilotos real (El Taca Nijo) sí necesita datos persistentes y aislados por negocio.
- Un solo código base, no dos apps separadas.

## Opciones consideradas

1. **Flag `NEXT_PUBLIC_DEMO_MODE`** que alterna entre `localStorage` (prefijo `nixgo_food_demo_*`) y Supabase.
2. Dos builds/repos separados (uno demo, uno producción).
3. Siempre Supabase, con un proyecto "demo" compartido en la nube.

## Decisión

Opción 1: flag de entorno que alterna el backend en tiempo de build/runtime.

### Consecuencias positivas
- Deploy de demo sin infraestructura ni credenciales.
- Un botón de "restaurar datos iniciales" resetea el estado de la demo sin tocar producción.

### Consecuencias negativas
- Dos caminos de código para persistencia (`localStorage` vs Supabase RPC) que hay que mantener sincronizados en comportamiento — mitigado con los 38 tests actuales, pero cualquier feature nueva debe implementarse en ambos modos o marcarse explícitamente como solo-producción.
- Riesgo de que alguien confunda datos demo con datos reales — hoy El Taca Nijo y Burger House son fixtures de desarrollo/piloto, no clientes reales; conviene dejarlo explícito en el seed o en un README cuando existan clientes de verdad.
