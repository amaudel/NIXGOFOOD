# Platform Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the platform owner (not a per-restaurant admin) one screen at `/platform` listing every NIXGOFOOD business with its agent health status and basic stats, and letting them edit each business's agent tone/FAQ without SQL.

**Architecture:** A new `is_platform_admin` boolean on `profiles`, checked by two new `SECURITY DEFINER` RPCs (`platform_list_businesses`, `platform_update_agent_config`) that gate all cross-business reads/writes at the database layer — mirroring the project's existing `current_user_business_id()`/`current_user_role()` pattern. A parallel guard block in `middleware.ts` protects the `/platform` route before render, reusing the existing `/admin/login` page. Three new API routes proxy to those RPCs and to the Worker's already-deployed `/health-check` endpoint (same server-to-server proxy pattern as `/api/agent-chat`). One new client-rendered page shows it all.

**Tech Stack:** Next.js App Router (Route Handlers, middleware), Supabase (Postgres RPCs, RLS), React client component — no new libraries.

**Spec:** `docs/superpowers/specs/2026-09-11-platform-admin-dashboard-design.md`

## Global Constraints

- No changes to the AgenteRestaurante Worker repo — `/health-check?slug=X` already exists and is consumed as-is.
- `profiles.business_id` is nullable (not `NOT NULL`); `profiles.role` IS required (`CHECK (role IN ('owner', 'admin', 'kitchen', 'dispatch'))`) — a platform-only profile still needs a valid `role` value even with `business_id = NULL`.
- `/platform` is exclusively for the platform owner — never for a per-restaurant admin, regardless of their `role`.
- No new UI library, no `AdminLayout`/`BranchProvider` reuse for `/platform` — those assume a single resolved business, which this screen deliberately has none of.
- Follow the project's established testing style: `tsc --noEmit` + real browser verification against production. No new unit test files (NIXGOFOOD's vitest suite has no admin/platform coverage today and this plan doesn't add any).
- Pushing to `origin/main` requires the user's explicit per-instance confirmation (same as every other push this session).

---

### Task 1: Database schema and RPCs

**Files:**
- Create: `supabase/migrations/20260911000100_platform_admin.sql`

**Interfaces:**
- Produces: `public.current_user_is_platform_admin(): boolean`, `public.platform_list_businesses(): jsonb` (array of `{id, name, slug, active, agentPersona, agentFaq, ordersLast7d, reservationsLast7d}`), `public.platform_update_agent_config(p_business_id uuid, p_persona text, p_faq text): void`. Consumed by Task 3's API routes.

- [ ] **Step 1: Write the migration**

```sql
-- Rol de plataforma: ve/gestiona TODOS los negocios, independiente del rol
-- por negocio que un perfil ya tenga (o no tenga - business_id puede ser
-- NULL). Mismo estilo exacto que current_user_business_id()/
-- current_user_role() en 20260827000000_rls_hardening.sql.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(is_platform_admin, false) FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_platform_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_is_platform_admin() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.platform_list_businesses()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_since TIMESTAMPTZ := now() - INTERVAL '7 days';
BEGIN
  IF NOT public.current_user_is_platform_admin() THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'active', b.active,
      'agentPersona', b.agent_persona, 'agentFaq', b.agent_faq,
      'ordersLast7d', (SELECT count(*) FROM public.orders o WHERE o.business_id = b.id AND o.created_at >= v_since),
      'reservationsLast7d', (SELECT count(*) FROM public.reservations r WHERE r.business_id = b.id AND r.created_at >= v_since)
    ))
    FROM public.businesses b
    ORDER BY b.name
  ), '[]'::jsonb);
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
  UPDATE public.businesses SET agent_persona = NULLIF(p_persona, ''), agent_faq = NULLIF(p_faq, '') WHERE id = p_business_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_businesses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_agent_config(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_list_businesses() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_update_agent_config(UUID, TEXT, TEXT) FROM PUBLIC, anon;
```

Note the `ORDER BY b.name` above matches `jsonb_agg` order non-deterministically in Postgres unless the subquery is pre-sorted — this is fine for a small admin list (correctness, not performance, matters here), but if rows ever look unsorted in the UI, sort client-side instead of relying on this.

- [ ] **Step 2: Commit**

```bash
cd "C:\Users\andres.delgado\Desktop\Aplicaciones\NIXGOFOOD"
git add supabase/migrations/20260911000100_platform_admin.sql
git commit -m "Add is_platform_admin + platform_list_businesses/platform_update_agent_config RPCs"
```

- [ ] **Step 3: Run the migration**

The user runs the migration's SQL (Step 1's content) in the Supabase SQL Editor — same pattern as every prior schema change this session. Confirm by querying:

