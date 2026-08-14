type SyncEventType =
  | 'ORDER_STATUS_CHANGED'
  | 'NEW_ORDER_CREATED'
  | 'PRODUCT_UPDATED'
  | 'BUSINESS_SETTINGS_UPDATED'
  | 'DEMO_RESET';

export interface SyncMessage {
  type: SyncEventType;
  payload?: any;
  timestamp: number;
}

export class DemoBroadcastService {
  private static CHANNEL_NAME = 'nixgo_food_demo_sync';
  private static channel: BroadcastChannel | null = null;

  private static getChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined') return null;
    if (!DemoBroadcastService.channel && 'BroadcastChannel' in window) {
      try {
        DemoBroadcastService.channel = new BroadcastChannel(DemoBroadcastService.CHANNEL_NAME);
      } catch (e) {
        console.error('BroadcastChannel initialization failed:', e);
      }
    }
    return DemoBroadcastService.channel;
  }

  /**
   * Broadcasts a sync event to all open tabs of the same browser origin
   */
  static notify(type: SyncEventType, payload?: any): void {
    if (typeof window === 'undefined') return;

    const message: SyncMessage = {
      type,
      payload,
      timestamp: Date.now(),
    };

    // 1. BroadcastChannel
    const bc = DemoBroadcastService.getChannel();
    if (bc) {
      try {
        bc.postMessage(message);
      } catch (e) {
        console.error('Error posting BroadcastChannel message:', e);
      }
    }

    // 2. Storage Event fallback trigger
    try {
      localStorage.setItem('nixgo_food_demo_last_event', JSON.stringify(message));
    } catch (e) {
      // Ignore quota/storage errors
    }
  }

  /**
   * Subscribes to sync events from other open tabs
   */
  static subscribe(callback: (msg: SyncMessage) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const bc = DemoBroadcastService.getChannel();

    const handleBroadcast = (event: MessageEvent) => {
      if (event.data && event.data.type) {
        callback(event.data as SyncMessage);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'nixgo_food_demo_last_event' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          callback(parsed);
        } catch (e) {
          // Ignore parse errors
        }
      }
    };

    if (bc) {
      bc.addEventListener('message', handleBroadcast);
    }
    window.addEventListener('storage', handleStorage);

    // Return cleanup unsubscribe function
    return () => {
      if (bc) {
        bc.removeEventListener('message', handleBroadcast);
      }
      window.removeEventListener('storage', handleStorage);
    };
  }
}
