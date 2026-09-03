import { NextResponse } from 'next/server';
import { getClientIp, checkRateLimit } from '@/lib/security/rateLimiter';
import { getResolvedBusinessId } from '@/lib/tenant';
import { obtenerDemoraDeSucursal } from '@/lib/server/cargaCocina';

/**
 * Demora vigente de una sucursal, para el menu y el checkout.
 *
 * Devuelve SOLO minutos: la carga de la cocina (cuantos pedidos tiene
 * encima el negocio) no sale de aca, y los datos de pedidos tampoco. El
 * conteo ocurre del lado del servidor porque `orders` esta protegida y
 * `anon` no puede leerla.
 *
 * El negocio se toma del dominio, no del cliente, asi que nadie puede
 * consultar la carga de otro tenant pasando un branchId ajeno.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const clientIp = getClientIp(request);
    // El menu consulta esto al cargar; 60 por minuto deja navegar con
    // comodidad y corta el abuso.
    const rateCheck = await checkRateLimit(clientIp, 60, 60000, 'prep_time');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas consultas.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.resetSeconds) } }
      );
    }

    const businessId = await getResolvedBusinessId();
    const branchId = new URL(request.url).searchParams.get('branchId');

    if (!branchId || !UUID.test(branchId)) {
      return NextResponse.json({ error: 'Sucursal inválida.' }, { status: 400 });
    }

    const demora = await obtenerDemoraDeSucursal(businessId, branchId);

    return NextResponse.json({
      minutosExtra: demora.minutosExtra,
      rangoRetiro: demora.rangoRetiro,
    });
  } catch (error) {
    // Nunca romper la compra por esto: sin demora calculada, el cliente
    // ve el tiempo base.
    console.error('prep-time: fallo al calcular la demora', error);
    return NextResponse.json({ minutosExtra: 0, rangoRetiro: null });
  }
}
