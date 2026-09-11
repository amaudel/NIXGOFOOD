import { createBrowserClient } from '@supabase/ssr';

// Sin un dominio explicito, el navegador guarda la cookie de sesion como
// "host-only": solo se envia de vuelta al host EXACTO que la puso (ej.
// admin.food.nixgodigital.com). Eso rompe /platform, que redirige de
// admin.{rootDomain} al dominio raiz esperando ver esa misma sesion. Con
// ".food.nixgodigital.com" la cookie queda compartida entre admin.*, la
// raiz y cualquier storefront {slug}.*. En localhost se omite (undefined):
// Domain=localhost tiene comportamiento inconsistente entre navegadores y
// no hace falta, ya que dev local no suele ejercitar subdominios reales.
//
// IMPORTANTE: se lee NEXT_PUBLIC_ROOT_DOMAIN (mismo valor que el ROOT_DOMAIN
// server-only que usan middleware.ts/server.ts, solo que expuesto al bundle
// del cliente) en vez de derivarlo de window.location.hostname. Antes, un
// `host.replace(/^admin\./, '')` producia un dominio MAS ANGOSTO que el del
// servidor en cualquier storefront de negocio (ej.
// el-taca-nijo.food.nixgodigital.com -> .el-taca-nijo.food.nixgodigital.com
// en vez de .food.nixgodigital.com), generando cookies del mismo nombre en
// dos scopes distintos -- con el token viejo/mal-scopeado ganando por el
// orden de RFC 6265 y el parseo "first wins" de cookie@1.1.1, causando
// refresh-token-reuse y logouts espurios para admins que visitan su propio
// storefront. Leer la misma fuente de verdad que el servidor evita el
// desajuste sin importar en que subdominio corra el browser client.
function sharedCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined; // no-op defensivo: este modulo solo se usa client-side
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  const bareHost = rootDomain.split(':')[0]; // quita el puerto, ej. 'localhost:3000' -> 'localhost'
  if (bareHost === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(bareHost)) return undefined;
  return `.${bareHost}`;
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: { domain: sharedCookieDomain() },
  });
}
