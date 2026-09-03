import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { NewOrderAlertProvider } from '@/context/NewOrderAlertContext';
import { BranchProvider } from '@/context/BranchContext';
import { AppProvider } from '@/context/AppContext';
import { getResolvedBusinessId } from '@/lib/tenant';

/**
 * El manifiesto se declara solo aca, y no como app/manifest.ts, para que
 * el enlace aparezca unicamente en el panel: la tienda del cliente vive
 * en otro subdominio y no debe ofrecerse para instalar con un start_url
 * que apunta a /admin.
 *
 * Instalarlo importa mas alla de la comodidad: Chrome bloquea el audio
 * hasta que el usuario interactua con la pagina, asi que al recargar el
 * panel las alertas de comanda quedaban mudas hasta el primer clic. A una
 * aplicacion instalada le concede ese permiso, y el sonido funciona desde
 * que se abre.
 */
export const metadata: Metadata = {
  manifest: '/panel.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Panel',
    statusBarStyle: 'black-translucent',
  },
};

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
