import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyPlatformAdminSession } from '@/lib/auth/adminAuth';

export async function GET() {
  const auth = await verifyPlatformAdminSession();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_list_businesses');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ businesses: data || [] });
}
