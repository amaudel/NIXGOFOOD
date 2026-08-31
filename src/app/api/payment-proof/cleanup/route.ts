import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { verifyCleanupToken } from '@/lib/security/cleanupToken';
import { getResolvedBusinessId } from '@/lib/tenant';

export async function POST(request: Request) {
  try {
    if (isDemoMode()) {
      return NextResponse.json({ success: true });
    }

    const body = await request.json();
    const { cleanupToken } = body || {};

    if (!cleanupToken || typeof cleanupToken !== 'string') {
      return NextResponse.json(
        { error: 'cleanupToken no proporcionado o no válido.' },
        { status: 400 }
      );
    }

    // 1. Verify HMAC-SHA256 signature and token expiration (Enforces Fail-Closed in production)
    const verification = verifyCleanupToken(cleanupToken);
    if (!verification.valid || !verification.proofPath) {
      if (verification.error && verification.error.startsWith('FAIL-CLOSED')) {
        console.error('FAIL-CLOSED ERROR during cleanup verification:', verification.error);
        return NextResponse.json(
          { error: 'Error de configuración de seguridad en el servidor.' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: verification.error || 'Token de limpieza no autorizado o corrupto.' },
        { status: 403 }
      );
    }

    const { proofPath, businessId } = verification;

    // 2. Path Sanitization: Prevent path traversal attacks
    if (proofPath.includes('..') || proofPath.startsWith('/') || proofPath.includes('\\')) {
      return NextResponse.json({ error: 'Path no válido.' }, { status: 400 });
    }

    // 3. Verify proofPath belongs strictly to the resolved tenant (el mismo
    // que uso el upload al firmar el cleanupToken -- CURRENT_BUSINESS_ID solo
    // como fallback si el header no llego).
    const resolvedBusinessId = (await getResolvedBusinessId()) || CURRENT_BUSINESS_ID;
    const expectedPrefix = `${resolvedBusinessId}/`;
    if (!proofPath.startsWith(expectedPrefix) || businessId !== resolvedBusinessId) {
      return NextResponse.json({ error: 'Acceso no autorizado al path.' }, { status: 403 });
    }

    // 4. Remove file from storage
    const supabase = await createClient();
    const { error } = await supabase.storage.from('payment-proofs').remove([proofPath]);

    if (error) {
      console.warn('Cleanup error removing orphaned proof:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Cleanup route exception:', err);
    return NextResponse.json({ error: err.message || 'Error en cleanup.' }, { status: 500 });
  }
}
