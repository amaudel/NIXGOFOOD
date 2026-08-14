/**
 * Centralized Demo Mode Helper
 * Returns true when NEXT_PUBLIC_DEMO_MODE === 'true' (or when Supabase credentials are empty)
 */
export const isDemoMode = (): boolean => {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEMO_MODE === 'false') {
    return false;
  }
  
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return true;
  }

  // If Supabase URL is placeholder/unconfigured, default to Demo Mode so app works out of the box
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === 'https://your-project.supabase.co' || supabaseUrl === 'https://placeholder.supabase.co') {
    return true;
  }

  return false;
};
