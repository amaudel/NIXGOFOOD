import { createClient } from '@/lib/supabase/client';

export class StorageService {
  private static MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  private static ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  /**
   * Helper method for product image uploads (public bucket)
   */
  static async uploadImage(
    file: File,
    businessId: string,
    folder: string
  ): Promise<{ url?: string; error?: string }> {
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${businessId}/${folder}/${Date.now()}.${ext}`;

      const { data, error } = await supabase.storage.from('menu-images').upload(path, file);
      if (error) return { error: error.message };

      const { data: publicData } = supabase.storage.from('menu-images').getPublicUrl(data.path);
      return { url: publicData.publicUrl };
    } catch (e: any) {
      return { error: e.message || 'Error al subir imagen' };
    }
  }

  /**
   * Client-side validation checking file size and MIME type for instant UX feedback.
   */
  static validateProofFile(file: File): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'No se seleccionó ningún archivo.' };
    }

    const mimeType = file.type.toLowerCase();
    if (!this.ALLOWED_MIME_TYPES.includes(mimeType)) {
      return {
        valid: false,
        error: 'Formato no permitido. Solo se aceptan imágenes JPG, PNG o WebP.',
      };
    }

    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `El archivo supera el tamaño máximo de 5 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
      };
    }

    return { valid: true };
  }

  /**
   * Client-side Magic Bytes Header Inspection (JPEG, PNG, WebP) for instant UX feedback.
   */
  static async validateProofFileWithMagicBytes(file: File): Promise<{ valid: boolean; error?: string }> {
    const basicValidation = this.validateProofFile(file);
    if (!basicValidation.valid) return basicValidation;

    try {
      const buffer = await file.slice(0, 12).arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // JPEG: FF D8 FF
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

      // PNG: 89 50 4E 47 0D 0A 1A 0A
      const isPng =
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;

      // WebP: RIFF (bytes 0-3: 52 49 46 46) and WEBP (bytes 8-11: 57 45 42 50)
      const isRiff =
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46;
      const isWebp =
        isRiff &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50;

      if (!isJpeg && !isPng && !isWebp) {
        return {
          valid: false,
          error: 'El contenido del archivo no coincide con una imagen real JPG, PNG o WebP (cabecera de imagen inválida).',
        };
      }

      return { valid: true };
    } catch (e) {
      return { valid: true };
    }
  }

  /**
   * Uploads payment proof photo via secure Server Route Handler `POST /api/payment-proof/upload`.
   * Returns { proofPath, cleanupToken }.
   */
  static async uploadPaymentProof(
    file: File,
    _businessId?: string,
    _tempOrderId?: string
  ): Promise<{ proofPath: string; cleanupToken: string }> {
    const validation = await this.validateProofFileWithMagicBytes(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Archivo de comprobante no válido.');
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/payment-proof/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'No pudimos subir tu comprobante al servidor.');
    }

    const data = await res.json();
    if (!data?.proofPath || !data?.cleanupToken) {
      throw new Error('El servidor no devolvió la ruta o el token de limpieza del comprobante.');
    }

    return {
      proofPath: data.proofPath,
      cleanupToken: data.cleanupToken,
    };
  }

  /**
   * Calls secure server API Route `/api/admin/proof-url?orderId=...` to generate short-lived Signed URL (300 s)
   * enforcing server-side business ownership verification.
   */
  static async getSignedUrl(orderIdOrPath: string): Promise<string | null> {
    if (!orderIdOrPath) return null;

    try {
      const res = await fetch(`/api/admin/proof-url?orderId=${encodeURIComponent(orderIdOrPath)}`);
      if (!res.ok) {
        console.warn('Signed URL request rejected by server API:', res.status);
        return null;
      }
      const data = await res.json();
      return data.signedUrl || null;
    } catch (err) {
      console.error('Failed to retrieve signed URL via server route:', err);
      return null;
    }
  }

  /**
   * Rollback cleanup: Sends HMAC cleanupToken to server route `/api/payment-proof/cleanup`.
   */
  static async deletePaymentProof(cleanupToken: string): Promise<void> {
    if (!cleanupToken) return;

    try {
      await fetch('/api/payment-proof/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleanupToken }),
      });
    } catch (err) {
      console.warn('Rollback cleanup exception:', err);
    }
  }
}
