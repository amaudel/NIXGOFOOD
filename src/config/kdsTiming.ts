/**
 * Centralized Operational Timing Thresholds for NixgoFood KDS
 * All values in minutes. Allows future per-business configuration overrides.
 */
export const KDS_TIMING = {
  // General operational thresholds
  warningMinutes: 10,  // 11-20 min => Atención (Yellow/Orange)
  criticalMinutes: 20, // > 20 min => Demorado (Red)

  // Unaccepted 'new' status priority thresholds
  newStatusWarningMinutes: 5,  // 6-10 min => SIN ACEPTAR
  newStatusCriticalMinutes: 10, // 11-20 min => ATENCIÓN SIN ACEPTAR
  newStatusUrgentMinutes: 20,   // > 20 min => URGENTE SIN ACEPTAR
} as const;

export type KdsSeverity = 'none' | 'normal' | 'warning' | 'critical' | 'urgent';

export interface KdsTimeAnalysis {
  elapsedMinutes: number;
  formattedTime: string;
  severity: KdsSeverity;
  badgeLabel: string;
  subLabel?: string;
  ariaText: string;
}
