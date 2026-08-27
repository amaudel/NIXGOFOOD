# Resolución de Tenant por Subdominio — Design

## Contexto

NIXGOFOOD es hoy una app de un solo negocio: `src/config/business.ts` define
`CURRENT_BUSINESS_ID` como constante fija, y toda la app (storefront, admin, RPCs)
la usa como default. La base de datos ya soporta multi-negocio desde el diseño
original (`businesses`, `profiles.business_id`, etc.), y la sesión de hardening de
RLS del 2026-08-27 dejó todas las políticas escritas de forma genérica por
`business_id` — ningún negocio está hardcodeado a nivel de base de datos.

El objetivo de negocio es vender esto como SaaS a múltiples restaurantes. Ese
proyecto más grande se dividió en 4 sub-proyectos independientes (resolución de
tenant, onboarding, cobro/planes, dominio propio del cliente). Esta spec cubre
**solo el primero**: cómo un request HTTP sabe a qué negocio pertenece.

## Alcance de v1

**Incluido:**
- Storefront público servido por subdominio: `{slug}.tuapp.com`.
- Panel admin centralizado en `admin.tuapp.com`, un solo login para todos los
  negocios (el negocio de cada empleado ya se resuelve por `profiles.business_id`,
  como funciona hoy — solo se quita el bloqueo actual a un negocio único).
- Landing de producto en el dominio raíz (`tuapp.com`).
- Página "negocio no encontrado" para subdominios inválidos/inactivos.
- Entorno de desarrollo local con subdominios (`{slug}.localhost:3000`).

**Explícitamente fuera de v1** (sub-proyectos separados, con su propia spec):
- Flujo de registro/onboarding de un negocio nuevo (los negocios se siguen creando
  a mano en la base, como hoy).
- Cobro, planes o límites de uso.
- Dominio propio del cliente (`tacoselnijo.com` en vez de `tacos.tuapp.com`).
- Hacer tenant-aware el widget de chat / el bot de Telegram (`AgenteRestaurante/`) —
  siguen fijos a un solo negocio, igual que hoy (ver
  `2026-08-26-web-chat-widget-design.md`, que ya deja esto explícitamente fuera).
- Un panel "super-admin" que vea todos los negocios a la vez (lo habilita esta
  arquitectura, pero no se construye en esta spec).

## Prerequisito manual

Este diseño requiere un dominio propio con DNS wildcard (`*.tuapp.com` →
Vercel). El dominio gratuito compartido `*.vercel.app` no soporta subdominios
propios. **El usuario debe comprar un dominio antes de que esto funcione en
producción** — el desarrollo/testing puede avanzar en paralelo usando
`*.localhost:3000`.

## Configuración

Nueva env var `ROOT_DOMAIN` (solo server-side, igual que `SITE_URL` agregada hoy
para el check anti-CSRF): el dominio base sin protocolo, ej. `tuapp.com` en
producción o `localhost:3000` en desarrollo. Distinta de `SITE_URL` (que incluye
protocolo y se usa para comparar contra el header `Origin`) — sirven a
propósitos relacionados pero no intercambiables.

## Arquitectura

### Antes (single-tenant)

`src/middleware.ts` solo corre en `/admin/:path*` y `/api/:path*` (protección de
sesión + el check de Origin agregado hoy). Todas las páginas de storefront usan
`CURRENT_BUSINESS_ID` como default al llamar a los repositorios
(`SupabaseBusinessRepository.getBusiness(businessId = CURRENT_BUSINESS_ID)`, etc.).
`adminAuth.ts` rechaza a cualquier perfil cuyo `business_id` no sea
`CURRENT_BUSINESS_ID`.

### Después (resolución por hostname en middleware)

El `matcher` de `src/middleware.ts` se extiende para correr en todas las rutas
(excluyendo assets estáticos: `_next/static`, `_next/image`, favicon, etc.). Al
inicio de `middleware()`, antes de la lógica de auth existente, se agrega:

```ts
function classifyHost(host: string): { kind: 'root' | 'admin' | 'store'; slug?: string } {
  const rootDomain = process.env.ROOT_DOMAIN; // ej. "tuapp.com", o "localhost:3000" en dev
  const bareHost = host.replace(/:\d+$/, '');
  const bareRoot = rootDomain!.replace(/:\d+$/, '');

  if (bareHost === bareRoot || bareHost === `www.${bareRoot}`) return { kind: 'root' };
  if (bareHost === `admin.${bareRoot}`) return { kind: 'admin' };

  const sub = bareHost.endsWith(`.${bareRoot}`) ? bareHost.slice(0, -(bareRoot.length + 1)) : null;
  return sub ? { kind: 'store', slug: sub } : { kind: 'root' }; // host desconocido -> trata como root (evita filtrar existencia de slugs)
}
```

- `kind: 'root'` → deja pasar sin rewrite (sirve el route group de landing).
- `kind: 'admin'` → deja pasar hacia `/admin/*` (lógica de auth existente, sin
  cambios en esa parte).
