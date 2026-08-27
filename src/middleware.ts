import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Origenes propios de la app. NEXT_PUBLIC_SITE_URL debe apuntar al dominio de
// produccion (ej. https://nixgofood.vercel.app); localhost queda permitido
// solo para desarrollo.
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

export async function middleware(request: NextRequest) {
  if (isBlockedCrossOriginApiWrite(request)) {
    return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403 });
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
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

  const { pathname } = request.nextUrl;

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

    if (profile) {
      if (profile.active === false || !ALLOWED_ADMIN_ROLES.includes(profile.role)) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin/login';
        url.searchParams.set('error', 'unauthorized_role');
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
