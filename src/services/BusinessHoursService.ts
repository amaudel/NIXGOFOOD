import { BusinessHours } from '@/types';

export class BusinessHoursService {
  /**
   * Evaluates if restaurant is currently open based on current time in configured timezone (default 'America/Guayaquil')
   */
  static isRestaurantOpen(hoursList: BusinessHours[], timezone: string = 'America/Guayaquil'): {
    isOpen: boolean;
    reason?: string;
  } {
    if (!hoursList || hoursList.length === 0) {
      // Default to open if no hours set
      return { isOpen: true };
    }

    try {
      // Format current time in explicit target timezone e.g. America/Guayaquil
      const now = new Date();
      
      const dayFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'narrow',
      });

      // Get day of week (0=Sunday ... 6=Saturday)
      const dayName = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
      }).format(now);

      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };

      const dayOfWeek = dayMap[dayName] ?? now.getDay();

      const timeString = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);

      const [currentHour, currentMin] = timeString.split(':').map((n) => parseInt(n, 10));
      const currentMinutesFromMidnight = currentHour * 60 + currentMin;

      const todayHours = hoursList.find((h) => h.dayOfWeek === dayOfWeek);

      if (!todayHours || todayHours.closed) {
        return {
          isOpen: false,
          reason: 'El restaurante se encuentra cerrado hoy.',
        };
      }

      const [openHour, openMin] = todayHours.openTime.split(':').map((n) => parseInt(n, 10));
      const [closeHour, closeMin] = todayHours.closeTime.split(':').map((n) => parseInt(n, 10));

      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      if (currentMinutesFromMidnight >= openMinutes && currentMinutesFromMidnight <= closeMinutes) {
        return { isOpen: true };
      }

      return {
        isOpen: false,
        reason: `El restaurante atiende hoy de ${todayHours.openTime.substring(0, 5)} a ${todayHours.closeTime.substring(0, 5)}.`,
      };
    } catch (err) {
      console.error('Error evaluating business hours', err);
      return { isOpen: true };
    }
  }
}
