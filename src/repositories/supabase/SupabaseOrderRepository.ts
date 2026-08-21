import { Order, OrderStatus } from '@/types';
import { IOrderRepository, ExecuteActionParams, RollbackParams } from '../interfaces/IOrderRepository';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { initialOrders } from '@/data/mockData';
import { createClient } from '@/lib/supabase/client';

export class SupabaseOrderRepository implements IOrderRepository {
  async getOrders(businessId: string = CURRENT_BUSINESS_ID, branchId?: string): Promise<Order[]> {
    try {
      const supabase = createClient();
      let query = supabase
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
      if (branchId) query = query.eq('branch_id', branchId);
      const { data: rawOrders, error } = await query;

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
        paymentMethod: o.payment_method || 'cash',
        cashChange: o.cash_change || undefined,
        transferDetails: o.transfer_details || undefined,
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

  async executeOrderAction(params: ExecuteActionParams): Promise<void> {
    const supabase = createClient();

    // Call exclusively the Server-Side Single Authority RPC transition_order_status
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('transition_order_status', {
      p_order_id: params.orderId,
      p_action: params.action,
      p_reason: params.reason || null,
    });

    if (rpcErr) {
      if (rpcErr.message?.includes('CHECKLIST_INCOMPLETE')) {
        throw new Error('El empaque y la verificación del pedido deben estar completos en Despacho.');
      }
      if (rpcErr.message?.includes('PAYMENT_NOT_VERIFIED')) {
        throw new Error('No se puede despachar un pedido con pago por transferencia sin verificar.');
      }
      if (rpcErr.message?.includes('PERMISSION_DENIED')) {
        throw new Error('No tienes permisos suficientes para realizar esta acción.');
      }
      if (rpcErr.message?.includes('REASON_REQUIRED')) {
        throw new Error('Debes proporcionar un motivo obligatorio para cancelar el pedido.');
      }
      if (rpcErr.message?.includes('INVALID_DELIVERY_METHOD')) {
        throw new Error('Esta acción no corresponde a la modalidad del pedido (Delivery / Pickup).');
      }
      if (rpcErr.message?.includes('INVALID_TRANSITION')) {
        throw new Error('Esta transición de estado no está permitida desde el estado actual.');
      }
      throw new Error(rpcErr.message || 'Error al procesar la transición del pedido.');
    }

    if (rpcRes && rpcRes.success === false) {
      throw new Error(
        `CONCURRENCY_ERROR: ${rpcRes.message || 'El pedido cambió de estado desde otro dispositivo.'} (Estado actual: ${rpcRes.current_status || 'actualizado'})`
      );
    }
  }

  async updateOrderStatus(orderId: string, newStatus: OrderStatus, reason?: string): Promise<void> {
    throw new Error(
      'DIRECT_STATUS_UPDATE_DENIED: Las modificaciones libres de estado están deshabilitadas. Utiliza executeOrderAction con una acción explícita.'
    );
  }

  async rollbackOrderStatus(params: RollbackParams): Promise<void> {
    const supabase = createClient();

    // Call exclusively the atomic PostgreSQL RPC rollback_order_status
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('rollback_order_status', {
      p_order_id: params.orderId,
      p_expected_status: params.expectedCurrentStatus,
      p_target_status: params.targetStatus,
      p_reason: params.reason || null,
    });

    if (rpcErr) {
      if (rpcErr.message?.includes('PERMISSION_DENIED')) {
        throw new Error('Solo administradores o propietarios pueden reabrir pedidos entregados.');
      }
      if (rpcErr.message?.includes('REASON_REQUIRED')) {
        throw new Error('Debes proporcionar un motivo obligatorio para reabrir este pedido.');
      }
      if (rpcErr.message?.includes('INVALID_BACKWARDS_TRANSITION')) {
        throw new Error('Esta regresión de estado no está permitida.');
      }
      throw new Error(`No se pudo revertir el pedido. Intenta nuevamente. (${rpcErr.message})`);
    }

    if (!rpcRes) {
      throw new Error('No se pudo revertir el pedido. Intenta nuevamente.');
    }

    if (rpcRes.success === false) {
      throw new Error(
        `CONCURRENCY_ERROR: ${rpcRes.message || 'El pedido cambió de estado desde otro dispositivo.'} (Estado actual: ${rpcRes.current_status || 'actualizado'})`
      );
    }
  }

  async getOrderStatusHistory(orderId: string): Promise<any[]> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error || !data) return [];
      return data.map((h: any) => ({
        id: h.id,
        orderId: h.order_id,
        businessId: h.business_id,
        fromStatus: h.from_status,
        toStatus: h.to_status,
        changedBy: h.changed_by,
        changedByName: h.changed_by_name,
        reason: h.reason,
        isRollback: h.is_rollback,
        createdAt: h.created_at,
      }));
    } catch (e) {
      return [];
    }
  }

  async updatePaymentVerificationStatus(
    orderId: string,
    verificationStatus: 'verified' | 'rejected',
    reason?: string
  ): Promise<void> {
    const supabase = createClient();
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('verify_payment_status', {
      p_order_id: orderId,
      p_verification_status: verificationStatus,
      p_reason: reason || null,
    });

    if (rpcErr) {
      if (rpcErr.message?.includes('PERMISSION_DENIED')) {
        throw new Error('Solo administradores o propietarios pueden verificar o rechazar comprobantes de pago.');
      }
      if (rpcErr.message?.includes('REASON_REQUIRED')) {
        throw new Error('Debes proporcionar un motivo obligatorio para corregir una verificación de pago previa.');
      }
      throw new Error(rpcErr.message || 'Error al actualizar verificación de pago.');
    }

    if (rpcRes && rpcRes.success === false) {
      throw new Error('No se pudo actualizar el estado de verificación de pago.');
    }
  }

  async getOrderStatusHistoryMap(orderIds: string[]): Promise<Record<string, any[]>> {
    if (!orderIds || orderIds.length === 0) return {};
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('order_status_history')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false });

      if (error || !data) return {};

      const map: Record<string, any[]> = {};
      for (const h of data) {
        const item = {
          id: h.id,
          orderId: h.order_id,
          businessId: h.business_id,
          fromStatus: h.from_status,
          toStatus: h.to_status,
          changedBy: h.changed_by,
          changedByName: h.changed_by_name,
          reason: h.reason,
          isRollback: h.is_rollback,
          createdAt: h.created_at,
        };
        if (!map[h.order_id]) map[h.order_id] = [];
        map[h.order_id].push(item);
      }
      return map;
    } catch (e) {
      return {};
    }
  }

  async getOrderByTrackingToken(trackingToken: string): Promise<Order | null> {
    const orders = await this.getOrders();
    return orders.find((o) => o.trackingToken === trackingToken || o.id === trackingToken) || null;
  }
}
