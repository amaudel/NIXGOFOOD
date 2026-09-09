/**
 * Centralized Demo Mode Helper -- THE single source of truth for "are we in
 * Demo Mode". Every other file (adminAuth.ts, middleware.ts, UI components,
 * API routes) must call this instead of re-reading NEXT_PUBLIC_DEMO_MODE /
 * NEXT_PUBLIC_SUPABASE_URL directly -- a second, independently-written check
 * can silently drift from this one (e.g. missing the explicit-false override).
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_DEMO_MODE=false|0 -> false (explicit opt-out, always wins)
 *   2. NEXT_PUBLIC_DEMO_MODE=true|1  -> true  (explicit opt-in, always wins)
 *   3. Otherwise (unset OR malformed, treated the same): falls back to
 *      detecting an unconfigured/placeholder Supabase URL -- EXCEPT in
 *      production (NODE_ENV==='production'), where an ambiguous config must
 *      NEVER silently become Demo Mode. Demo Mode bypasses admin auth
 *      entirely (see verifyAdminSession() in lib/auth/adminAuth.ts) and
 *      collapses tenant resolution to a single hardcoded business (see
 *      middleware.ts) -- so in production this fallback fails CLOSED
 *      (returns false) instead of open. A deliberate demo deployment to
 *      production infra (e.g. "Vercel demo without Supabase", per
 *      .env.example) still works via the explicit opt-in in step 2.
 */
export const isDemoMode = (): boolean => {
  const envVal = process.env.NEXT_PUBLIC_DEMO_MODE?.toLowerCase()?.trim();

  if (envVal === 'false' || envVal === '0') {
    return false;
  }

  if (envVal === 'true' || envVal === '1') {
    return true;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseLooksUnconfigured =
    !supabaseUrl ||
    supabaseUrl === 'https://your-project.supabase.co' ||
    supabaseUrl === 'https://placeholder.supabase.co';

  if (!supabaseLooksUnconfigured) {
    return false;
  }

  if (process.env.NODE_ENV === 'production') {
    // Fail closed: missing/placeholder Supabase config in production must
    // not silently grant Demo Mode. Log loudly so the misconfiguration is
    // visible in server logs instead of invisible.
    console.error(
      'CRITICAL: NEXT_PUBLIC_SUPABASE_URL no esta configurado (o es un placeholder) en produccion, ' +
        'y NEXT_PUBLIC_DEMO_MODE no fue seteado explicitamente. Por seguridad NO se activa Demo Mode ' +
        'automaticamente -- la app va a fallar contra Supabase en vez de exponer el panel admin sin auth. ' +
        'Si este es un deploy demo intencional, setea NEXT_PUBLIC_DEMO_MODE=true explicitamente.'
    );
    return false;
  }

  // Fuera de produccion (dev/test): mantiene el comportamiento original
  // "funciona out-of-the-box" sin configurar nada.
  return true;
};
