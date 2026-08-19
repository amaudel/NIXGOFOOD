import { redirect } from 'next/navigation';
import { isDemoMode } from '@/config/demo';
import { createClient } from '@/lib/supabase/server';
import DispatchClientPage from '@/components/admin/DispatchClientPage';

export const dynamic = 'force-dynamic';

export default async function DispatchPage() {
  if (!isDemoMode()) {
    try {
      const supabase = await createClient();
      const { data: { user }, error: userErr } = await supabase.auth.getUser();

      if (userErr || !user) {
        redirect('/admin/login');
      }

      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('role, active, business_id')
        .eq('id', user.id)
        .single();

      if (profErr || !profile || !profile.active) {
        redirect('/admin/login');
      }

      if (!['owner', 'admin', 'operator'].includes(profile.role)) {
        redirect('/admin/login');
      }
    } catch (e: any) {
      // Catch NEXT_REDIRECT signal thrown by Next.js redirect() and re-throw
      if (e?.digest?.startsWith('NEXT_REDIRECT')) {
        throw e;
      }
      redirect('/admin/login');
    }
  }

  return <DispatchClientPage />;
}