```sql
select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'is_platform_admin';
```

Expected: one row.

---

### Task 2: Platform-admin auth guard

**Files:**
- Modify: `src/lib/auth/adminAuth.ts`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `profiles.is_platform_admin` (Task 1).
- Produces: `verifyPlatformAdminSession(): Promise<{ authorized: boolean; status: number; error?: string }>` from `src/lib/auth/adminAuth.ts`, consumed by Task 3's API routes. Middleware protects `/platform/*` before any route/page renders.

- [ ] **Step 1: Add `verifyPlatformAdminSession`**

Add to the end of `src/lib/auth/adminAuth.ts` (same file, new export, same imports already present):

```ts
export interface PlatformAdminAuthResult {
  authorized: boolean;
  status: number;
  error?: string;
}

/**
 * Server-side helper to verify the caller is the platform owner (sees/edits
 * every business), independent of any per-business role they may also have.
 */
export async function verifyPlatformAdminSession(): Promise<PlatformAdminAuthResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { authorized: false, status: 401, error: 'Acceso denegado. Se requiere una sesión activa.' };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_platform_admin, active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.active === false || profile.is_platform_admin !== true) {
      return { authorized: false, status: 403, error: 'Acceso denegado. No eres administrador de la plataforma.' };
    }

    return { authorized: true, status: 200 };
  } catch (err: any) {
    return { authorized: false, status: 500, error: err.message || 'Error interno de verificación de sesión.' };
  }
}
```

- [ ] **Step 2: Add the `/platform` guard block to middleware**

Find this exact current content in `src/middleware.ts` (the closing of the existing `/admin` guard block):

```ts
    // 3. Perfil valido: reenvia el business_id resuelto (mismo mecanismo que
    // el storefront, nunca confiable si viniera del cliente).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-business-id', profile.business_id);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  return response;
}
```

Change to:

```ts
    // 3. Perfil valido: reenvia el business_id resuelto (mismo mecanismo que
    // el storefront, nunca confiable si viniera del cliente).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-business-id', profile.business_id);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Protege /platform - exclusivo del dueño de la plataforma, ningun rol
  // por negocio (owner/admin/kitchen/dispatch de un restaurante) entra aqui.
  if (pathname.startsWith('/platform') && pathname !== '/platform/login') {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    const { data: platformProfile } = await supabase
      .from('profiles')
      .select('is_platform_admin, active')
      .eq('id', user.id)
      .single();

    if (!platformProfile || platformProfile.active === false || platformProfile.is_platform_admin !== true) {
      // 404 en vez de redirect - no revela que la ruta existe a quien no
      // deberia saberlo.
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  return response;
}
```

This reuses the same `supabase` client and `user` variable already established earlier in the middleware function (from the `/admin` block above) — no new Supabase client needed.

- [ ] **Step 3: Type-check**

Run: `cd "C:\Users\andres.delgado\Desktop\Aplicaciones\NIXGOFOOD" && npx tsc --noEmit -p tsconfig.json`
Expected: exit code 0, no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/adminAuth.ts src/middleware.ts
git commit -m "Add verifyPlatformAdminSession and /platform middleware guard"
```

---

### Task 3: API routes

**Files:**
- Create: `src/app/api/platform/businesses/route.ts`
- Create: `src/app/api/platform/businesses/[id]/agent-config/route.ts`
- Create: `src/app/api/platform/businesses/[id]/health/route.ts`

**Interfaces:**
- Consumes: `verifyPlatformAdminSession()` (Task 2), `platform_list_businesses()`/`platform_update_agent_config()` RPCs (Task 1), the Worker's `GET /health-check?slug=X` (already deployed, no change).
- Produces: `GET /api/platform/businesses` → `{ businesses: Array<{id, name, slug, active, agentPersona, agentFaq, ordersLast7d, reservationsLast7d}> }`. `PUT /api/platform/businesses/[id]/agent-config` (body `{ agentPersona: string | null; agentFaq: string | null }`) → `{ ok: true }`. `GET /api/platform/businesses/[id]/health` → the Worker's health-check JSON passthrough. All three consumed by Task 4's UI.

- [ ] **Step 1: List route**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyPlatformAdminSession } from '@/lib/auth/adminAuth';

export async function GET() {
  const auth = await verifyPlatformAdminSession();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_list_businesses');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ businesses: data || [] });
}
```

