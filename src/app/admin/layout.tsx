import type { ReactNode } from 'react';
import { NewOrderAlertProvider } from '@/context/NewOrderAlertContext';
import { BranchProvider } from '@/context/BranchContext';

export default function AdminRouteLayout({ children }: { children: ReactNode }) {
  return (
    <BranchProvider scope="admin">
      <NewOrderAlertProvider>{children}</NewOrderAlertProvider>
    </BranchProvider>
  );
}