- `kind: 'store'` → busca `businesses` por `slug` (consulta pública, ya permitida
  por RLS: `select id, active from businesses where slug = eq.<slug>`, vía
  `fetch` directo al REST de Supabase con la anon key — el middleware corre en
  Edge runtime, no puede usar un cliente Postgres normal).
  - Si no existe o `active = false` → `NextResponse.rewrite` hacia
    `/negocio-no-encontrado` (404 propio).
  - Si existe → construye `NextResponse.rewrite` hacia el mismo pathname bajo el
    route group de storefront, y **antes** de retornar la respuesta, hace
    `requestHeaders.set('x-business-id', business.id)` sobre una copia de los
    headers del request — esto **sobreescribe** cualquier valor que el cliente
    haya mandado con ese mismo nombre de header, así que no es spoofeable. RLS
    sigue siendo la barrera de verdad; este header es solo para que las páginas
    sepan qué pedirle a los repositorios sin tener que volver a consultar
    `businesses` por slug en cada Server Component.

### Reorganización de rutas (App Router)

```
src/app/
  (marketing)/          # nuevo: landing de producto, servido en el dominio raíz
    page.tsx
  (storefront)/          # antes vivía directo en src/app/, se mueve acá sin cambiar UI
    page.tsx              # home del negocio resuelto
    checkout/
    order/[id]/
    ...
  admin/                 # sin cambios de estructura, solo se accede vía admin.tuapp.com
  negocio-no-encontrado/
    page.tsx
```

Los grupos de rutas (`(marketing)`, `(storefront)`) no cambian la URL visible —
solo organizan el código. El middleware decide, vía `rewrite`, cuál grupo
responde a `/`.

### Plumbing del `business_id` resuelto

Un helper server-only nuevo, `src/lib/tenant.ts`:

```ts
import { headers } from 'next/headers';

export async function getResolvedBusinessId(): Promise<string> {
  const h = await headers();
  const id = h.get('x-business-id');
  if (!id) throw new Error('TENANT_NOT_RESOLVED: llamado fuera de una ruta de storefront.');
  return id;
}
```

Los layouts/páginas de `(storefront)` lo llaman una vez y pasan el `business_id`
explícito a los repositorios existentes (`SupabaseBusinessRepository.getBusiness(id)`,
`SupabaseProductRepository.getAllProducts(id)`, etc.) — **no se tocan las firmas
de los repositorios**, ya aceptan `businessId` como parámetro; solo se deja de
confiar en su default.

### `adminAuth.ts`

Se elimina el check `businessId !== CURRENT_BUSINESS_ID` (paso 5 actual de
`verifyAdminSession`). El `businessId` autorizado pasa a ser, sin condición
adicional, el `profile.business_id` real del usuario autenticado — RLS ya
garantiza que ese perfil no puede leer/escribir datos de otro negocio aunque el
código de la app tuviera un bug.

### `CURRENT_BUSINESS_ID`

Se mantiene en `src/config/business.ts` **únicamente** como fallback del modo
demo (`NEXT_PUBLIC_DEMO_MODE=true`, que sigue sirviendo un solo negocio de
muestra sin base de datos real). Fuera de modo demo, ningún código de request
real debe depender de esa constante.

## Manejo de errores

- Subdominio sin negocio asociado, o negocio con `active = false` → página propia
  `negocio-no-encontrado` (evita filtrar si un slug existe pero está inactivo vs.
  si nunca existió — mismo mensaje genérico para ambos casos).
- Host completamente desconocido (no matchea ni root ni `*.{root}`) → se trata
  como `root` (sirve la landing) en vez de 404 — cubre casos como visitar la IP
  directa o un dominio mal apuntado sin romper.
- Falla la consulta a Supabase en el middleware (red, timeout) → *fail closed*:
  se sirve `negocio-no-encontrado` con un mensaje de error temporal, nunca se
  deja pasar el request sin resolver el tenant.

## Testing

- Unit test de `classifyHost()` (función pura, sin red) cubriendo: dominio raíz,
  `www`, `admin.*`, `{slug}.*`, host desconocido, con y sin puerto (dev vs prod).
- Manual/E2E local: sembrar 2 negocios de prueba, verificar que
  `negocio-a.localhost:3000` y `negocio-b.localhost:3000` muestran cada uno su
  propio menú/marca, que `admin.localhost:3000` deja entrar a un empleado de
  cada negocio y cada uno solo ve sus propios pedidos/productos (test funcional
  end-to-end del aislamiento de RLS ya construido), y que un slug inventado
  devuelve `negocio-no-encontrado`.
- Confirmar que el header `x-business-id` mandado manualmente por el cliente
  (ej. con `curl -H "x-business-id: <otro-negocio>"`) es ignorado — el valor que
  llega al Server Component debe ser siempre el que resolvió el middleware por
  hostname, nunca el del cliente.
