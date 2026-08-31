import { Business, Branch, DeliveryZone, BusinessHours, Motorizado } from '@/types';

export interface IBusinessRepository {
  getBusiness(businessId?: string): Promise<Business | null>;
  saveBusiness(business: Partial<Business>, businessId?: string): Promise<Business>;
  getBranches(businessId?: string): Promise<Branch[]>;
  getBranch(branchId: string): Promise<Branch | null>;
  saveBranch(branch: Partial<Branch>, businessId?: string): Promise<Branch>;
  getDeliveryZones(branchId?: string, businessId?: string): Promise<DeliveryZone[]>;
  saveDeliveryZones(zones: DeliveryZone[]): Promise<void>;
  getBusinessHours(branchId?: string, businessId?: string): Promise<BusinessHours[]>;
  saveBusinessHours(hours: BusinessHours[]): Promise<void>;
  getMotorizados(branchId?: string, businessId?: string): Promise<Motorizado[]>;
  saveMotorizado(motorizado: Partial<Motorizado>, businessId?: string): Promise<Motorizado>;
  deleteMotorizado(id: string): Promise<void>;
}
