import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/demo', () => ({
  isDemoMode: vi.fn(),
}));

const rpcMock = vi.fn();
const fromMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}));

import { isDemoMode } from '@/config/demo';
import { getLoyaltyQuote, getLoyaltyProgramConfig, saveLoyaltyProgramConfig } from '../loyalty';

describe('loyalty (modo demo)', () => {
  beforeEach(() => {
    vi.mocked(isDemoMode).mockReturnValue(true);
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it('getLoyaltyQuote devuelve todo en cero sin llamar a Supabase', async () => {
    const quote = await getLoyaltyQuote('biz_1', '0991234567', 20);
    expect(quote).toEqual({ availablePoints: 0, redeemablePoints: 0, maxDiscount: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('getLoyaltyProgramConfig devuelve null sin llamar a Supabase', async () => {
    const config = await getLoyaltyProgramConfig('biz_1');
    expect(config).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('saveLoyaltyProgramConfig rechaza con mensaje claro', async () => {
    await expect(
      saveLoyaltyProgramConfig('biz_1', {
        enabled: true,
        pointsPerCurrencyUnit: 1,
        redemptionValuePerPoint: 0.01,
        maxRedeemPercent: 30,
      })
    ).rejects.toThrow('no está disponible en modo demo');
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('loyalty (modo real)', () => {
  beforeEach(() => {
    vi.mocked(isDemoMode).mockReturnValue(false);
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it('getLoyaltyQuote llama al RPC get_loyalty_quote con los parametros correctos', async () => {
    rpcMock.mockResolvedValue({
      data: { availablePoints: 500, redeemablePoints: 500, maxDiscount: 5 },
      error: null,
    });

    const quote = await getLoyaltyQuote('biz_1', '0991234567', 20);

    expect(rpcMock).toHaveBeenCalledWith('get_loyalty_quote', {
      p_business_id: 'biz_1',
      p_phone: '0991234567',
      p_subtotal: 20,
    });
    expect(quote).toEqual({ availablePoints: 500, redeemablePoints: 500, maxDiscount: 5 });
  });
});
