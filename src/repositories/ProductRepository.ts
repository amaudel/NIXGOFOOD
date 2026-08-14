import { Category, Product } from '@/types';
import { getProductRepository } from './factory';

export class ProductRepository {
  static async getCategories(businessId?: string): Promise<Category[]> {
    return getProductRepository().getCategories(businessId);
  }

  static async getAllProducts(businessId?: string): Promise<Product[]> {
    return getProductRepository().getAllProducts(businessId);
  }

  static async setProductAvailability(productId: string, isAvailable: boolean): Promise<void> {
    return getProductRepository().setProductAvailability(productId, isAvailable);
  }

  static async softDeleteProduct(productId: string): Promise<void> {
    return getProductRepository().softDeleteProduct(productId);
  }
}
