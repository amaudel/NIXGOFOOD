import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/config/demo';
import { DemoOrderRepository } from '@/repositories/demo/DemoOrderRepository';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ trackingToken: string }> }
) {
  try {
    const resolvedParams = await params;
    const trackingToken = resolvedParams.trackingToken;

    if (!trackingToken) {
      return NextResponse.json({ error: 'Token de seguimiento no proporcionado.' }, { status: 400 });
    }

    if (isDemoMode()) {
      const demoOrder = await DemoOrderRepository.getOrderByTrackingToken(trackingToken);
      if (!demoOrder) {
        return NextResponse.json({ error: 'Pedido demo no encontrado.' }, { status: 404 });
      }
      return NextResponse.json({
        id: demoOrder.id,
        orderNumber: demoOrder.orderNumber,
        trackingToken: demoOrder.trackingToken,
        status: demoOrder.status,
        deliveryMethod: demoOrder.deliveryMethod,
        subtotal: demoOrder.subtotal,
        deliveryFee: demoOrder.deliveryFee,
        total: demoOrder.total,
        customerName: demoOrder.customer.name,
        customerPhone: demoOrder.customer.phone,
        deliveryAddress: demoOrder.deliveryLocation?.address,
        deliveryReference: demoOrder.deliveryLocation?.reference,
        estimatedMinutes: demoOrder.estimatedTime,
        createdAt: demoOrder.createdAt,
        items: demoOrder.items.map((it: any) => ({
          id: it.id,
          productName: it.productName,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          totalPrice: it.totalPrice,
          notes: it.notes,
          selectedModifiers: (it.selectedModifiers || []).map((m: any) => ({
            modifierName: m.modifierName,
            price: m.price,
          })),
        })),
      });
    }

    const supabase = await createClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        tracking_token,
        status,
        delivery_method,
        subtotal,
        delivery_fee,
        total,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_reference,
        estimated_minutes,
        created_at,
        order_items (
          id,
          product_name_snapshot,
          unit_price,
          quantity,
          line_total,
          notes,
          order_item_modifiers (
            modifier_name_snapshot,
            price_delta
          )
        )
      `)
      .eq('tracking_token', trackingToken)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    }

    return NextResponse.json({
      id: order.id,
      orderNumber: `#${order.order_number}`,
      trackingToken: order.tracking_token,
      status: order.status,
      deliveryMethod: order.delivery_method,
      subtotal: parseFloat(order.subtotal),
      deliveryFee: parseFloat(order.delivery_fee),
      total: parseFloat(order.total),
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      deliveryAddress: order.delivery_address,
      deliveryReference: order.delivery_reference,
      estimatedMinutes: order.estimated_minutes,
      createdAt: order.created_at,
      items: (order.order_items || []).map((it: any) => ({
        id: it.id,
        productName: it.product_name_snapshot,
        unitPrice: parseFloat(it.unit_price),
        quantity: it.quantity,
        totalPrice: parseFloat(it.line_total),
        notes: it.notes,
        selectedModifiers: (it.order_item_modifiers || []).map((m: any) => ({
          modifierName: m.modifier_name_snapshot,
          price: parseFloat(m.price_delta),
        })),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error interno.' }, { status: 500 });
  }
}
