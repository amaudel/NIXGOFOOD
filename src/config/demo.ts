/**
 * Centralized Demo Mode Helper
 * Returns true when NEXT_PUBLIC_DEMO_MODE is 'true' or 'TRUE' (or when Supabase credentials are empty)
 */
export const isDemoMode = (): boolean => {
  const envVal = process.env.NEXT_PUBLIC_DEMO_MODE?.toLowerCase()?.trim();

  if (envVal === 'false' || envVal === '0') {
    return false;
  }
  
  if (envVal === 'true' || envVal === '1') {
    return true;
  }

  // If Supabase URL is placeholder/unconfigured, default to Demo Mode so app works out of the box
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === 'https://your-project.supabase.co' || supabaseUrl === 'https://placeholder.supabase.co') {
    return true;
  }

  return false;
};