- [ ] **Step 2: Agent-config update route**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyPlatformAdminSession } from '@/lib/auth/adminAuth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyPlatformAdminSession();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as { agentPersona: string | null; agentFaq: string | null };

  const supabase = await createClient();
  const { error } = await supabase.rpc('platform_update_agent_config', {
    p_business_id: id,
    p_persona: body.agentPersona,
    p_faq: body.agentFaq,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Health-check proxy route**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyPlatformAdminSession } from '@/lib/auth/adminAuth';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_CHAT_URL || '';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyPlatformAdminSession();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!AGENT_URL) {
    return NextResponse.json({ error: 'Agente no disponible.' }, { status: 503 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  let slug = searchParams.get('slug');

  // El caller (la UI) ya tiene el slug de la llamada a /api/platform/businesses -
  // pasarlo evita esta consulta. Sin slug, se resuelve por id como respaldo (esta
  // consulta pasa por RLS vía el cliente autenticado normal; si el negocio está
  // inactivo y no es el propio del admin, RLS la bloquea - por eso el caller
  // SIEMPRE debe mandar el slug que ya tiene, este fallback es solo defensivo).
  if (!slug) {
    const supabase = await createClient();
    const { data: business, error } = await supabase.from('businesses').select('slug').eq('id', id).single();
    if (error || !business) {
      return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
    }
    slug = business.slug;
  }

  try {
    const res = await fetch(`${AGENT_URL}/health-check?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ ready: false, error: 'No se pudo conectar con el agente.' }, { status: 200 });
  }
}
```

- [ ] **Step 4: Type-check**

Run: `cd "C:\Users\andres.delgado\Desktop\Aplicaciones\NIXGOFOOD" && npx tsc --noEmit -p tsconfig.json`
Expected: exit code 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/platform/
git commit -m "Add platform API routes: list businesses, update agent config, health proxy"
```

---

### Task 4: UI

**Files:**
- Create: `src/app/platform/page.tsx`
- Create: `src/components/platform/PlatformDashboardClientPage.tsx`

**Interfaces:**
- Consumes: the three routes from Task 3.

- [ ] **Step 1: Server page (thin, matches `src/app/admin/page.tsx`'s pattern)**

```tsx
import PlatformDashboardClientPage from '@/components/platform/PlatformDashboardClientPage';

export const dynamic = 'force-dynamic';

export default function PlatformDashboardPage() {
  return <PlatformDashboardClientPage />;
}
```

- [ ] **Step 2: Client component**

```tsx
'use client';

import { Fragment, useEffect, useState } from 'react';

interface PlatformBusiness {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  agentPersona: string | null;
  agentFaq: string | null;
  ordersLast7d: number;
  reservationsLast7d: number;
}

interface HealthState {
  loading: boolean;
  ready?: boolean;
  checks?: { label: string; ok: boolean; required: boolean; detail: string }[];
}

export default function PlatformDashboardClientPage() {
  const [businesses, setBusinesses] = useState<PlatformBusiness[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, HealthState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { agentPersona: string; agentFaq: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/platform/businesses')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setBusinesses(data.businesses);
        const initialDrafts: Record<string, { agentPersona: string; agentFaq: string }> = {};
        for (const b of data.businesses as PlatformBusiness[]) {
          initialDrafts[b.id] = { agentPersona: b.agentPersona || '', agentFaq: b.agentFaq || '' };
          setHealth((prev) => ({ ...prev, [b.id]: { loading: true } }));
          fetch(`/api/platform/businesses/${b.id}/health?slug=${encodeURIComponent(b.slug)}`)
            .then((r) => r.json())
            .then((h) => setHealth((prev) => ({ ...prev, [b.id]: { loading: false, ready: h.ready, checks: h.checks } })))
            .catch(() => setHealth((prev) => ({ ...prev, [b.id]: { loading: false, ready: false } })));
        }
        setDrafts(initialDrafts);
      })
      .catch(() => setError('No se pudo cargar la lista de negocios.'));
  }, []);

  async function save(businessId: string) {
    setSaving(businessId);
    const draft = drafts[businessId];
    await fetch(`/api/platform/businesses/${businessId}/agent-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentPersona: draft.agentPersona || null, agentFaq: draft.agentFaq || null }),
    });
    setSaving(null);
  }

  if (error) return <div style={{ padding: 24 }}>Error: {error}</div>;
  if (!businesses) return <div style={{ padding: 24 }}>Cargando...</div>;

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Panel de plataforma</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
            <th>Negocio</th>
            <th>Activo</th>
            <th>Salud del agente</th>
            <th>Pedidos (7d)</th>
            <th>Reservas (7d)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {businesses.map((b) => {
            const h = health[b.id];
            return (
              <Fragment key={b.id}>
                <tr style={{ borderBottom: '1px solid #ccc' }}>
                  <td>{b.name}</td>
                  <td>{b.active ? '✅' : '❌'}</td>
                  <td>{h?.loading ? '...' : h?.ready === undefined ? '❓ salud desconocida' : h.ready ? '🟢 listo' : '🔴 con problemas'}</td>
                  <td>{b.ordersLast7d}</td>
                  <td>{b.reservationsLast7d}</td>
                  <td>
                    <button onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                      {expanded === b.id ? 'Cerrar' : 'Editar tono/FAQ'}
                    </button>
                  </td>
                </tr>
                {expanded === b.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: 16, background: '#f5f5f5' }}>
                      {h?.checks && (
                        <ul>
                          {h.checks.map((c) => (
                            <li key={c.label} style={{ color: c.ok ? 'green' : c.required ? 'red' : 'orange' }}>
                              {c.ok ? '✅' : c.required ? '❌' : '⚠️'} {c.label}: {c.detail}
                            </li>
                          ))}
                        </ul>
                      )}
                      <label>Tono (agent_persona)</label>
                      <textarea
                        style={{ width: '100%', minHeight: 60 }}
                        value={drafts[b.id]?.agentPersona || ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], agentPersona: e.target.value } }))}
                      />
                      <label>FAQ (agent_faq)</label>
                      <textarea
                        style={{ width: '100%', minHeight: 100 }}
                        value={drafts[b.id]?.agentFaq || ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...prev[b.id], agentFaq: e.target.value } }))}
                      />
                      <button onClick={() => save(b.id)} disabled={saving === b.id}>
                        {saving === b.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd "C:\Users\andres.delgado\Desktop\Aplicaciones\NIXGOFOOD" && npx tsc --noEmit -p tsconfig.json`
Expected: exit code 0, no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/platform/ src/components/platform/
git commit -m "Add /platform dashboard UI: business list, health, tone/FAQ editing"
```

---

### Task 5: Setup, deploy, and end-to-end verification

No new file diffs beyond the manual setup SQL below — the controller executes this task directly (same precedent as every deploy/verification task in this project's prior plans).

- [ ] **Step 1: Create the platform-admin user**

The user creates a new Supabase Auth user with their own email: Supabase Dashboard → Authentication → Users → Add user. They report back the new user's UUID (shown in that same screen).

- [ ] **Step 2: Grant platform-admin**

With the UUID from Step 1 (call it `<NEW_USER_ID>`), run in the Supabase SQL Editor:

```sql
INSERT INTO public.profiles (id, business_id, role, name, active, is_platform_admin)
VALUES ('<NEW_USER_ID>', NULL, 'owner', 'Andrés (plataforma)', true, true);
```

Verify:

```sql
SELECT id, business_id, role, is_platform_admin FROM public.profiles WHERE id = '<NEW_USER_ID>';
```

Expected: one row, `business_id` null, `is_platform_admin` true.

- [ ] **Step 3: Push and deploy**

Ask the user to confirm pushing `origin/main` (triggers Vercel auto-deploy), same as every other push this session:

```bash
cd "C:\Users\andres.delgado\Desktop\Aplicaciones\NIXGOFOOD"
git push origin main
```

- [ ] **Step 4: Verify a non-platform-admin is blocked**

Using the browser tool, log in at `https://food.nixgodigital.com/admin/login` as `admin@eltacanijo.com` (or any existing per-business admin), then navigate to `https://food.nixgodigital.com/platform`. Expected: HTTP 404 (not a redirect to login) — confirms the guard hides the route from non-platform-admins.

- [ ] **Step 5: Verify the platform admin sees both businesses correctly**

Log in as the new platform-admin user (Step 1's email) and navigate to `https://food.nixgodigital.com/platform`. Expected:
- El Taca Nijo: 🟢 listo (has an active branch).
- Burger House ("La Esquina de Ales"): 🔴 con problemas, with "Sucursal activa" showing `ok: false` — this is real, pre-existing data, not a bug introduced by this plan.
- Both rows show their configured tone/FAQ text in the editable fields (El Taca Nijo has both set from earlier this session; Burger House has a tone set but no FAQ).

- [ ] **Step 6: Verify editing persists and reaches the agent**

Change Burger House's FAQ text field to something new (e.g. add a line about opening hours), save, then reload `/platform` — the new text should still be there. Then, using the browser tool, send a chat message to `burger-house.food.nixgodigital.com`'s `/api/agent-chat` asking about whatever was just added, and confirm the agent's reply reflects it (same live-verification depth used for `agent_persona`/`agent_faq` earlier this session).

- [ ] **Step 7: Final report**

Summarize to the user: platform-admin profile created, both businesses visible with correct health/stats, non-platform-admin access confirmed blocked (404), and an edit made through the new UI confirmed to reach the agent live.
