import { Business, Branch, DeliveryZone, BusinessHours } from '@/types';
import { IBusinessRepository } from '../interfaces/IBusinessRepository';
import { DemoStorage, DEMO_KEYS } from './DemoStorage';
import { demoBusiness, demoBranch, demoDeliveryZones, demoBusinessHours } from '@/data/demoSeed';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';

export class DemoBusinessRepository implements IBusinessRepository {
  static async getBusiness(): Promise<Business> {
    return DemoStorage.getItem<Business>(DEMO_KEYS.BUSINESS, demoBusiness);
  }

  static async saveBusiness(business: Partial<Business>): Promise<Business> {
    const current = await DemoBusinessRepository.getBusiness();
    const updated = { ...current, ...business };
    DemoStorage.setItem(DEMO_KEYS.BUSINESS, updated);
    DemoBroadcastService.notify('BUSINESS_SETTINGS_UPDATED', updated);
    return updated;
  }

  static async getBranch(): Promise<Branch> {
    return DemoStorage.getItem<Branch>(DEMO_KEYS.BRANCH, demoBranch);
  }

  static async saveBranch(branch: Partial<Branch>): Promise<Branch> {
    const current = await DemoBusinessRepository.getBranch();
    const updated = { ...current, ...branch };
    DemoStorage.setItem(DEMO_KEYS.BRANCH, updated);
    DemoBroadcastService.notify('BUSINESS_SETTINGS_UPDATED', updated);
    return updated;
  }

  static async getDeliveryZones(): Promise<DeliveryZone[]> {
    return DemoStorage.getItem<DeliveryZone[]>(DEMO_KEYS.DELIVERY_ZONES, demoDeliveryZones);
  }

  static async saveDeliveryZones(zones: DeliveryZone[]): Promise<void> {
    DemoStorage.setItem(DEMO_KEYS.DELIVERY_ZONES, zones);
    DemoBroadcastService.notify('BUSINESS_SETTINGS_UPDATED', zones);
  }

  static async getBusinessHours(): Promise<BusinessHours[]> {
    return DemoStorage.getItem<BusinessHours[]>(DEMO_KEYS.BUSINESS_HOURS, demoBusinessHours);
  }

  static async saveBusinessHours(hours: BusinessHours[]): Promise<void> {
    DemoStorage.setItem(DEMO_KEYS.BUSINESS_HOURS, hours);
    DemoBroadcastService.notify('BUSINESS_SETTINGS_UPDATED', hours);
  }

  // Instance methods for IBusinessRepository interface
  async getBusiness(): Promise<Business> {
    return DemoBusinessRepository.getBusiness();
  }

  async saveBusiness(business: Partial<Business>): Promise<Business> {
    return DemoBusinessRepository.saveBusiness(business);
  }

  async getBranch(): Promise<Branch> {
    return DemoBusinessRepository.getBranch();
  }

  async saveBranch(branch: Partial<Branch>): Promise<Branch> {
    return DemoBusinessRepository.saveBranch(branch);
  }

  async getDeliveryZones(): Promise<DeliveryZone[]> {
    return DemoBusinessRepository.getDeliveryZones();
  }

  async saveDeliveryZones(zones: DeliveryZone[]): Promise<void> {
    return DemoBusinessRepository.saveDeliveryZones(zones);
  }

  async getBusinessHours(): Promise<BusinessHours[]> {
    return DemoBusinessRepository.getBusinessHours();
  }

  async saveBusinessHours(hours: BusinessHours[]): Promise<void> {
    return DemoBusinessRepository.saveBusinessHours(hours);
  }
}
