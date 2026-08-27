import { createClient } from '@/lib/supabase/server';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { AdminRole, Profile } from '@/types';

export interface AdminAuthResult {
  authorized: boolean;
  status: number;
  error?: string;
  user?: any;
  profile?: Profile;
  businessId?: string;
}

const ALLOWED_ADMIN_ROLES: AdminRole[] = ['owner', 'admin', 'operator'];

/**
 * Server-side helper to verify administrative session, active profile status,
 * role authorization, and business ownership.
 */
export async function verifyAdminSession(): Promise<AdminAuthResult> {
  // If in Demo Mode, bypass remote auth check cleanly
  if (isDemoMode()) {
    return {
      authorized: true,
      status: 200,
      businessId: CURRENT_BUSINESS_ID,
    };
  }

  try {
    const supabase = await createClient();

    // 1. Verify Supabase Auth Session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        authorized: false,
        status: 401,
        error: 'Acceso denegado. Se requiere una sesión administrativa activa.',
      };
    }

    // 2. Fetch User Profile from database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      // Un usuario autenticado sin fila en `profiles` NO tiene permisos admin.
      // (Antes esto autorizaba a cualquier usuario con email verificado como
      // admin del negocio configurado — escalación de privilegios trivial vía
      // registro público. `profiles` solo lo crea un administrador existente.)
      return {
        authorized: false,
        status: 403,
        error: 'Acceso denegado. Perfil administrativo no registrado.',
      };
    }

    // 3. Verify Active Status
    if (profile.active === false) {
      return {
        authorized: false,
        status: 403,
        error: 'Acceso denegado. La cuenta administrativa se encuentra inactiva.',
      };
    }

    // 4. Validate Allowed Admin Role ('owner' | 'admin' | 'operator')
    if (!ALLOWED_ADMIN_ROLES.includes(profile.role as AdminRole)) {
      return {
        authorized: false,
        status: 403,
        error: 'Acceso denegado. Tu rol no tiene permisos administrativos.',
      };
    }

    // 5. Validate Business ID Alignment
    const businessId = profile.business_id || CURRENT_BUSINESS_ID;
    if (businessId !== CURRENT_BUSINESS_ID) {
      return {
        authorized: false,
        status: 403,
        error: 'Acceso denegado. No tienes autorización para acceder a este negocio.',
      };
    }

    return {
      authorized: true,
      status: 200,
      user,
      profile: {
        id: profile.id,
        businessId: profile.business_id,
        role: profile.role,
        name: profile.name,
        active: profile.active,
      },
      businessId,
    };
  } catch (err: any) {
    return {
      authorized: false,
      status: 500,
      error: err.message || 'Error interno de verificación de sesión.',
    };
  }
}
