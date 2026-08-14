import { Category, Product, ModifierGroup } from '@/types';

export interface IProductRepository {
  getCategories(businessId?: string): Promise<Category[]>;
  getAllProducts(businessId?: string): Promise<Product[]>;
  setProductAvailability(productId: string, isAvailable: boolean): Promise<void>;
  softDeleteProduct(productId: string): Promise<void>;
  saveProduct?(product: Partial<Product> & { id?: string }): Promise<Product>;
  saveCategory?(category: Partial<Category> & { id?: string }): Promise<Category>;
  getModifierGroups?(): Promise<ModifierGroup[]>;
  saveModifierGroup?(group: Partial<ModifierGroup> & { id?: string }): Promise<ModifierGroup>;
}
