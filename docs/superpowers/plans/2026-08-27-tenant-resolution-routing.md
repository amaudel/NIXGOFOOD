# Tenant Resolution Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one request-per-hostname mechanism resolve which business (tenant) a request belongs to — subdomain for the public storefront, centralized login for admin, landing on the root domain — and prove it end-to-end through the storefront home page and the admin login/dashboard.

**Architecture:** `src/middleware.ts` classifies every request by `Host` header (root / `admin.*` / `{slug}.*` / unknown), resolves a `business_id` (via a `businesses.slug` lookup for storefront, via the already-existing `profiles.business_id` lookup for admin), and forwards it downstream through a server-only request header (`x-business-id`) that middleware always overwrites — never trusts a client-supplied value. Storefront pages move under `/store/*` (rewritten to internally, URL stays the same for the visitor) and admin pages keep their existing `/admin/*` paths. `AppProvider`/`BranchProvider` (currently singleton, root-mounted, implicitly using a hardcoded `CURRENT_BUSINESS_ID`) become explicit: each gets instantiated once per section (storefront, admin) with the resolved `business_id` passed as a prop.

**Tech Stack:** Next.js App Router (existing), `@supabase/ssr` (existing), Vitest (existing).

**Spec:** `docs/superpowers/specs/2026-08-27-tenant-resolution-design.md`

## Global Constraints

