import { BranchProvider } from '@/context/BranchContext';

export default function AdminRouteLayout({ children }: { children: React.ReactNode }) {
  return <BranchProvider scope="admin">{children}</BranchProvider>;
}
