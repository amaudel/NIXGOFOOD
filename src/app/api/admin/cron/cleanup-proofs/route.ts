import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CURRENT_BUSINESS_ID } from '@/config/business';
import { isDemoMode } from '@/config/demo';
import { DemoStorage } from '@/repositories/demo/DemoStorage';
import { DemoOrderRepository } from '@/repositories/demo/DemoOrderRepository';

export async function POST(request: Request) {
  try {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    if (isDemoMode()) {
      // Demo Mode 30-day proof cleanup
      const orders = await DemoOrderRepository.getOrders();
      const oldOrders = orders.filter(
        (o) => new Date(o.createdAt) < cutoffDate && o.paymentMethod === 'transfer'
      );

      let cleanedCount = 0;
      for (const ord of oldOrders) {
        await DemoStorage.deleteProofBlob(ord.id);
        cleanedCount++;
      }

      return NextResponse.json({
        success: true,
        mode: 'demo',
        cleanedCount,
        message: `Se limpiaron los comprobantes demo de hace más de 30 días (${cleanedCount} eliminados).`,
      });
    }

    const supabase = await createClient();

    // 1. Verify Authorization (Admin Session or Vercel Cron Secret)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || process.env.PAYMENT_PROOF_CLEANUP_SECRET;

    let isAuthorized = false;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true;
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) isAuthorized = true;
    }

    if (!isAuthorized && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Acceso no autorizado para ejecutar la limpieza de comprobantes.' },
        { status: 401 }
      );
    }

    // 2. Fetch transfer orders created more than 30 days ago that have a proofPath
    const { data: oldOrders, error: queryError } = await supabase
      .from('orders')
      .select('id, transfer_details, created_at')
      .eq('business_id', CURRENT_BUSINESS_ID)
      .eq('payment_method', 'transfer')
      .lt('created_at', cutoffDate.toISOString());

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    if (!oldOrders || oldOrders.length === 0) {
      return NextResponse.json({
        success: true,
        cleanedCount: 0,
        message: 'No hay comprobantes con más de 30 días de antigüedad para depurar.',
      });
    }

    // Extract paths to delete
    const pathsToDelete: string[] = [];
    const orderIdsToUpdate: string[] = [];

    for (const ord of oldOrders) {
      const proofPath = ord.transfer_details?.proofPath;
      if (proofPath && !ord.transfer_details?.proofPruned) {
        pathsToDelete.push(proofPath);
        orderIdsToUpdate.push(ord.id);
      }
    }

    if (pathsToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        cleanedCount: 0,
        message: 'Todos los comprobantes antiguos de más de 30 días ya fueron depurados.',
      });
    }

    // 3. Remove proof images from Supabase Storage bucket in batches
    const { error: storageError } = await supabase.storage
      .from('payment-proofs')
      .remove(pathsToDelete);

    if (storageError) {
      console.error('Error removing old proofs from storage:', storageError);
      return NextResponse.json({ error: storageError.message }, { status: 500 });
    }

    // 4. Mark transfer_details as pruned in database
    for (const ord of oldOrders) {
      if (orderIdsToUpdate.includes(ord.id)) {
        const updatedDetails = {
          ...(ord.transfer_details || {}),
          proofPath: null,
          proofPruned: true,
          proofPrunedAt: new Date().toISOString(),
        };

        await supabase
          .from('orders')
          .update({
            transfer_details: updatedDetails,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ord.id);
      }
    }

    return NextResponse.json({
      success: true,
      cleanedCount: pathsToDelete.length,
      message: `Se eliminaron exitosamente ${pathsToDelete.length} comprobantes de más de 30 días de antigüedad.`,
    });
  } catch (err: any) {
    console.error('Proof retention cleanup route error:', err);
    return NextResponse.json({ error: err.message || 'Error en depuración de comprobantes.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
