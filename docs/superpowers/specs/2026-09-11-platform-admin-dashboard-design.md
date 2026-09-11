# Panel de plataforma (administrar agente + restaurantes) — Design

## Contexto

NIXGOFOOD es multi-tenant por subdominio, pero cada perfil admin
(`profiles.role`: owner/admin/kitchen/dispatch) está atado a **un solo
negocio** (`profiles.business_id`), y la seguridad real la hace RLS a nivel
de base de datos (`current_user_business_id()`), no un chequeo en el
código. Hoy no existe ningún concepto de "administrador de la plataforma"
que vea/gestione todos los restaurantes a la vez.

Esta sesión ya agregó al agente de IA (Cloudflare Worker,
`AgenteRestaurante`): resolución de negocio/sucursal por request (en vez de
un `BUSINESS_ID` fijo), `agent_persona` (tono) y `agent_faq` (base de
conocimiento) por negocio — hoy solo editables con `UPDATE` manual en
Supabase — y un endpoint `GET /health-check?slug=X` que audita si un
negocio tiene lo mínimo para que el agente funcione (activo, sucursal
activa, horarios completos, al menos un producto disponible).

Esta spec agrega una pantalla nueva, **solo para el dueño de la
plataforma**, para: ver todos los restaurantes con su estado de salud y
estadísticas básicas, y editar el tono/FAQ de cualquiera sin SQL.

## Alcance

**Incluido:**
- Rol de plataforma real a nivel de base de datos (no un chequeo en el
  frontend), reutilizando el mismo patrón de seguridad ya establecido en
  el proyecto (funciones `SECURITY DEFINER` + RLS).
- Pantalla `/platform`: lista de negocios con su salud (reusa el
  `/health-check` del Worker) y estadísticas básicas (pedidos/reservas de
  los últimos 7 días, derivadas de las tablas `orders`/`reservations` que
  ya existen — sin instrumentación nueva en el Worker).
- Editar `agent_persona`/`agent_faq` de cualquier negocio desde esa misma
  pantalla.

**Explícitamente fuera de alcance:**
- Cualquier acceso de un dueño de restaurante a esta pantalla — es
  exclusiva del dueño de la plataforma.
- Analítica de conversaciones/mensajes del agente — no existe tracking de
  eso hoy y agregarlo tendría costo de latencia en cada mensaje; las
  estadísticas de v1 se derivan de datos que ya existen.
- Gestión de canales (Telegram por negocio, WhatsApp) — trabajo futuro
  separado, ya discutido y diferido en esta sesión.
- Crear/eliminar negocios desde esta pantalla — sigue siendo un proceso
  manual (Supabase + Panel Admin del propio negocio), esta pantalla es de
  monitoreo y configuración del agente, no de alta de negocios.

## Arquitectura

### 1. Rol de plataforma (base de datos)

