import { createClient } from '@/lib/supabase/client';

export class StorageService {
  /**
   * Uploads an image to Supabase Storage under {businessId}/{folder}/{uuid}.ext
   */
  static async uploadImage(
    file: File,
    businessId: string,
    folder: 'logo' | 'products' = 'products'
  ): Promise<{ url: string | null; error: string | null }> {
    // Validate MIME types (JPEG, PNG, WEBP only, NO SVG)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        url: null,
        error: 'Formato de imagen no permitido. Solo se aceptan JPG, PNG y WEBP.',
      };
    }

    // Validate size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        url: null,
        error: 'La imagen supera el tamaño máximo permitido de 5MB.',
      };
    }

    try {
      const supabase = createClient();
      const fileExt = file.name.split('.').pop() || 'webp';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `${businessId}/${folder}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('restaurant-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return { url: null, error: uploadError.message };
      }

      const { data: publicUrlData } = supabase.storage
        .from('restaurant-media')
        .getPublicUrl(filePath);

      return { url: publicUrlData.publicUrl, error: null };
    } catch (err: any) {
      return { url: null, error: err.message || 'Error al subir la imagen.' };
    }
  }
}
