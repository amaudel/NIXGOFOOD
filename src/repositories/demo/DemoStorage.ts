import { demoCategories, demoProducts, demoModifierGroups, demoDeliveryZones, demoBusinessHours, demoBusiness, demoBranch, demoInitialOrders } from '@/data/demoSeed';

export const DEMO_KEYS = {
  VERSION: 'nixgo_food_demo_version',
  PRODUCTS: 'nixgo_food_demo_products',
  CATEGORIES: 'nixgo_food_demo_categories',
  MODIFIER_GROUPS: 'nixgo_food_demo_modifier_groups',
  DELIVERY_ZONES: 'nixgo_food_demo_delivery_zones',
  BUSINESS_HOURS: 'nixgo_food_demo_business_hours',
  BUSINESS: 'nixgo_food_demo_business',
  BRANCH: 'nixgo_food_demo_branch',
  ORDERS: 'nixgo_food_demo_orders',
};

export const CURRENT_DEMO_VERSION = 'v1.2_webp_commercial_cuenca_assets_v5';

export class DemoStorage {
  private static checkAndMigrateVersion(): void {
    if (typeof window === 'undefined') return;
    try {
      const storedVersion = localStorage.getItem(DEMO_KEYS.VERSION);
      if (storedVersion !== CURRENT_DEMO_VERSION) {
        console.log(`[DemoStorage] Migrating localStorage to version ${CURRENT_DEMO_VERSION}`);
        DemoStorage.resetDemoData();
      }
    } catch (e) {
      console.error('Error migrating DemoStorage version:', e);
    }
  }

  static getItem<T>(key: string, defaultData: T): T {
    if (typeof window === 'undefined') return defaultData;
    try {
      this.checkAndMigrateVersion();
      const stored = localStorage.getItem(key);
      if (!stored) {
        localStorage.setItem(key, JSON.stringify(defaultData));
        return defaultData;
      }
      return JSON.parse(stored) as T;
    } catch (e) {
      console.error(`Error reading ${key} from localStorage:`, e);
      return defaultData;
    }
  }

  static setItem<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Error writing ${key} to localStorage:`, e);
    }
  }

  /**
   * Resets demo data safely without calling localStorage.clear().
   * Deletes ONLY keys starting with 'nixgo_food_demo_' and re-seeds from demoSeed.
   */
  static resetDemoData(): void {
    if (typeof window === 'undefined') return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('nixgo_food_demo_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // Re-seed
      localStorage.setItem(DEMO_KEYS.VERSION, CURRENT_DEMO_VERSION);
      localStorage.setItem(DEMO_KEYS.PRODUCTS, JSON.stringify(demoProducts));
      localStorage.setItem(DEMO_KEYS.CATEGORIES, JSON.stringify(demoCategories));
      localStorage.setItem(DEMO_KEYS.MODIFIER_GROUPS, JSON.stringify(demoModifierGroups));
      localStorage.setItem(DEMO_KEYS.DELIVERY_ZONES, JSON.stringify(demoDeliveryZones));
      localStorage.setItem(DEMO_KEYS.BUSINESS_HOURS, JSON.stringify(demoBusinessHours));
      localStorage.setItem(DEMO_KEYS.BUSINESS, JSON.stringify(demoBusiness));
      localStorage.setItem(DEMO_KEYS.BRANCH, JSON.stringify(demoBranch));
      localStorage.setItem(DEMO_KEYS.ORDERS, JSON.stringify(demoInitialOrders));
    } catch (e) {
      console.error('Error resetting demo data:', e);
    }
  }
}
