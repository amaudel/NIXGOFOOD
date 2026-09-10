import { isDemoMode } from '@/config/demo';
import { createClient } from '@/lib/supabase/client';
import { LoyaltyQuote, LoyaltyBalance, LoyaltyProgramConfig } from '@/types';

const DISABLED_QUOTE: LoyaltyQuote = { availablePoints: 0, redeemablePoints: 0, maxDiscount: 0 };
const DISABLED_BALANCE: LoyaltyBalance = { availablePoints: 0, pointsValue: 0 };

export async function getLoyaltyQuote(
  businessId: string,
  phone: string,
  subtotal: number
): Promise<LoyaltyQuote> {
  if (isDemoMode()) {
    return DISABLED_QUOTE;
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_loyalty_quote', {
    p_business_id: businessId,
    p_phone: phone,
    p_subtotal: subtotal,
  });

  if (error || !data) {
    return DISABLED_QUOTE;
  }

  return {
    availablePoints: data.availablePoints ?? 0,
    redeemablePoints: data.redeemablePoints ?? 0,
    maxDiscount: data.maxDiscount ?? 0,
  };
}

export async function getLoyaltyBalance(businessId: string, phone: string): Promise<LoyaltyBalance> {
  if (isDemoMode()) {
    return DISABLED_BALANCE;
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_loyalty_balance', {
    p_business_id: businessId,
    p_phone: phone,
  });

  if (error || !data) {
    return DISABLED_BALANCE;
  }

  return {
    availablePoints: data.availablePoints ?? 0,
    pointsValue: data.pointsValue ?? 0,
  };
}

export async function getLoyaltyProgramConfig(businessId: string): Promise<LoyaltyProgramConfig | null> {
  if (isDemoMode()) {
    return null;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('loyalty_programs')
    .select('enabled, points_per_currency_unit, redemption_value_per_point, max_redeem_percent')
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    enabled: data.enabled,
    pointsPerCurrencyUnit: parseFloat(data.points_per_currency_unit),
    redemptionValuePerPoint: parseFloat(data.redemption_value_per_point),
    maxRedeemPercent: parseFloat(data.max_redeem_percent),
  };
}

export async function saveLoyaltyProgramConfig(businessId: string, config: LoyaltyProgramConfig): Promise<void> {
  if (isDemoMode()) {
    throw new Error('La configuración de fidelización no está disponible en modo demo.');
  }

  const supabase = createClient();
  const { error } = await supabase.from('loyalty_programs').upsert(
    {
      business_id: businessId,
      enabled: config.enabled,
      points_per_currency_unit: config.pointsPerCurrencyUnit,
      redemption_value_per_point: config.redemptionValuePerPoint,
      max_redeem_percent: config.maxRedeemPercent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id' }
  );

  if (error) {
    throw new Error(error.message || 'No se pudo guardar la configuración de fidelización.');
  }
}
