import { createBrowserClient } from '@supabase/ssr';

// Sin un dominio explicito, el navegador guarda la cookie de sesion como
// "host-only": solo se envia de vuelta al host EXACTO que la puso (ej.
// admin.food.nixgodigital.com). Eso rompe /platform, que redirige de
// admin.{rootDomain} al dominio raiz esperando ver esa misma sesion. Con
// ".food.nixgodigital.com" la cookie queda compartida entre admin.* y la
// raiz. En localhost se omite (undefined): Domain=localhost tiene
// comportamiento inconsistente entre navegadores y no hace falta, ya que
// dev local no suele ejercitar subdominios reales.
function sharedCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = window.location.hostname; // hostname no incluye el puerto
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return undefined;
  const rootHost = host.replace(/^admin\./, '');
  return `.${rootHost}`;
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: { domain: sharedCookieDomain() },
  });
}
