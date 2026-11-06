'use server';

import { createClient } from '@/lib/supabase/server';
import { ProductRepository } from '@/repositories';

export async function processImportAction(data: any[]) {
  try {
    const supabase = await createClient();

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') {
      return { success: false, error: 'Permission denied: Only admin can import' };
    }

    // Use the RPC for atomic transaction
    const payload = data.map(r => ({
      internal_sku: r.internal_sku,
      name: r.product_name,
      specification: r.specification,
      sales_unit: r.sales_unit,
      items_per_box: parseInt(r.items_per_box),
      unit_cost: parseFloat(r.purchase_cost),
      effective_date: r.cost_effective_date
    }));

    const { error: rpcError } = await supabase.rpc('bulk_import_products_and_costs', { payload });

    if (rpcError) throw rpcError;

    // Log audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'BULK_IMPORT',
      table_name: 'products/purchase_cost_history',
      new_data: { rowCount: data.length }
    });

    return { success: true };
  } catch (error: any) {
    console.error('Import error:', error);
    return { success: false, error: error.message || 'Import failed' };
  }
}
