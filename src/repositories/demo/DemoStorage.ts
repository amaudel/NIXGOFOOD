export const DEMO_KEYS = {
  CATEGORIES: 'nixgo_food_demo_categories',
  PRODUCTS: 'nixgo_food_demo_products',
  MODIFIER_GROUPS: 'nixgo_food_demo_modifiers',
  ORDERS: 'nixgo_food_demo_orders',
  BUSINESS: 'nixgo_food_demo_business',
  BRANCHES: 'nixgo_food_demo_branches',
  DELIVERY_ZONES: 'nixgo_food_demo_delivery_zones',
  BUSINESS_HOURS: 'nixgo_food_demo_hours',
};

// IndexedDB Helper for Proof Blobs
const DB_NAME = 'nixgofood_demo_db';
const STORE_NAME = 'proof_blobs';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB unavailable'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class DemoStorage {
  static getItem<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error(`Error reading ${key} from localStorage:`, e);
      return defaultValue;
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

  static removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error(`Error removing ${key} from localStorage:`, e);
    }
  }

  static resetDemoData(): void {
    if (typeof window === 'undefined') return;
    Object.values(DEMO_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
  }

  static async saveProofBlob(orderId: string, blob: Blob): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(blob, orderId);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('DemoStorage saveProofBlob failed:', e);
    }
  }

  static async getProofBlobUrl(orderId: string): Promise<string | null> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(orderId);

      return new Promise((resolve) => {
        req.onsuccess = () => {
          const blob = req.result as Blob;
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('DemoStorage getProofBlobUrl failed:', e);
      return null;
    }
  }

  static async deleteProofBlob(orderId: string): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(orderId);
    } catch (e) {
      console.warn('DemoStorage deleteProofBlob failed:', e);
    }
  }
}
