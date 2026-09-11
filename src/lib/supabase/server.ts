import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Sin un dominio explicito, el navegador guarda la cookie de sesion como
// "host-only": solo se envia de vuelta al host EXACTO que la puso (ej.
// admin.food.nixgodigital.com). Eso rompe /platform, que redirige de
// admin.{rootDomain} al dominio raiz esperando ver esa misma sesion. Con
// ".food.nixgodigital.com" la cookie queda compartida entre admin.* y la
// raiz. En localhost se omite (undefined): Domain=localhost tiene
// comportamiento inconsistente entre navegadores y no hace falta, ya que
// dev local no suele ejercitar subdominios reales.
function sharedCookieDomain(rootDomain: string): string | undefined {
  const bareHost = rootDomain.split(':')[0]; // quita el puerto, ej. 'localhost:3000' -> 'localhost'
  if (bareHost === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(bareHost)) return undefined;
  return `.${bareHost}`;
}

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder-anon-key';
  const rootDomain = process.env.ROOT_DOMAIN || 'localhost:3000';

  return createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: { domain: sharedCookieDomain(rootDomain) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}
