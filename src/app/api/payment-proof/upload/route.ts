import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { generateCleanupToken } from '@/lib/security/cleanupToken';
import { getClientIp, checkRateLimit } from '@/lib/security/rateLimiter';
import { getResolvedBusinessId } from '@/lib/tenant';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function validateMagicBytes(bytes: Uint8Array): { valid: boolean; ext?: string } {
  if (bytes.length < 12) return { valid: false };

  // JPEG: FF D8 FF
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return { valid: true, ext: 'jpg' };

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (isPng) return { valid: true, ext: 'png' };

  // WebP: RIFF (bytes 0-3: 52 49 46 46) and WEBP (bytes 8-11: 57 45 42 50)
  const isRiff =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;
  const isWebp =
    isRiff &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (isWebp) return { valid: true, ext: 'webp' };

  return { valid: false };
}

export async function POST(request: Request) {
  try {
    if (isDemoMode()) {
      return NextResponse.json(
        { error: 'Upload no disponible en MODO DEMO.' },
        { status: 400 }
      );
    }

    // 1. Rate Limiter Inspection (5 uploads / 1 minute per IP using un-spoofable x-vercel-forwarded-for)
    const clientIp = getClientIp(request);
    const rateCheck = await checkRateLimit(clientIp, 5, 60000);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Has superado el límite de intentos de subida. Por favor reintenta en ${rateCheck.resetSeconds} segundos.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.resetSeconds),
          },
        }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se adjuntó ningún archivo.' }, { status: 400 });
    }

    // 2. Validate File Size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `El archivo supera el tamaño máximo permitido de 5 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).` },
        { status: 400 }
      );
    }

    // 3. Read File Buffer & Validate Binary Magic Bytes
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const magicResult = validateMagicBytes(bytes);

    if (!magicResult.valid) {
      return NextResponse.json(
        { error: 'El archivo no es una imagen real válida JPG, PNG o WebP (cabecera binaria no válida).' },
        { status: 400 }
      );
    }

    // 4. Extension Validation
    const originalExt = file.name.split('.').pop()?.toLowerCase() || '';
    const safeExt = magicResult.ext || (ALLOWED_EXTENSIONS.includes(originalExt) ? originalExt : 'jpg');

    // 5. Server-Side Context & Path Sanitization
    // El middleware resuelve el business_id por el subdominio de origen;
    // CURRENT_BUSINESS_ID solo queda como fallback si el header no llego.
    const resolvedBusinessId = (await getResolvedBusinessId()) || CURRENT_BUSINESS_ID;
    const businessId = resolvedBusinessId.replace(/[^a-zA-Z0-9_-]/g, '');
    const tempUploadId = `ord_upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const proofPath = `${businessId}/${tempUploadId}/${uuid}.${safeExt}`;

    // 6. Upload File to Private Bucket via Server Supabase Client
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .upload(proofPath, Buffer.from(buffer), {
        contentType: file.type || `image/${safeExt}`,
        upsert: false,
      });

    if (error || !data?.path) {
      console.error('Server upload error:', error);
      return NextResponse.json(
        { error: `No pudimos guardar el comprobante en el servidor (${error?.message || 'Error de almacenamiento'}). Intenta nuevamente.` },
        { status: 500 }
      );
    }

    // 7. Generate Server-Signed HMAC cleanupToken (Enforces Fail-Closed in Production)
    let cleanupToken: string;
    try {
      cleanupToken = generateCleanupToken(data.path, businessId, 15);
    } catch (err: any) {
      console.error('FAIL-CLOSED ERROR generating cleanup token:', err.message);
      return NextResponse.json(
        { error: 'Error de configuración de seguridad en el servidor.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      proofPath: data.path,
      cleanupToken,
    });
  } catch (err: any) {
    console.error('Upload route exception:', err);
    return NextResponse.json(
      { error: err.message || 'Error al procesar la subida del comprobante.' },
      { status: 500 }
    );
  }
}
