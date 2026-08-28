import { headers } from 'next/headers';

export type TenantRoute =
  | { kind: 'root' }
  | { kind: 'admin' }
  | { kind: 'store'; slug: string }
  | { kind: 'unknown' };

function stripPort(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, '');
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