Columna nueva, independiente del `role` por negocio (una persona puede
tener su propio restaurante Y ver la plataforma completa):

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;
```

Helper `SECURITY DEFINER`, mismo estilo exacto que `current_user_business_id()`/
`current_user_role()` ya existentes (`supabase/migrations/20260827000000_rls_hardening.sql`):

```sql
CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(is_platform_admin, false) FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_platform_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_is_platform_admin() FROM PUBLIC, anon;
```

**Setup manual (una vez):** el usuario quiere un perfil nuevo, propio, en
vez de reusar `admin@eltacanijo.com` o "Admin Burger". Pasos: (1) crear un
usuario nuevo en Supabase (Dashboard → Authentication → Users → Add user,
con su propio email), (2) insertar su fila en `profiles` con
`business_id = NULL` (la columna sí lo permite, no es `NOT NULL`),
`role = 'owner'` (valor arbitrario para satisfacer el CHECK existente — no
importa cuál, `is_platform_admin` es el candado real) y
`is_platform_admin = true`. El SQL exacto se entrega en el plan de
implementación, con el `id` real del usuario ya creado.

### 2. RPCs `SECURITY DEFINER` (verifican el rol antes de cruzar negocios)

```sql
CREATE OR REPLACE FUNCTION public.platform_list_businesses()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_since TIMESTAMPTZ := now() - INTERVAL '7 days';
BEGIN
  IF NOT public.current_user_is_platform_admin() THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'active', b.active,
      'agentPersona', b.agent_persona, 'agentFaq', b.agent_faq,
      'ordersLast7d', (SELECT count(*) FROM public.orders o WHERE o.business_id = b.id AND o.created_at >= v_since),
      'reservationsLast7d', (SELECT count(*) FROM public.reservations r WHERE r.business_id = b.id AND r.created_at >= v_since)
    ))
    FROM public.businesses b
    ORDER BY b.name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_update_agent_config(p_business_id UUID, p_persona TEXT, p_faq TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_platform_admin() THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  UPDATE public.businesses SET agent_persona = p_persona, agent_faq = p_faq WHERE id = p_business_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_businesses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_agent_config(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_list_businesses() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_update_agent_config(UUID, TEXT, TEXT) FROM PUBLIC, anon;
```

Ambas RPCs son la única puerta de entrada — ningún cliente autenticado sin
`is_platform_admin` puede leer/editar el negocio de otro, sin importar qué
pida desde el navegador (mismo principio que protege `create_order`/
`create_reservation` hoy).

### 3. Ruta y guardia de acceso

`/platform` vive en el dominio raíz (`food.nixgodigital.com/platform`),
fuera del `/admin` por negocio. `src/middleware.ts` gana un bloque paralelo
al que ya protege `/admin` (mismo lugar, misma forma):

```ts
if (pathname.startsWith('/platform') && pathname !== '/platform/login') {
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login'; // reusa el login existente, no uno nuevo
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }
  const { data: profile } = await supabase.from('profiles').select('is_platform_admin, active').eq('id', user.id).single();
  if (!profile || profile.active === false || profile.is_platform_admin !== true) {
    return new NextResponse('Not Found', { status: 404 }); // no revela que la ruta existe
  }
}
```

No hace falta un login nuevo: reutiliza `/admin/login`'s sesión de
Supabase Auth existente — cualquier profile válido con
`is_platform_admin = true` entra, sin importar si además administra su
propio negocio.

### 4. Rutas de API (proxy hacia RPCs y hacia el Worker)

- `GET /api/platform/businesses` — llama `platform_list_businesses()`
  (con el cliente Supabase autenticado del request, la llave `anon` +
  sesión del usuario, nunca el service role — el RPC ya se autoprotege).
- `PUT /api/platform/businesses/[id]/agent-config` — body
  `{ agentPersona: string | null; agentFaq: string | null }`, llama
  `platform_update_agent_config`.
- `GET /api/platform/businesses/[id]/health` — resuelve el `slug` del
  negocio y hace un fetch server-a-servidor al Worker
  (`${AGENT_URL}/health-check?slug=...`), mismo patrón exacto que
  `/api/agent-chat` (evita el bloqueo anti-bots de `*.workers.dev` en el
  navegador).

Las tres rutas llaman primero `verifyPlatformAdminSession()` (nuevo helper
en `src/lib/auth/adminAuth.ts`, mismo estilo que `verifyAdminSession()`)
como segunda capa de defensa — aunque la RPC ya se protege sola, el patrón
establecido del proyecto siempre valida también en la ruta.

### 5. UI

`src/app/platform/page.tsx` → `PlatformDashboardClientPage` (mismo patrón
que `DashboardClientPage`): tabla con nombre, activo/inactivo, semáforo de
salud (🟢 listo / 🔴 con problemas, según `ready` del health-check),
pedidos y reservas de los últimos 7 días. Cada fila expande a un formulario
con dos `textarea` (tono, FAQ) + botón guardar, que llama al PUT de arriba.

## Manejo de errores

- Cualquier RPC llamada sin `is_platform_admin` → excepción Postgres →
  la ruta la traduce a 403, la UI muestra "No autorizado."
- El `/health-check` del Worker no responde (raro, pero ya vimos
  intermitencias de red con `*.workers.dev` esta sesión) → esa fila muestra
  "salud desconocida" en vez de romper toda la tabla.
- Guardar tono/FAQ vacío (string vacío) se trata igual que `NULL` (el
  agente ya usa `agentPersona || <default>` — un string vacío también cae
  en el default, comportamiento consistente).

## Testing

Mismo patrón del proyecto: `tsc --noEmit`, prueba real en navegador contra
`food.nixgodigital.com/platform` con la sesión del perfil marcado como
`is_platform_admin`, confirmando: (1) un perfil SIN esa marca no puede
entrar (404), (2) la tabla muestra El Taca Nijo y Burger House con su
salud real (Burger House debe seguir marcado como no listo, dato conocido
de esta sesión), (3) editar el FAQ de un negocio y confirmar que el chat
de ESE negocio lo refleja en el siguiente mensaje.
