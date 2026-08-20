import { Business, Branch, DeliveryZone, BusinessHours } from '@/types';
import { IBusinessRepository } from '../interfaces/IBusinessRepository';
import { DemoStorage, DEMO_KEYS } from './DemoStorage';
import { demoBusiness, demoBranch, demoBranches, demoBranchNorte, demoDeliveryZones, demoBusinessHours } from '@/data/demoSeed';
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

  static async getBranches(): Promise<Branch[]> {
    return DemoStorage.getItem<Branch[]>(DEMO_KEYS.BRANCHES, demoBranches);
  }

  static async getBranch(branchId?: string): Promise<Branch | null> {
    const branches = await DemoBusinessRepository.getBranches();
    if (!branchId) {
      return branches[0] || null;
    }
    return branches.find((b) => b.id === branchId) || null;
  }

  static async saveBranch(branch: Partial<Branch>): Promise<Branch> {
    const branches = await DemoBusinessRepository.getBranches();
    if (branch.id) {
      const updated = branches.map((b) => (b.id === branch.id ? { ...b, ...branch } : b));
      DemoStorage.setItem(DEMO_KEYS.BRANCHES, updated);
      DemoBroadcastService.notify('BUSINESS_SETTINGS_UPDATED', updated);
      return updated.find((b) => b.id === branch.id)!;
    }
    const nueva: Branch = {
      id: `br_demo_${Date.now()}`,
      businessId: demoBusiness.id,
      name: branch.name || 'Nueva sucursal',
      address: branch.address || '',
      latitude: branch.latitude ?? demoBranch.latitude,
      longitude: branch.longitude ?? demoBranch.longitude,
      phone: branch.phone || '',
      active: branch.active ?? true,
    };
    const conNueva = [...branches, nueva];
    DemoStorage.setItem(DEMO_KEYS.BRANCHES, conNueva);
    DemoBroadcastService.notify('BUSINESS_SETTINGS_UPDATED', conNueva);
    return nueva;
  }

  static async getDeliveryZones(branchId?: string): Promise<DeliveryZone[]> {
    const all = DemoStorage.getItem<DeliveryZone[]>(DEMO_KEYS.DELIVERY_ZONES, demoDeliveryZones);
    return branchId ? all.filter((z) => z.branchId === branchId) : all;
  }

  static async saveDeliveryZones(zones: DeliveryZone[]): Promise<void> {
    DemoStorage.setItem(DEMO_KEYS.DELIVERY_ZONES, zones);
    DemoBroadcastService.notify('BUSINESS_SETTINGS_UPDATED', zones);
  }

  static async getBusinessHours(branchId?: string): Promise<BusinessHours[]> {
    const all = DemoStorage.getItem<BusinessHours[]>(DEMO_KEYS.BUSINESS_HOURS, demoBusinessHours);
    return branchId ? all.filter((h) => h.branchId === branchId) : all;
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

  async getBranches(): Promise<Branch[]> {
    return DemoBusinessRepository.getBranches();
  }

  async getBranch(branchId: string): Promise<Branch | null> {
    return DemoBusinessRepository.getBranch(branchId);
  }

  async saveBranch(branch: Partial<Branch>): Promise<Branch> {
    return DemoBusinessRepository.saveBranch(branch);
  }

  async getDeliveryZones(branchId?: string): Promise<DeliveryZone[]> {
    return DemoBusinessRepository.getDeliveryZones(branchId);
  }

  async saveDeliveryZones(zones: DeliveryZone[]): Promise<void> {
    return DemoBusinessRepository.saveDeliveryZones(zones);
  }

  async getBusinessHours(branchId?: string): Promise<BusinessHours[]> {
    return DemoBusinessRepository.getBusinessHours(branchId);
  }

  async saveBusinessHours(hours: BusinessHours[]): Promise<void> {
    return DemoBusinessRepository.saveBusinessHours(hours);
  }
}
