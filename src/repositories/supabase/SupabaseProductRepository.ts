import { Category, Product, ModifierGroup, Modifier } from '@/types';
import { IProductRepository } from '../interfaces/IProductRepository';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { initialCategories, initialProducts } from '@/data/mockData';
import { createClient } from '@/lib/supabase/client';

export class SupabaseProductRepository implements IProductRepository {
  async getCategories(businessId: string = CURRENT_BUSINESS_ID): Promise<Category[]> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('business_id', businessId)
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        if (process.env.NODE_ENV === 'production') throw new Error(`Error Supabase: ${error.message}`);
        return initialCategories;
      }

      if (!data || data.length === 0) {
        return initialCategories;
      }

      return data.map((c) => ({
        id: c.id,
        businessId: c.business_id,
        name: c.name,
        slug: c.slug,
        icon: c.icon || '🌮',
        sortOrder: c.sort_order,
        description: c.description,
        active: c.active,
      }));
    } catch (err: any) {
      if (process.env.NODE_ENV === 'production') throw err;
      return initialCategories;
    }
  }

  async getAllProducts(businessId: string = CURRENT_BUSINESS_ID): Promise<Product[]> {
    try {
      const supabase = createClient();
      const { data: rawProducts, error: prodError } = await supabase
        .from('products')
        .select(`
          *,
          product_modifier_groups (
            sort_order,
            modifier_groups (
              *,
              modifiers (*)
            )
          )
        `)
        .eq('business_id', businessId)
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (prodError) {
        if (process.env.NODE_ENV === 'production') throw new Error(`Error Supabase: ${prodError.message}`);
        return initialProducts;
      }

      if (!rawProducts || rawProducts.length === 0) {
        return initialProducts;
      }

      return (rawProducts || []).map((p: any) => {
        const modifierGroups: ModifierGroup[] = (p.product_modifier_groups || [])
          .map((pmg: any) => {
            const grp = pmg.modifier_groups;
            if (!grp || !grp.active) return null;
            const modifiers: Modifier[] = (grp.modifiers || [])
              .filter((m: any) => m.active !== false)
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((m: any) => ({
                id: m.id,
                modifierGroupId: m.modifier_group_id,
                name: m.name,
                price: parseFloat(m.price_delta),
                isAvailable: m.available !== false,
                active: m.active,
              }));

            return {
              id: grp.id,
              businessId: grp.business_id,
              name: grp.name,
              required: grp.required,
              minSelect: grp.min_selections,
              maxSelect: grp.max_selections,
              sortOrder: pmg.sort_order,
              modifiers,
            };
          })
          .filter(Boolean);

        const fallbackImg =
          p.name?.toLowerCase().includes('pastor')
            ? 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80'
            : p.name?.toLowerCase().includes('burger') || p.name?.toLowerCase().includes('hamburguesa')
            ? 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80'
            : p.name?.toLowerCase().includes('chicken') || p.name?.toLowerCase().includes('crispy')
            ? 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=800&q=80'
            : p.name?.toLowerCase().includes('combo')
            ? 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80'
            : p.name?.toLowerCase().includes('nacho') || p.name?.toLowerCase().includes('entrada')
            ? 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=800&q=80'
            : p.name?.toLowerCase().includes('horchata') || p.name?.toLowerCase().includes('bebida') || p.name?.toLowerCase().includes('limonada')
            ? 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80'
            : 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80';

        const finalImage = p.image_url && p.image_url.trim().length > 0 ? p.image_url : fallbackImg;

        return {
          id: p.id,
          businessId: p.business_id,
          categoryId: p.category_id,
          name: p.name,
          description: p.description || '',
          price: parseFloat(p.price),
          compareAtPrice: p.compare_at_price ? parseFloat(p.compare_at_price) : undefined,
          image: finalImage,
          isAvailable: p.available !== false,
          active: p.active,
          isPopular: p.featured,
          sortOrder: p.sort_order,
          modifierGroups,
        };
      });
    } catch (err: any) {
      if (process.env.NODE_ENV === 'production') throw err;
      return initialProducts;
    }
  }

  async setProductAvailability(productId: string, isAvailable: boolean): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('products')
      .update({ available: isAvailable, updated_at: new Date().toISOString() })
      .eq('id', productId);

    if (error) throw new Error(`Error Supabase: ${error.message}`);
  }

  async softDeleteProduct(productId: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('products')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', productId);

    if (error) throw new Error(`Error Supabase: ${error.message}`);
  }
}
