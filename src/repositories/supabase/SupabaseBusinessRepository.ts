import { Business, Branch, DeliveryZone, BusinessHours } from '@/types';
import { IBusinessRepository } from '../interfaces/IBusinessRepository';
import { CURRENT_BUSINESS_ID, businessConfig, activeBranch } from '@/config/business';
import { createClient } from '@/lib/supabase/client';

export class SupabaseBusinessRepository implements IBusinessRepository {
  async getBusiness(businessId: string = CURRENT_BUSINESS_ID): Promise<Business | null> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('businesses').select('*').eq('id', businessId).single();
      if (error || !data) return businessConfig;
      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        slogan: data.slogan || '',
        logo: data.logo_url || businessConfig.logo,
        coverImage: data.cover_url || businessConfig.coverImage,
        description: data.description || '',
        phone: data.phone || '',
        whatsapp: data.whatsapp || '',
        currency: data.currency || 'USD',
        currencySymbol: '$',
        primaryColor: data.primary_color || '#e11d48',
        secondaryColor: data.secondary_color || '#f59e0b',
        timezone: data.timezone || 'America/Guayaquil',
        active: data.active,
        openingHours: 'Lun - Dom: 09:00 - 23:00',
      };
    } catch {
      return businessConfig;
    }
  }

  async saveBusiness(business: Partial<Business>): Promise<Business> {
    const supabase = createClient();
    const { error } = await supabase
      .from('businesses')
      .update({
        name: business.name,
        description: business.description,
        phone: business.phone,
        whatsapp: business.whatsapp,
        currency: business.currency,
        primary_color: business.primaryColor,
        updated_at: new Date().toISOString(),
      })
      .eq('id', CURRENT_BUSINESS_ID);

    if (error) throw new Error(`Error Supabase: ${error.message}`);
    return (await this.getBusiness())!;
  }

  private mapBranch(data: any): Branch {
    return {
      id: data.id,
      businessId: data.business_id,
      name: data.name,
      address: data.address,
      latitude: parseFloat(data.latitude),
      longitude: parseFloat(data.longitude),
      phone: data.phone || '',
      active: data.active,
    };
  }

  async getBranches(businessId: string = CURRENT_BUSINESS_ID): Promise<Branch[]> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('business_id', businessId)
        .order('name', { ascending: true });
      if (error || !data || data.length === 0) return [activeBranch];
      return data.map((d: any) => this.mapBranch(d));
    } catch {
      return [activeBranch];
    }
  }

  async getBranch(branchId: string): Promise<Branch | null> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branchId)
        .maybeSingle();
      if (error || !data) return null;
      return this.mapBranch(data);
    } catch {
      return null;
    }
  }

  async saveBranch(branch: Partial<Branch>): Promise<Branch> {
    const supabase = createClient();
    const payload = {
      business_id: CURRENT_BUSINESS_ID,
      name: branch.name,
      address: branch.address,
      latitude: branch.latitude,
      longitude: branch.longitude,
      phone: branch.phone,
      active: branch.active ?? true,
      updated_at: new Date().toISOString(),
    };

    if (branch.id) {
      const { data, error } = await supabase
        .from('branches')
        .update(payload)
        .eq('id', branch.id)
        .select()
        .single();
      if (error) throw new Error(`Error Supabase: ${error.message}`);
      return this.mapBranch(data);
    }

    const { data, error } = await supabase.from('branches').insert(payload).select().single();
    if (error) throw new Error(`Error Supabase: ${error.message}`);
    return this.mapBranch(data);
  }

  async getDeliveryZones(branchId?: string): Promise<DeliveryZone[]> {
    try {
      const supabase = createClient();
      let query = supabase
        .from('delivery_zones')
        .select('*')
        .eq('business_id', CURRENT_BUSINESS_ID)
        .eq('active', true);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data } = await query;
      return (data || []).map((z: any) => ({
        id: z.id,
        businessId: z.business_id,
        branchId: z.branch_id,
        name: z.name,
        maxDistanceKm: parseFloat(z.max_distance_km),
        fee: parseFloat(z.fee),
        estimatedMinutes: `${z.estimated_min_minutes}-${z.estimated_max_minutes} min`,
        active: z.active,
      }));
    } catch {
      return [];
    }
  }

  async saveDeliveryZones(): Promise<void> {
    // Handled in specific UI route if needed
  }

  async getBusinessHours(branchId?: string): Promise<BusinessHours[]> {
    try {
      const supabase = createClient();
      let query = supabase.from('business_hours').select('*').eq('business_id', CURRENT_BUSINESS_ID);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data } = await query;
      return (data || []).map((h: any) => ({
        id: h.id,
        businessId: h.business_id,
        branchId: h.branch_id,
        dayOfWeek: h.day_of_week,
        openTime: h.open_time,
        closeTime: h.close_time,
        closed: h.closed,
      }));
    } catch {
      return [];
    }
  }

  async saveBusinessHours(): Promise<void> {
    // Handled in specific UI route if needed
  }
}
