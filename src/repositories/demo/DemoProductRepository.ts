import { Category, Product, ModifierGroup } from '@/types';
import { IProductRepository } from '../interfaces/IProductRepository';
import { DemoStorage, DEMO_KEYS } from './DemoStorage';
import { demoCategories, demoProducts, demoModifierGroups } from '@/data/demoSeed';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';

export class DemoProductRepository implements IProductRepository {
  static async getCategories(): Promise<Category[]> {
    return DemoStorage.getItem<Category[]>(DEMO_KEYS.CATEGORIES, demoCategories);
  }

  static async getAllProducts(): Promise<Product[]> {
    return DemoStorage.getItem<Product[]>(DEMO_KEYS.PRODUCTS, demoProducts);
  }

  static async setProductAvailability(productId: string, isAvailable: boolean): Promise<void> {
    const products = await DemoProductRepository.getAllProducts();
    const updated = products.map((p) => (p.id === productId ? { ...p, isAvailable } : p));
    DemoStorage.setItem(DEMO_KEYS.PRODUCTS, updated);
    DemoBroadcastService.notify('PRODUCT_UPDATED', { productId, isAvailable });
  }

  static async softDeleteProduct(productId: string): Promise<void> {
    const products = await DemoProductRepository.getAllProducts();
    const updated = products.filter((p) => p.id !== productId);
    DemoStorage.setItem(DEMO_KEYS.PRODUCTS, updated);
    DemoBroadcastService.notify('PRODUCT_UPDATED', { productId });
  }

  static async saveProduct(product: Partial<Product> & { id?: string }): Promise<Product> {
    const products = await DemoProductRepository.getAllProducts();
    let saved: Product;

    if (product.id) {
      const updated = products.map((p) =>
        p.id === product.id ? ({ ...p, ...product } as Product) : p
      );
      DemoStorage.setItem(DEMO_KEYS.PRODUCTS, updated);
      saved = updated.find((p) => p.id === product.id)!;
    } else {
      saved = {
        id: `p_demo_${Date.now()}`,
        businessId: product.businessId || 'b0000000-0000-0000-0000-000000000001',
        categoryId: product.categoryId || 'cat_burgers',
        name: product.name || 'Nuevo Producto Demo',
        description: product.description || '',
        price: product.price || 0,
        compareAtPrice: product.compareAtPrice,
        image: product.image || 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80',
        isAvailable: product.isAvailable !== false,
        isPopular: !!product.isPopular,
        sortOrder: products.length + 1,
      };
      products.push(saved);
      DemoStorage.setItem(DEMO_KEYS.PRODUCTS, products);
    }

    DemoBroadcastService.notify('PRODUCT_UPDATED', saved);
    return saved;
  }

  static async saveCategory(cat: Partial<Category> & { id?: string }): Promise<Category> {
    const categories = await DemoProductRepository.getCategories();
    let saved: Category;

    if (cat.id) {
      const updated = categories.map((c) => (c.id === cat.id ? ({ ...c, ...cat } as Category) : c));
      DemoStorage.setItem(DEMO_KEYS.CATEGORIES, updated);
      saved = updated.find((c) => c.id === cat.id)!;
    } else {
      saved = {
        id: `cat_demo_${Date.now()}`,
        businessId: cat.businessId || 'b0000000-0000-0000-0000-000000000001',
        name: cat.name || 'Nueva Categoría',
        slug: cat.slug || 'nueva-categoria',
        icon: cat.icon || '🍔',
        sortOrder: categories.length + 1,
        active: true,
      };
      categories.push(saved);
      DemoStorage.setItem(DEMO_KEYS.CATEGORIES, categories);
    }

    DemoBroadcastService.notify('PRODUCT_UPDATED', saved);
    return saved;
  }

  static async getModifierGroups(): Promise<ModifierGroup[]> {
    return DemoStorage.getItem<ModifierGroup[]>(DEMO_KEYS.MODIFIER_GROUPS, demoModifierGroups);
  }

  static async saveModifierGroup(grp: Partial<ModifierGroup> & { id?: string }): Promise<ModifierGroup> {
    const groups = await DemoProductRepository.getModifierGroups();
    let saved: ModifierGroup;

    if (grp.id) {
      const updated = groups.map((g) => (g.id === grp.id ? ({ ...g, ...grp } as ModifierGroup) : g));
      DemoStorage.setItem(DEMO_KEYS.MODIFIER_GROUPS, updated);
      saved = updated.find((g) => g.id === grp.id)!;
    } else {
      saved = {
        id: `grp_demo_${Date.now()}`,
        name: grp.name || 'Nuevo Grupo',
        required: !!grp.required,
        minSelect: grp.minSelect || 0,
        maxSelect: grp.maxSelect || 1,
        modifiers: [],
      };
      groups.push(saved);
      DemoStorage.setItem(DEMO_KEYS.MODIFIER_GROUPS, groups);
    }

    DemoBroadcastService.notify('PRODUCT_UPDATED', saved);
    return saved;
  }

  // Instance methods for IProductRepository interface
  async getCategories(): Promise<Category[]> {
    return DemoProductRepository.getCategories();
  }

  async getAllProducts(): Promise<Product[]> {
    return DemoProductRepository.getAllProducts();
  }

  async setProductAvailability(productId: string, isAvailable: boolean): Promise<void> {
    return DemoProductRepository.setProductAvailability(productId, isAvailable);
  }

  async softDeleteProduct(productId: string): Promise<void> {
    return DemoProductRepository.softDeleteProduct(productId);
  }

  async saveProduct(product: Partial<Product> & { id?: string }): Promise<Product> {
    return DemoProductRepository.saveProduct(product);
  }

  async saveCategory(cat: Partial<Category> & { id?: string }): Promise<Category> {
    return DemoProductRepository.saveCategory(cat);
  }

  async getModifierGroups(): Promise<ModifierGroup[]> {
    return DemoProductRepository.getModifierGroups();
  }

  async saveModifierGroup(grp: Partial<ModifierGroup> & { id?: string }): Promise<ModifierGroup> {
    return DemoProductRepository.saveModifierGroup(grp);
  }
}
