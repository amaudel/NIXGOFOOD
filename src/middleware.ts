import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { classifyHost } from '@/lib/tenant';
import { isDemoMode } from '@/config/demo';
import { CURRENT_BUSINESS_ID } from '@/config/business';

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
//
// El allowlist fijo (SITE_URL + localhost) ya no alcanza una vez que el
// storefront vive en subdominios por negocio: una peticion de escritura
// desde tacos.tuapp.com traía Origin: https://tacos.tuapp.com, que nunca
// estuvo en la lista fija y quedaba bloqueada -- rompiendo cada checkout
// real. Ahora, si el origen no esta en el allowlist fijo, se acepta igual
// cuando su host clasifica como propio (root/admin/store) via classifyHost.
function isBlockedCrossOriginApiWrite(request: NextRequest, rootDomain: string): boolean {
  if (!request.nextUrl.pathname.startsWith('/api/')) return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;

  const origin = request.headers.get('origin');
  if (!origin) return false; // server-to-server / cron / apps nativas: sin Origin, no es un navegador cross-site

  const trimmedOrigin = origin.replace(/\/$/, '');
  if (getAllowedOrigins().includes(trimmedOrigin)) return false;

  try {
    const originHost = new URL(origin).host;
    return classifyHost(originHost, rootDomain).kind === 'unknown';
  } catch {
    return true; // Origin header malformado -> bloquear
  }
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
  // Ningun codigo debe confiar en un x-business-id mandado por el cliente:
  // se elimina aca, al principio, antes de que cualquier branch lo lea o lo
  // reenvie. IMPORTANTE: este delete() por si solo NO alcanza -- Next.js solo
  // aplica el override de headers cuando la respuesta se construye con
  // { request: { headers } } explicito. TODO return de esta funcion debe
  // pasar ese objeto (aunque sea request.headers sin modificar), o el header
  // "borrado" aca sigue llegando intacto al servidor de origen.
  request.headers.delete('x-business-id');

  const rootDomain = process.env.ROOT_DOMAIN || 'localhost:3000';

  if (process.env.NODE_ENV === 'production' && !process.env.ROOT_DOMAIN) {
    // No se bloquea el request (evitar un 500 total por un typo de config),
    // pero sin esto el ruteo multi-tenant completo (incluido /admin) queda
    // inoperante de forma silenciosa -- se deja bien visible en logs.
    console.error(
      'CRITICAL: ROOT_DOMAIN no esta configurado en produccion. El ruteo por subdominio (admin.*, {slug}.*) no va a funcionar.'
    );
  }

  if (isBlockedCrossOriginApiWrite(request, rootDomain)) {
    return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403 });
  }

  const { pathname } = request.nextUrl;

  // Assets estaticos (imagenes en /public, etc.) nunca necesitan resolucion
  // de tenant ni sesion. Sin este corte temprano, cada <img src="/demo/...">
  // del storefront pasaba por el lookup de negocio en Supabase y despues
  // 404eaba contra /store/demo/... (que no existe), rompiendo cada imagen
  // del sitio y desperdiciando una llamada de red por asset en cada visita.
  //
  // Excluye explicitamente /store y /admin de este atajo: son rutas dinamicas
  // (ej. /store/order/[id]) que pueden matchear el regex de extension con
  // cualquier string que el cliente elija (".../order/x.png"), lo que
  // esquivaba por completo los candados de mas abajo. Ademas, un
  // NextResponse.next() sin { request: { headers } } NO propaga el
  // request.headers.delete('x-business-id') de arriba -- Next solo aplica el
  // override de headers cuando ese objeto viene explicito -- asi que sin
  // reenviarlo aca un x-business-id inventado por el cliente sobrevivia
  // intacto hasta /store/layout.tsx.
  if (
    /\.[a-zA-Z0-9]+$/.test(pathname) &&
    !pathname.startsWith('/store') &&
    !pathname.startsWith('/admin')
  ) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const isDemo = isDemoMode();
  const host = request.headers.get('host') || rootDomain;
  const route = classifyHost(host, rootDomain);

  // Rutas /api/* y /negocio-no-encontrado nunca se reescriben por tenant: la
  // resolucion de negocio para llamadas de API vive en cada route handler
  // (via getResolvedBusinessId en las paginas que las invocan), no en el
  // gateway.
  const skipTenantRewrite = pathname.startsWith('/api/') || pathname.startsWith('/negocio-no-encontrado');

  if (!skipTenantRewrite) {
    if (route.kind === 'admin') {
      if (!pathname.startsWith('/admin')) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin' + pathname;
        return NextResponse.redirect(url);
      }
      // ya empieza con /admin, sigue hacia el bloque de auth mas abajo
    } else if (pathname.startsWith('/admin')) {
      // /admin solo es accesible desde admin.{rootDomain} -- en cualquier
      // otro host (raiz, tienda, desconocido) no existe.
      return new NextResponse('Not Found', { status: 404 });
    } else if (pathname.startsWith('/store')) {
      // /store solo se alcanza via el rewrite interno del branch de abajo;
      // el cliente nunca deberia pedirlo directamente en ningun host. Sin
      // este corte, combinado con un x-business-id manipulado a mano,
      // cualquiera podia renderizar el storefront de OTRO negocio en el
      // dominio raiz.
      return new NextResponse('Not Found', { status: 404 });
    } else if (route.kind === 'store') {
      const businessId = isDemo ? 'demo' : await findActiveBusinessIdBySlug(route.slug);
      if (!businessId) {
        const url = request.nextUrl.clone();
        url.pathname = '/negocio-no-encontrado';
        return NextResponse.rewrite(url, { request: { headers: request.headers } });
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
      return NextResponse.next({ request: { headers: request.headers } });
    }
    // route.kind === 'root': deja pasar, sirve la landing en '/'
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // In Demo Mode or unconfigured Supabase, pass through cleanly without auth redirect.
  if (isDemo || !supabaseUrl || supabaseUrl === 'https://your-project.supabase.co' || supabaseUrl === 'https://placeholder.supabase.co') {
    // /admin en demo mode no tiene sesion real de Supabase, pero
    // AdminRouteLayout igual necesita un x-business-id para montar
    // BranchProvider/AppProvider -- sin esto, cada pagina admin en demo
    // mode truena con "useBranch debe usarse dentro de un BranchProvider".
    if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-business-id', CURRENT_BUSINESS_ID);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
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
