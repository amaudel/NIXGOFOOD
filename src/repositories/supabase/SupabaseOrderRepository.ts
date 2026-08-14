import { Order, OrderStatus } from '@/types';
import { IOrderRepository } from '../interfaces/IOrderRepository';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { initialOrders } from '@/data/mockData';
import { createClient } from '@/lib/supabase/client';

export class SupabaseOrderRepository implements IOrderRepository {
  async getOrders(businessId: string = CURRENT_BUSINESS_ID): Promise<Order[]> {
    try {
      const supabase = createClient();
      const { data: rawOrders, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            order_item_modifiers (*)
          )
        `)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (error) {
        if (process.env.NODE_ENV === 'production') throw new Error(`Error Supabase: ${error.message}`);
        return initialOrders;
      }

      return (rawOrders || []).map((o: any) => ({
        id: o.id,
        orderNumber: `#${o.order_number}`,
        trackingToken: o.tracking_token,
        businessId: o.business_id,
        branchId: o.branch_id,
        customer: {
          id: o.customer_id,
          name: o.customer_name,
          phone: o.customer_phone,
        },
        deliveryMethod: o.delivery_method,
        deliveryLocation: o.delivery_address
          ? {
              latitude: parseFloat(o.delivery_latitude || 0),
              longitude: parseFloat(o.delivery_longitude || 0),
              address: o.delivery_address,
              reference: o.delivery_reference,
              locationType: o.delivery_location_type,
              zoneId: o.delivery_zone_id,
              deliveryFee: parseFloat(o.delivery_fee || 0),
              estimatedMinutes: o.estimated_minutes,
            }
          : undefined,
        items: (o.order_items || []).map((it: any) => ({
          id: it.id,
          productId: it.product_id,
          productName: it.product_name_snapshot,
          unitPrice: parseFloat(it.unit_price),
          quantity: it.quantity,
          notes: it.notes,
          totalPrice: parseFloat(it.line_total),
          selectedModifiers: (it.order_item_modifiers || []).map((m: any) => ({
            groupId: '',
            groupName: '',
            modifierId: m.modifier_id || '',
            modifierName: m.modifier_name_snapshot,
            price: parseFloat(m.price_delta),
          })),
        })),
        subtotal: parseFloat(o.subtotal),
        deliveryFee: parseFloat(o.delivery_fee),
        total: parseFloat(o.total),
        status: o.status as OrderStatus,
        createdAt: o.created_at,
        estimatedTime: o.estimated_minutes || '25-35 min',
        notes: o.notes,
      }));
    } catch (err: any) {
      if (process.env.NODE_ENV === 'production') throw err;
      return initialOrders;
    }
  }

  async createOrderTransactional(payload: any): Promise<any> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('create_order', {
      p_payload: payload,
    });

    if (error) {
      throw new Error(error.message || 'Error al procesar el pedido.');
    }

    return data;
  }

  async updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) throw new Error(`Error Supabase: ${error.message}`);
  }
}
