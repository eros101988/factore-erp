'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function uploadImportBatchAction(
  sourceSystem: string,
  importType: string,
  originalFilename: string,
  stagingRows: any[] // array of { row_number, raw_data, normalized_data, validation_status, error_message }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Unauthorized' };

  try {
    const validCount = stagingRows.filter(r => r.validation_status === 'valid').length;
    const errorCount = stagingRows.filter(r => r.validation_status === 'error').length;
    const warningCount = stagingRows.filter(r => r.validation_status === 'warning').length;
    const status = errorCount > 0 ? 'failed' : 'ready';

    const { data: batch, error } = await supabase
      .from('import_batches')
      .insert({
        source_system: sourceSystem,
        import_type: importType,
        original_filename: originalFilename,
        row_count: stagingRows.length,
        valid_count: validCount,
        error_count: errorCount,
        warning_count: warningCount,
        status: status,
        created_by: user.id
      })
      .select()
      .single();

    if (error) throw error;

    // Insert staging rows
    const rowsToInsert = stagingRows.map(r => ({
      import_batch_id: batch.id,
      row_number: r.row_number,
      raw_data: r.raw_data,
      normalized_data: r.normalized_data,
      validation_status: r.validation_status,
      error_message: r.error_message
    }));

    // Chunk insertion if large
    const chunkSize = 500;
    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);
      const { error: stagingError } = await supabase.from('import_staging_rows').insert(chunk);
      if (stagingError) throw stagingError;
    }

    // Log audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'UPLOAD_IMPORT_BATCH',
      table_name: 'import_batches',
      record_id: batch.id,
      new_data: { type: importType, count: stagingRows.length, valid: validCount, error: errorCount }
    });

    return { success: true, batchId: batch.id, status };
  } catch (error: any) {
    console.error('Error creating import batch:', error);
    return { success: false, error: error.message };
  }
}

export async function confirmImportBatchAction(batchId: string, importType: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  try {
    // 1. Fetch valid staging rows for this batch
    const { data: stagingRows, error: stagingError } = await supabase
      .from('import_staging_rows')
      .select('normalized_data')
      .eq('import_batch_id', batchId)
      .eq('validation_status', 'valid');

    if (stagingError) throw stagingError;
    if (!stagingRows || stagingRows.length === 0) {
       return { success: false, error: 'No valid rows found to confirm' };
    }

    const mappedData = stagingRows.map(r => r.normalized_data);

    // 2. Get the RPC name based on importType
    let rpcName = '';
    switch (importType) {
      case 'products': rpcName = 'bulk_import_products_v2'; break;
      case 'customers': rpcName = 'bulk_import_customers'; break;
      case 'suppliers': rpcName = 'bulk_import_suppliers'; break;
      case 'sales': rpcName = 'bulk_import_historical_sales'; break;
      case 'purchases': rpcName = 'bulk_import_historical_purchases'; break;
      default: return { success: false, error: 'Unsupported import type' };
    }

    // 3. Execute RPC transaction
    const { data, error } = await supabase.rpc(rpcName, { 
      batch_id: batchId,
      payload: mappedData
    });

    if (error) throw error;

    // 4. Update batch status
    await supabase.from('import_batches').update({
      status: 'committed',
      confirmed_at: new Date().toISOString()
    }).eq('id', batchId);

    // 5. Log audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'CONFIRM_IMPORT_BATCH',
      table_name: 'import_batches',
      record_id: batchId,
      new_data: { type: importType, count: mappedData.length }
    });

    revalidatePath('/history');
    revalidatePath('/');
    
    return { success: true };
  } catch (error: any) {
    console.error('Error confirming import batch:', error);
    // Mark as failed
    await supabase.from('import_batches').update({
      status: 'failed'
    }).eq('id', batchId);
    
    return { success: false, error: error.message };
  }
}
