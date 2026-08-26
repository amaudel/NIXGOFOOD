import { Business, Branch, DeliveryZone, BusinessHours, Motorizado } from '@/types';

export interface IBusinessRepository {
  getBusiness(businessId?: string): Promise<Business | null>;
  saveBusiness(business: Partial<Business>): Promise<Business>;
  getBranches(businessId?: string): Promise<Branch[]>;
  getBranch(branchId: string): Promise<Branch | null>;
  saveBranch(branch: Partial<Branch>): Promise<Branch>;
  getDeliveryZones(branchId?: string): Promise<DeliveryZone[]>;
  saveDeliveryZones(zones: DeliveryZone[]): Promise<void>;
  getBusinessHours(branchId?: string): Promise<BusinessHours[]>;
  saveBusinessHours(hours: BusinessHours[]): Promise<void>;
  getMotorizados(branchId?: string): Promise<Motorizado[]>;
  saveMotorizado(motorizado: Partial<Motorizado>): Promise<Motorizado>;
  deleteMotorizado(id: string): Promise<void>;
}
