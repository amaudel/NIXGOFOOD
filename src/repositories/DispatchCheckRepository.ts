'use client';

import { createClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/config/demo';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';
import { ChecklistState } from '@/components/admin/DispatchChecklist';

const DEMO_STORAGE_KEY = 'nixgo_demo_dispatch_checks';

export class DispatchCheckRepository {
  /**
   * Get all dispatch checks for orders in the current business
   */
  static async getChecks(businessId: string): Promise<Record<string, ChecklistState>> {
    if (isDemoMode()) {
      try {
        const raw = localStorage.getItem(DEMO_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return {};
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('order_dispatch_checks')
        .select('order_id, order_complete, packaging, beverages, extras')
        .eq('business_id', businessId);

      if (error || !data) return {};

      const result: Record<string, ChecklistState> = {};
      data.forEach((row) => {
        result[row.order_id] = {
          complete: !!row.order_complete,
          packaging: !!row.packaging,
          drinks: !!row.beverages,
          extras: !!row.extras,
        };
      });
      return result;
    } catch (e) {
      console.warn('Failed to fetch dispatch checks from Supabase:', e);
      return {};
    }
  }

  /**
   * Atomically toggle a single check column for an order without overwriting other columns
   */
  static async toggleCheck(
    businessId: string,
    orderId: string,
    key: keyof ChecklistState,
    currentChecks: ChecklistState
  ): Promise<ChecklistState> {
    const newValue = !currentChecks[key];
    const updatedChecks: ChecklistState = {
      ...currentChecks,
      [key]: newValue,
    };

    if (isDemoMode()) {
      try {
        const raw = localStorage.getItem(DEMO_STORAGE_KEY);
        const existing: Record<string, ChecklistState> = raw ? JSON.parse(raw) : {};
        existing[orderId] = updatedChecks;
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(existing));

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('nixgofood_demo_storage_change'));
          DemoBroadcastService.notify('DISPATCH_CHECK_UPDATED', { orderId, checks: updatedChecks });
        }
      } catch (e) {}
      return updatedChecks;
    }

    try {
      const supabase = createClient();
      const { data: userRes } = await supabase.auth.getUser();

      const dbColumnMap: Record<keyof ChecklistState, string> = {
        complete: 'order_complete',
        packaging: 'packaging',
        drinks: 'beverages',
        extras: 'extras',
      };

      const dbColumn = dbColumnMap[key];
      const nowIso = new Date().toISOString();

      // Check if row already exists for this order_id
      const { data: existingRow } = await supabase
        .from('order_dispatch_checks')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();

      if (existingRow) {
        // Atomic Partial UPDATE of strictly the single targeted column
        await supabase
          .from('order_dispatch_checks')
          .update({
            [dbColumn]: newValue,
            updated_by: userRes?.user?.id || null,
            updated_at: nowIso,
          })
          .eq('order_id', orderId)
          .eq('business_id', businessId);
      } else {
        // Initial atomic UPSERT with explicit ON CONFLICT
        const initialPayload: any = {
          business_id: businessId,
          order_id: orderId,
          order_complete: false,
          packaging: false,
          beverages: false,
          extras: false,
          [dbColumn]: newValue,
          updated_by: userRes?.user?.id || null,
          updated_at: nowIso,
        };

        await supabase
          .from('order_dispatch_checks')
          .upsert(initialPayload, { onConflict: 'order_id' });
      }
    } catch (e) {
      console.warn('Dispatch check sync error:', e);
    }

    return updatedChecks;
  }
}
