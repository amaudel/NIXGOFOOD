import type { ReactNode } from 'react';
import { NewOrderAlertProvider } from '@/context/NewOrderAlertContext';

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <NewOrderAlertProvider>{children}</NewOrderAlertProvider>;
}