- `SITE_URL` and `ROOT_DOMAIN` are server-only env vars (no `NEXT_PUBLIC_` prefix) — nothing in this plan reads them from client code.
- Never trust a client-supplied `x-business-id` header. Middleware must always call `.set()` (not merge/append) before forwarding, which overwrites any value the client sent.
- `CURRENT_BUSINESS_ID` (`src/config/business.ts`) stays only as the Demo Mode fallback. No new code added by this plan may read it for a non-demo request.
- Repository call sites **outside** the ones this plan touches (checkout, the 13 admin pages, delivery zones/business hours/motorizados reads) stay on their current default-parameter behavior — they are explicitly out of scope, tracked as a separate follow-up plan (see spec's "Explícitamente fuera de v1").
- Follow existing code conventions: Spanish inline comments only where they explain a non-obvious *why* (matches the rest of the codebase); TypeScript strict typing; no new dependencies.

---

### Task 1: `classifyHost()` + `getResolvedBusinessId()` helpers

**Files:**
- Create: `src/lib/tenant.ts`
- Test: `src/lib/tenant.test.ts`

**Interfaces:**
- Produces: `classifyHost(host: string, rootDomain: string): TenantRoute` where
  `type TenantRoute = { kind: 'root' } | { kind: 'admin' } | { kind: 'store'; slug: string } | { kind: 'unknown' }`
- Produces: `getResolvedBusinessId(): Promise<string | null>` — reads the `x-business-id` header set by middleware; returns `null` if absent (never throws — callers decide whether that's an error).

- [ ] **Step 1: Write the failing tests for `classifyHost`**

```typescript
// src/lib/tenant.test.ts
import { describe, it, expect } from 'vitest';
import { classifyHost } from './tenant';

describe('classifyHost', () => {
  const root = 'tuapp.com';

  it('clasifica el dominio raiz', () => {
    expect(classifyHost('tuapp.com', root)).toEqual({ kind: 'root' });
  });

  it('clasifica www como raiz', () => {
    expect(classifyHost('www.tuapp.com', root)).toEqual({ kind: 'root' });
  });

  it('clasifica el subdominio admin', () => {
    expect(classifyHost('admin.tuapp.com', root)).toEqual({ kind: 'admin' });
  });

  it('clasifica un subdominio de negocio y extrae el slug', () => {
    expect(classifyHost('tacos-el-nijo.tuapp.com', root)).toEqual({
      kind: 'store',
      slug: 'tacos-el-nijo',
    });
  });

  it('ignora el puerto al comparar (dev local)', () => {
    expect(classifyHost('admin.localhost:3000', 'localhost:3000')).toEqual({ kind: 'admin' });
    expect(classifyHost('tacos.localhost:3000', 'localhost:3000')).toEqual({
      kind: 'store',
      slug: 'tacos',
    });
  });

  it('clasifica un host que no matchea ni raiz ni subdominio propio como unknown', () => {
    expect(classifyHost('otrositio.com', root)).toEqual({ kind: 'unknown' });
  });

  it('un subdominio con mas de un nivel no matchea (evita falsos positivos)', () => {
    expect(classifyHost('a.b.tuapp.com', root)).toEqual({ kind: 'unknown' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/tenant.test.ts`
Expected: FAIL — `Cannot find module './tenant'` (el archivo aún no existe).

- [ ] **Step 3: Implement `classifyHost` and `getResolvedBusinessId`**

```typescript
// src/lib/tenant.ts
import { headers } from 'next/headers';

export type TenantRoute =
  | { kind: 'root' }
  | { kind: 'admin' }
  | { kind: 'store'; slug: string }
  | { kind: 'unknown' };

function stripPort(host: string): string {
  return host.replace(/:\d+$/, '');
}

/**
 * Decide que "seccion" de la app corresponde a un hostname.
 * Puro: sin red, sin acceso a Next.js request — testeable en aislamiento.
 */
export function classifyHost(host: string, rootDomain: string): TenantRoute {
  const bareHost = stripPort(host);
  const bareRoot = stripPort(rootDomain);

  if (bareHost === bareRoot || bareHost === `www.${bareRoot}`) return { kind: 'root' };
  if (bareHost === `admin.${bareRoot}`) return { kind: 'admin' };

  const suffix = `.${bareRoot}`;
  if (bareHost.endsWith(suffix)) {
    const sub = bareHost.slice(0, -suffix.length);
    // Un solo nivel de subdominio (sin puntos internos) -> slug de negocio valido.
    if (sub.length > 0 && !sub.includes('.')) {
      return { kind: 'store', slug: sub };
    }
  }

  return { kind: 'unknown' };
}

/**
 * Lee el business_id ya resuelto por el middleware (header server-only,
 * sobreescrito siempre por el middleware -> nunca confiable si viniera del
 * cliente, pero aqui solo se lee lo que el propio servidor puso).
 */
export async function getResolvedBusinessId(): Promise<string | null> {
  const h = await headers();
  return h.get('x-business-id');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/tenant.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant.ts src/lib/tenant.test.ts
git commit -m "feat: add classifyHost/getResolvedBusinessId tenant helpers"
```

---

### Task 2: "Negocio no encontrado" page

**Files:**
- Create: `src/app/negocio-no-encontrado/page.tsx`

**Interfaces:**
- Consumes: nothing (static page, no data fetching).
- Produces: a route at `/negocio-no-encontrado` that Task 3's middleware rewrites unresolved store subdomains to.

- [ ] **Step 1: Create the page**

```tsx
// src/app/negocio-no-encontrado/page.tsx
export default function NegocioNoEncontradoPage() {
  return (
    <html lang="es" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center antialiased">
        <div className="text-center px-4 space-y-3">
          <h1 className="text-2xl font-extrabold">Negocio no encontrado</h1>
          <p className="text-zinc-400 max-w-md">
            Este enlace no corresponde a ningún negocio activo. Verifica la
            dirección o contacta a quien te la compartió.
          </p>
        </div>
      </body>
    </html>
  );
}
```

Nota: esta página se sirve vía `rewrite` desde CUALQUIER hostname de negocio
inválido, así que trae su propio `<html>/<body>` en vez de heredar el layout
raíz (evita depender de un layout que puede estar resolviendo otra sección).

- [ ] **Step 2: Verify it renders**

Run the dev server preview, navigate to `http://localhost:3000/negocio-no-encontrado` directly, confirm the message renders with no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/negocio-no-encontrado/page.tsx
git commit -m "feat: add negocio-no-encontrado page"
```

---

### Task 3: Middleware — hostname-based routing and tenant resolution

**Files:**
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `classifyHost`, `TenantRoute` from `src/lib/tenant.ts` (Task 1).
- Produces: every downstream request under `/store/*` and `/admin/*` carries a
  reliable `x-business-id` header (or the request never reaches those paths —
  it gets rewritten to `/negocio-no-encontrado` or 404 first).

- [ ] **Step 1: Add the business-slug lookup and the routing logic**

Antes de escribir código: este repo usa una versión de Next.js con cambios
respecto al training data (ver `AGENTS.md` en la raíz). Verifica en
`node_modules/next/dist/docs/` que `NextResponse.rewrite(url, { request: { headers } })`
sigue siendo la forma correcta de reenviar headers modificados junto con un
rewrite en la versión instalada — si la API cambió, ajusta el código de abajo
a lo que documenten esos archivos, no lo copies ciegamente.

Replace the full contents of `src/middleware.ts` with:

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { classifyHost } from '@/lib/tenant';

// Origenes propios de la app. SITE_URL debe apuntar al dominio de produccion
// (ej. https://nixgofood.vercel.app); localhost queda permitido solo para
// desarrollo.
function getAllowedOrigins(): string[] {
  const origins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  // SITE_URL (sin prefijo NEXT_PUBLIC_) a proposito: esta funcion solo corre
  // server-side en middleware.ts, no necesita exponerse al bundle del cliente.
  const siteUrl = process.env.SITE_URL;
  if (siteUrl) origins.push(siteUrl.replace(/\/$/, ''));
  return origins;
}

// CORS no detiene curl/Postman/scripts (ignoran el header Origin), pero si
// bloquea que JS de OTRO sitio web haga peticiones de escritura contra esta
// API usando la sesion/cookies de un visitante (CSRF cross-site). La defensa
// real contra llamadas directas sigue siendo RLS + los checks de sesion en
// cada ruta.
function isBlockedCrossOriginApiWrite(request: NextRequest): boolean {
  if (!request.nextUrl.pathname.startsWith('/api/')) return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;

  const origin = request.headers.get('origin');
  if (!origin) return false; // server-to-server / cron / apps nativas: sin Origin, no es un navegador cross-site

  return !getAllowedOrigins().includes(origin.replace(/\/$/, ''));
}

// Busca el negocio activo por slug via REST directo (anon key, consulta
// publica ya permitida por RLS). Falla cerrado: cualquier error de red o
// respuesta inesperada devuelve null, nunca deja pasar un tenant sin resolver.
async function findActiveBusinessIdBySlug(slug: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/businesses?slug=eq.${encodeURIComponent(slug)}&select=id,active&limit=1`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
    );
    if (!res.ok) return null;
    const rows: { id: string; active: boolean }[] = await res.json();
    const business = rows[0];
    return business && business.active ? business.id : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  if (isBlockedCrossOriginApiWrite(request)) {
    return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403 });
  }

  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const rootDomain = process.env.ROOT_DOMAIN || 'localhost:3000';
  const host = request.headers.get('host') || rootDomain;
  const route = classifyHost(host, rootDomain);
  const { pathname } = request.nextUrl;

  // Rutas /api/* y /_next/* nunca se reescriben por tenant: la resolucion de
  // negocio para llamadas de API vive en cada route handler (via
  // getResolvedBusinessId en las paginas que las invocan), no en el gateway.
  const skipTenantRewrite = pathname.startsWith('/api/') || pathname.startsWith('/negocio-no-encontrado');

  if (!skipTenantRewrite) {
    if (route.kind === 'admin') {
      if (!pathname.startsWith('/admin')) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin' + pathname;
        return NextResponse.rewrite(url);
      }
      // deja pasar tal cual hacia el bloque de auth de admin, mas abajo
    } else if (pathname.startsWith('/admin')) {
      // /admin solo es accesible desde admin.{rootDomain} -- en cualquier
      // otro host (raiz, tienda, desconocido) no existe.
      return new NextResponse('Not Found', { status: 404 });
    } else if (route.kind === 'store') {
      const businessId = isDemo ? 'demo' : await findActiveBusinessIdBySlug(route.slug);
      if (!businessId) {
        const url = request.nextUrl.clone();
        url.pathname = '/negocio-no-encontrado';
        return NextResponse.rewrite(url);
      }
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-business-id', businessId); // sobreescribe cualquier valor mandado por el cliente
      const url = request.nextUrl.clone();
      url.pathname = '/store' + pathname;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    } else if (route.kind === 'unknown') {
      // Host que no matchea ni la raiz ni un subdominio propio: se sirve la
      // landing en vez de un 404 generico (cubre IP directa, DNS mal
      // apuntado, etc.)
      return NextResponse.next();
    }
    // route.kind === 'root': deja pasar, sirve la landing en '/'
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // In Demo Mode or unconfigured Supabase, pass through cleanly without auth redirect
  if (isDemo || !supabaseUrl || supabaseUrl === 'https://your-project.supabase.co' || supabaseUrl === 'https://placeholder.supabase.co') {
    return response;
  }

  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect all /admin routes in REAL MODE BEFORE render (except /admin/login)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    // 1. Enforce active user session (Blocks unauthenticated requests 100%)
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }

    // 2. Validate Profile Role & Active Status if profile record exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, business_id, role, active')
      .eq('id', user.id)
      .single();

    const ALLOWED_ADMIN_ROLES = ['owner', 'admin', 'operator'];

    if (!profile || profile.active === false || !ALLOWED_ADMIN_ROLES.includes(profile.role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('error', 'unauthorized_role');
      return NextResponse.redirect(url);
    }

    // 3. Perfil valido: reenvia el business_id resuelto (mismo mecanismo que
    // el storefront, nunca confiable si viniera del cliente).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-business-id', profile.business_id);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Cambios clave respecto al archivo anterior:
- El `matcher` ahora cubre todo el sitio (antes solo `/admin` y `/api`),
  necesario para clasificar `root`/`store`/`unknown`.
- `route.kind === 'store'` reescribe hacia `/store/*` con `x-business-id`
  seteado desde la base (nunca desde el cliente).
- El bloque de auth de admin existente se mantiene intacto, solo se le agrega
  el paso 3 (reenviar `x-business-id` desde `profile.business_id`).
- `pathname.startsWith('/admin')` en un host que no es `admin.*` devuelve 404
  directo, antes de siquiera intentar el resto de la logica.

- [ ] **Step 2: Add the new env vars to `.env.example`**

```diff
--- a/.env.example
+++ b/.env.example
@@
+# Dominio raiz sin protocolo, usado por middleware.ts para clasificar
+# hostnames (root / admin.* / {slug}.*). En dev local: "localhost:3000".
+ROOT_DOMAIN=localhost:3000
+
 # Dominio de produccion de esta app (sin slash final). Usado por middleware.ts
```

- [ ] **Step 3: Manual verification (no automated test for middleware — Edge runtime request routing isn't unit-testable without a running server)**

Start the dev server preview. With `ROOT_DOMAIN=localhost:3000` in `.env.local`:
- `http://localhost:3000/` → loads without error (still the old home page for now — Task 4 moves it).
- `http://localhost:3000/admin` → 404 (correct: admin only lives on `admin.localhost:3000` from here on).
- `http://admin.localhost:3000/admin/login` → loads the existing login page.
- `http://cualquier-slug.localhost:3000/` → in demo mode, passes straight through with `x-business-id: demo` (verify via `curl -v` that the response isn't a rewrite loop); confirm no infinite redirect/rewrite loop.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts .env.example
git commit -m "feat: resolve tenant by hostname in middleware"
```

---

### Task 4: Move storefront under `/store`, minimal root layout, per-section providers

**Files:**
- Modify: `src/app/layout.tsx` (strip down to the bare html/body shell)
- Create: `src/app/store/layout.tsx` (the old `layout.tsx` body content, now business-scoped)
- Move: `src/app/page.tsx` → `src/app/store/page.tsx` (content unchanged)
- Move: `src/app/checkout/` → `src/app/store/checkout/` (content unchanged)
- Move: `src/app/order/` → `src/app/store/order/` (content unchanged)

**Interfaces:**
- Consumes: `getResolvedBusinessId()` (Task 1); `AppProvider`/`BranchProvider` accepting a `businessId` prop (Task 6 — this task passes the prop, Task 6 makes the components use it, so land Task 6 first if executing strictly in order, or treat 4+6 as landing together).

- [ ] **Step 1: Move the storefront route files**

```bash
mkdir -p src/app/store
git mv src/app/page.tsx src/app/store/page.tsx
git mv src/app/checkout src/app/store/checkout
git mv src/app/order src/app/store/order
```

- [ ] **Step 2: Replace `src/app/layout.tsx` with the minimal shell**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NIXGOFOOD',
  description: 'Menús digitales para restaurantes.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create `src/app/store/layout.tsx` with the moved content, business-scoped**

```tsx
// src/app/store/layout.tsx
import { AppProvider } from '@/context/AppContext';
import { BranchProvider } from '@/context/BranchContext';
import { Header } from '@/components/Header';
import { ActiveOrderBar } from '@/components/ActiveOrderBar';
import { CartDrawer } from '@/components/CartDrawer';
import { StickyCartBar } from '@/components/StickyCartBar';
import { ModalWrapper } from '@/components/ModalWrapper';
import ChatWidget from '@/components/ChatWidget';
import { getResolvedBusinessId } from '@/lib/tenant';

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const businessId = await getResolvedBusinessId();
  if (!businessId) {
    // El middleware garantiza que solo se llega aca con un business_id
    // resuelto (slugs invalidos se reescriben a /negocio-no-encontrado antes).
    throw new Error('TENANT_NOT_RESOLVED: /store renderizado sin x-business-id.');
  }

  return (
    <BranchProvider scope="customer" businessId={businessId}>
      <AppProvider businessId={businessId}>
        <Header />
        <ActiveOrderBar />
        <main className="flex-1 pb-20 sm:pb-8">{children}</main>
        <CartDrawer />
        <StickyCartBar />
        <ModalWrapper />
        <ChatWidget />
      </AppProvider>
    </BranchProvider>
  );
}
```

- [ ] **Step 4: Verify the app still builds (providers won't accept `businessId` yet until Task 6 — expected TypeScript error at this point)**

Run: `npx tsc --noEmit`
Expected: FAIL with `Property 'businessId' does not exist on type...` for `AppProvider`/`BranchProvider` — this is expected until Task 6 lands. Do not commit yet if executing tasks strictly in isolation; if using subagent-driven execution, land Task 6 immediately after this step before committing either.

- [ ] **Step 5: Commit** (only after Task 6's prop changes are also in the working tree)

```bash
git add src/app/layout.tsx src/app/store src/app/page.tsx src/app/checkout src/app/order
git commit -m "feat: move storefront routes under /store with a business-scoped layout"
```

---

### Task 5: Marketing landing page

**Files:**
- Create: `src/app/page.tsx` (new — the root path is free now that Task 4 moved the storefront to `/store`)

**Interfaces:**
- Consumes: nothing.
- Produces: the page served for `route.kind === 'root'` and `route.kind === 'unknown'` hosts.

- [ ] **Step 1: Create the landing page**

```tsx
// src/app/page.tsx
export default function MarketingHomePage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center max-w-lg space-y-4">
        <h1 className="text-3xl font-extrabold">NIXGOFOOD</h1>
        <p className="text-zinc-400">
          Crea el menú digital de tu restaurante y recibe pedidos en minutos.
        </p>
      </div>
    </div>
  );
}
```

Placeholder intencional — el flujo real de registro/ventas es un sub-proyecto
aparte (ver spec, "Explícitamente fuera de v1").

- [ ] **Step 2: Verify it renders at the root**

With the dev server running and `ROOT_DOMAIN=localhost:3000`, visit `http://localhost:3000/` and confirm the landing text shows (not the old storefront menu, which now only lives under a business subdomain).

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add marketing landing page at the root domain"
```

---

### Task 6: Thread `businessId` through `AppProvider` and `BranchProvider`

**Files:**
- Modify: `src/context/AppContext.tsx:81` (component signature + Step 1's `useEffect`)
- Modify: `src/context/BranchContext.tsx:29-46` (component signature + branch fetch)

**Interfaces:**
- Consumes: `businessId: string` passed by `src/app/store/layout.tsx` (Task 4) and `src/app/admin/layout.tsx` (Task 7).
- Produces: `AppProvider: React.FC<{ businessId: string; children: React.ReactNode }>`, `BranchProvider: React.FC<{ scope: 'customer' | 'admin'; businessId: string; children: React.ReactNode }>` — both now require the caller to supply the tenant explicitly, no implicit default.

- [ ] **Step 1: Update `AppProvider`'s signature and data loading**

In `src/context/AppContext.tsx`, change:

```diff
-export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
+export const AppProvider: React.FC<{ businessId: string; children: React.ReactNode }> = ({
+  businessId,
+  children,
+}) => {
```

and:

```diff
   useEffect(() => {
     const loadCatalogAndOrders = async () => {
       try {
         const [catData, prodData, orderData] = await Promise.all([
-          ProductRepository.getCategories(),
-          ProductRepository.getAllProducts(),
-          OrderRepository.getOrders(),
+          ProductRepository.getCategories(businessId),
+          ProductRepository.getAllProducts(businessId),
+          OrderRepository.getOrders(businessId),
         ]);
```

and update the effect's dependency array so it reloads if `businessId` ever changes client-side (SPA navigation between two business subdomains doesn't happen in this app, but this keeps the hook honest):

```diff
     loadCatalogAndOrders();

     const unsubscribe = DemoBroadcastService.subscribe(() => {
       loadCatalogAndOrders();
     });

     return () => unsubscribe();
-  }, []);
+  }, [businessId]);
```

- [ ] **Step 2: Update `BranchProvider`'s signature and branch loading**

In `src/context/BranchContext.tsx`, change:

```diff
 export const BranchProvider: React.FC<{
   scope: 'customer' | 'admin';
+  businessId: string;
   children: React.ReactNode;
-}> = ({ scope, children }) => {
+}> = ({ scope, businessId, children }) => {
```

and:

```diff
         const repo = getBusinessRepository();
         const [branchList, zoneList] = await Promise.all([
-          repo.getBranches(CURRENT_BUSINESS_ID),
+          repo.getBranches(businessId),
           repo.getDeliveryZones(),
         ]);
```

(`getDeliveryZones()` stays as-is — it doesn't accept a `businessId` param yet;
that's part of the follow-up plan, not a regression introduced here.)

Remove the now-unused import:

```diff
-import { activeBranch, CURRENT_BUSINESS_ID } from '@/config/business';
+import { activeBranch } from '@/config/business';
```

and add `businessId` to the effect's dependency array:

```diff
     cargar();
     return () => {
       cancelado = true;
     };
-  }, [storageKey]);
+  }, [storageKey, businessId]);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: the `businessId does not exist` errors from Task 4 are now gone. Any *other* pre-existing call site that still constructs `<AppProvider>`/`<BranchProvider>` without `businessId` (i.e. `src/app/admin/layout.tsx`, until Task 7 lands) will now show a new, expected type error — that's the signal Task 7 needs to land next.

- [ ] **Step 4: Commit**

```bash
git add src/context/AppContext.tsx src/context/BranchContext.tsx
git commit -m "feat: require explicit businessId in AppProvider/BranchProvider"
```

---

### Task 7: Wire the admin layout to its own resolved `businessId`

**Files:**
- Modify: `src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `getResolvedBusinessId()` (Task 1, now populated for `/admin/*` by Task 3's middleware step 3), `AppProvider`/`BranchProvider` (Task 6).

- [ ] **Step 1: Update the admin layout**

```tsx
// src/app/admin/layout.tsx
import type { ReactNode } from 'react';
import { NewOrderAlertProvider } from '@/context/NewOrderAlertContext';
import { BranchProvider } from '@/context/BranchContext';
import { AppProvider } from '@/context/AppContext';
import { getResolvedBusinessId } from '@/lib/tenant';

export default async function AdminRouteLayout({ children }: { children: ReactNode }) {
  const businessId = await getResolvedBusinessId();

  // /admin/login no tiene sesion todavia -> el middleware no resuelve
  // business_id para esa ruta a proposito. Se deja pasar sin envolver en los
  // providers de datos (la pantalla de login no los necesita).
  if (!businessId) {
    return <>{children}</>;
  }

  return (
    <BranchProvider scope="admin" businessId={businessId}>
      <AppProvider businessId={businessId}>
        <NewOrderAlertProvider>{children}</NewOrderAlertProvider>
      </AppProvider>
    </BranchProvider>
  );
}
```

- [ ] **Step 2: Type-check and confirm no remaining errors**

Run: `npx tsc --noEmit`
Expected: PASS, no errors anywhere in the project.

- [ ] **Step 3: Verify `/admin/login` still renders without a business context**

Dev server preview: visit `http://admin.localhost:3000/admin/login`, confirm the login form renders (no thrown error from the layout).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat: resolve admin business_id from profile via middleware header"
```

---

### Task 8: End-to-end verification with two real tenants

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Prerequisites**

- `.env.local`: `NEXT_PUBLIC_DEMO_MODE=false`, real `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` pointing at a Supabase project with today's RLS hardening migrations applied, `ROOT_DOMAIN=localhost:3000`.
- In that project's SQL Editor, seed a second business (reuse the existing `b0000000-...-001` "El Taca Nijo" as business A) plus a `profiles` row for a test auth user scoped to each business, e.g.:

```sql
insert into businesses (id, name, slug, active)
values ('c0000000-0000-0000-0000-000000000099', 'Burger House', 'burger-house', true);

insert into categories (business_id, name, slug, active)
values ('c0000000-0000-0000-0000-000000000099', 'Hamburguesas', 'hamburguesas', true);

insert into products (business_id, category_id, name, price, active, available)
select 'c0000000-0000-0000-0000-000000000099', c.id, 'Burger Clásica', 6.50, true, true
from categories c where c.business_id = 'c0000000-0000-0000-0000-000000000099';
```

- [ ] **Step 2: Storefront isolation**

- Visit `http://tacos-el-nijo.localhost:3000/` (use the real slug of business A) — confirm the menu shown is business A's.
- Visit `http://burger-house.localhost:3000/` — confirm it shows "Burger Clásica", NOT business A's products.
- Visit `http://negocio-inventado.localhost:3000/` — confirm `/negocio-no-encontrado` renders.

- [ ] **Step 3: Admin isolation**

- Create (via Supabase Auth, or the existing signup path) one user with a `profiles` row for business A and one for business B.
- Log in as each at `http://admin.localhost:3000/admin/login` and confirm each only sees their own business's data on the dashboard/orders/menu admin pages — this is a live functional re-check of the RLS isolation built earlier today, now exercised through real per-tenant admin sessions instead of a single hardcoded business.

- [ ] **Step 4: Spoofing check**

```bash
curl -i -H "x-business-id: c0000000-0000-0000-0000-000000000099" http://tacos-el-nijo.localhost:3000/
```

Confirm the response still reflects business A's data (the client-supplied header must be ignored — middleware overwrites it before the request reaches `src/app/store/layout.tsx`).

- [ ] **Step 5: Record results**

No commit for this task — if any step fails, fix the offending task's code, re-run that task's own verification step, then re-run this task's steps from the top before considering the plan done.
