import crypto from 'crypto';

const LOCAL_DEV_SECRET = 'nixgofood_server_internal_cleanup_secret_dev_mode_only_2026_x9k2m';

export interface CleanupTokenPayload {
  proofPath: string;
  businessId: string;
  expiresAt: number;
  signature: string;
}

/**
 * Retrieves the server secret enforcing FAIL-CLOSED behavior in Production.
 * In production: PAYMENT_PROOF_CLEANUP_SECRET MUST be set with at least 32 characters.
 * Otherwise, it throws a critical security error to fail safely.
 */
function getCleanupSecret(): string {
  const secret = process.env.PAYMENT_PROOF_CLEANUP_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!secret || secret.trim().length < 32) {
      console.error(
        'CRITICAL CONFIGURATION ERROR: PAYMENT_PROOF_CLEANUP_SECRET is missing or less than 32 characters in production.'
      );
      throw new Error(
        'FAIL-CLOSED: PAYMENT_PROOF_CLEANUP_SECRET must be configured with a secure 32+ character key in production environment.'
      );
    }
    return secret.trim();
  }

  // Development / Test mode fallback
  if (!secret) {
    console.warn(
      '[DEV NOTICE] PAYMENT_PROOF_CLEANUP_SECRET is not set. Using local development fallback secret.'
    );
    return LOCAL_DEV_SECRET;
  }

  return secret.trim();
}

/**
 * Generates an HMAC-SHA256 signed cleanupToken in server mode.
 * Binds: proofPath, businessId, expiresAt (TTL = 15 minutes by default).
 */
export function generateCleanupToken(
  proofPath: string,
  businessId: string,
  ttlMinutes: number = 15
): string {
  const secret = getCleanupSecret();
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  const payloadStr = `${proofPath}|${businessId}|${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadStr)
    .digest('hex');

  const tokenData: CleanupTokenPayload = {
    proofPath,
    businessId,
    expiresAt,
    signature,
  };

  return Buffer.from(JSON.stringify(tokenData)).toString('base64url');
}

/**
 * Verifies the HMAC-SHA256 signature and expiration of a cleanupToken.
 * Enforces Fail-Closed behavior if production configuration is invalid.
 */
export function verifyCleanupToken(token: string): {
  valid: boolean;
  proofPath?: string;
  businessId?: string;
  error?: string;
} {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token de limpieza no proporcionado.' };
  }

  try {
    const secret = getCleanupSecret();
    const jsonStr = Buffer.from(token, 'base64url').toString('utf-8');
    const tokenData: CleanupTokenPayload = JSON.parse(jsonStr);

    const { proofPath, businessId, expiresAt, signature } = tokenData;

    if (!proofPath || !businessId || !expiresAt || !signature) {
      return { valid: false, error: 'Estructura de token no válida.' };
    }

    // 1. Expiration check
    if (Date.now() > expiresAt) {
      return { valid: false, error: 'El token de limpieza ha expirado.' };
    }

    // 2. Recompute expected HMAC signature using server secret
    const payloadStr = `${proofPath}|${businessId}|${expiresAt}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');

    // 3. Constant-time signature comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return { valid: false, error: 'Firma HMAC de token no válida o manipulada.' };
    }

    return {
      valid: true,
      proofPath,
      businessId,
    };
  } catch (err: any) {
    if (err.message && err.message.startsWith('FAIL-CLOSED')) {
      return { valid: false, error: err.message };
    }
    return { valid: false, error: 'Token de limpieza corrupto o no válido.' };
  }
}
