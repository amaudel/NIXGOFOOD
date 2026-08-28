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
