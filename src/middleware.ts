import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
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
  matcher: ['/admin/:path*'],
};
