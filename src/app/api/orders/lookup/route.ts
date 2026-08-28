import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoOrderRepository } from '@/repositories/demo/DemoOrderRepository';
import { getClientIp, checkRateLimit } from '@/lib/security/rateLimiter';
import { getResolvedBusinessId } from '@/lib/tenant';

export async function POST(request: Request) {
  try {
    // 1. Rate Limiting: Max 5 attempts per minute per IP via Upstash Redis
    const clientIp = getClientIp(request);
    const rateCheck = await checkRateLimit(clientIp, 5, 60000, 'order_lookup');

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Has superado el límite de búsquedas. Reintenta en ${rateCheck.resetSeconds} segundos.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.resetSeconds),
          },
        }
      );
    }

    // 2. Parse & Validate Payload
    const body = await request.json();
    const rawOrderNumber = body?.orderNumber?.toString() || '';
    const rawPhone = body?.phone?.toString() || '';

    // Clean inputs
    const cleanOrderNumStr = rawOrderNumber.replace(/[^0-9]/g, '');
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '');

    if (!cleanOrderNumStr || !cleanPhone || cleanPhone.length < 7) {
      return NextResponse.json(
        { error: 'No encontramos un pedido con esos datos.' },
        { status: 404 }
      );
    }

    const orderNumber = parseInt(cleanOrderNumStr, 10);

    // 3. DEMO MODE Retrieval
    if (isDemoMode()) {
      const orders = await DemoOrderRepository.getOrders();
      const matched = orders.find((o) => {
        const oNum = parseInt(o.orderNumber.replace(/[^0-9]/g, ''), 10);
        const oPhone = o.customer.phone.replace(/[^0-9]/g, '');
        return oNum === orderNumber && oPhone.endsWith(cleanPhone.slice(-7));
      });

      if (!matched) {
        return NextResponse.json(
          { error: 'No encontramos un pedido con esos datos.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        trackingToken: matched.trackingToken || matched.id,
      });
    }

    // 4. REAL MODE Retrieval via Supabase
    // El middleware resuelve el business_id por el subdominio desde el que
    // se hizo esta llamada (Host); CURRENT_BUSINESS_ID solo queda como
    // fallback si por algun motivo el header no llego (nunca deberia pasar
    // desde un subdominio de tienda real, pero evita un 500 silencioso).
    const resolvedBusinessId = (await getResolvedBusinessId()) || CURRENT_BUSINESS_ID;

    const supabase = await createClient();
    const { data: matchedOrders, error } = await supabase
      .from('orders')
      .select('id, tracking_token, customer_phone, order_number')
      .eq('business_id', resolvedBusinessId)
      .eq('order_number', orderNumber);

    if (error || !matchedOrders || matchedOrders.length === 0) {
      return NextResponse.json(
        { error: 'No encontramos un pedido con esos datos.' },
        { status: 404 }
      );
    }

    // Compare normalized phone digits for privacy & precision
    const matched = matchedOrders.find((o: any) => {
      const dbPhone = (o.customer_phone || '').replace(/[^0-9]/g, '');
      return dbPhone.endsWith(cleanPhone.slice(-7)) || cleanPhone.endsWith(dbPhone.slice(-7));
    });

    if (!matched) {
      return NextResponse.json(
        { error: 'No encontramos un pedido con esos datos.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      trackingToken: matched.tracking_token || matched.id,
    });
  } catch (err: any) {
    console.error('Order lookup error:', err);
    return NextResponse.json(
      { error: 'No encontramos un pedido con esos datos.' },
      { status: 404 }
    );
  }
}
