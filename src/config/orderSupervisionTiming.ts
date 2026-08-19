export interface SupervisionThresholds {
  warningMinutes: number;
  criticalMinutes: number;
}

export const SUPERVISION_TIMING_CONFIG: Record<
  'PAYMENT_PENDING' | 'PREPARING' | 'READY' | 'ON_THE_WAY' | 'NEW',
  SupervisionThresholds
> = {
  PAYMENT_PENDING: {
    warningMinutes: 5,
    criticalMinutes: 10,
  },
  PREPARING: {
    warningMinutes: 15,
    criticalMinutes: 25,
  },
  READY: {
    warningMinutes: 8,
    criticalMinutes: 15,
  },
  ON_THE_WAY: {
    warningMinutes: 30,
    criticalMinutes: 45,
  },
  NEW: {
    warningMinutes: 8,
    criticalMinutes: 15,
  },
};
