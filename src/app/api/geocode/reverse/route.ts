import { NextResponse } from 'next/server';
import { getClientIp, checkRateLimit } from '@/lib/security/rateLimiter';
import { formatReverseGeocodedAddress } from '@/lib/geocoding';

// Proxy server-a-servidor hacia Nominatim, por tres motivos:
// 1. La CSP del sitio solo permite connect-src 'self' -- llamar a Nominatim
//    desde el navegador obligaria a abrirla a un tercero.
// 2. Nominatim exige un User-Agent identificable; el navegador no deja
//    ponerlo.
// 3. Las coordenadas del cliente no salen desde su equipo hacia un tercero.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const CONTACTO = process.env.GEOCODING_CONTACT_EMAIL || 'soporte@nixgofood.app';

// Number(null) y Number('') dan 0, asi que una peticion sin coordenadas
// pasaria como (0, 0) valido. Se exige el parametro presente y no vacio.
function leerCoordenada(crudo: string | null, max: number): number | null {
  if (crudo === null || crudo.trim() === '') return null;
  const valor = Number(crudo);
  if (!Number.isFinite(valor) || Math.abs(valor) > max) return null;
  return valor;
}

export async function GET(request: Request) {
  try {
    const clientIp = getClientIp(request);
    // Nominatim pide como maximo 1 peticion por segundo. Un cliente marcando
    // su casa mueve el pin unas pocas veces; 20 por minuto sobra y protege
    // la cuota compartida del servicio publico.
    const rateCheck = await checkRateLimit(clientIp, 20, 60000, 'geocode_reverse');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas consultas de ubicación.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.resetSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const lat = leerCoordenada(searchParams.get('lat'), 90);
    const lng = leerCoordenada(searchParams.get('lng'), 180);

    // (0, 0) es el valor inicial de DeliveryLocation, no una direccion: cae
    // en el Golfo de Guinea. Gastar una consulta en el es siempre un error
    // de quien llama.
    if (lat === null || lng === null || (lat === 0 && lng === 0)) {
      return NextResponse.json({ error: 'Coordenadas inválidas.' }, { status: 400 });
    }

    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '18'); // nivel de edificio/calle
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'es');

    const res = await fetch(url, {
      headers: {
        'User-Agent': `NixgoFood/1.0 (${CONTACTO})`,
        Accept: 'application/json',
      },
      // La direccion de una coordenada no cambia; cachearla ahorra cuota.
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ address: null }, { status: 200 });
    }

    const address = formatReverseGeocodedAddress(await res.json());
    return NextResponse.json({ address }, { status: 200 });
  } catch (err) {
    // Fallar sin direccion es aceptable: el cliente la escribe a mano y la
    // validacion del checkout no lo deja avanzar en blanco. Nunca devolver
    // coordenadas crudas haciendose pasar por una direccion.
    console.error('reverse geocode error:', err);
    return NextResponse.json({ address: null }, { status: 200 });
  }
}
