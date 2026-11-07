'use server';

import { createClient } from '@/lib/supabase/server';
import { parseSupplierPdf, calculatePackCost } from '@/lib/pricing/pdfParser';
import { getEffectiveProductCost, EffectiveCostResult } from '@/lib/pricing/costResolver';
import { applySupplierMapping, checkPublishable, deriveListStatus, describePublishBlockers, effectiveFromFor } from '@/lib/pricing/priceList';
import { revalidatePath } from 'next/cache';
import Decimal from 'decimal.js';

const PDF_BUCKET = 'supplier-price-lists';
const MAX_PDF_BYTES = 20 * 1024 * 1024;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: 'Unauthorized' };
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return { supabase, user: null, error: '僅限管理員操作' };
  }
  return { supabase, user, error: null };
}

function errorMessage(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

async function refreshListStatus(supabase: Awaited<ReturnType<typeof createClient>>, priceListId: string) {
  const { data: list } = await supabase.from('supplier_price_lists').select('status').eq('id', priceListId).single();
  if (!list || list.status === 'published' || list.status === 'rejected') return;
  const { data: items } = await supabase.from('supplier_price_list_items').select('*').eq('price_list_id', priceListId);
  const status = items && items.length ? deriveListStatus(items) : 'needs_review';
  await supabase.from('supplier_price_lists').update({ status }).eq('id', priceListId);
}

export async function uploadSupplierPdfAction(formData: FormData) {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false, error: authError };

  const file = formData.get('file') as File | null;
  const supplierId = formData.get('supplierId') as string;
  const year = parseInt(formData.get('year') as string, 10);
  const month = parseInt(formData.get('month') as string, 10);

  if (!file || !supplierId || !year || !month) return { success: false, error: '請填寫供應商、年份、月份並選擇 PDF' };
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return { success: false, error: '年份或月份無效' };
  if (file.size > MAX_PDF_BYTES) return { success: false, error: 'PDF 檔案過大 (上限 20MB)' };

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString() !== '%PDF-') return { success: false, error: '檔案不是有效的 PDF' };

  try {
    // 1. Price list record (one per supplier/month; older months are never overwritten)
    const { data: priceList, error: listError } = await supabase
      .from('supplier_price_lists')
      .insert({
        supplier_id: supplierId,
        year,
        month,
        effective_from: effectiveFromFor(year, month),
        source_type: 'pdf',
        source_filename: file.name,
        status: 'draft',
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (listError) {
      if (listError.code === '23505') {
        return { success: false, error: '此供應商該月份已有價格表。如需重新上傳，請先將舊的草稿標記為 Rejected 並刪除。' };
      }
      throw listError;
    }

    // 2. Keep the source file
    const storagePath = `${supplierId}/${year}-${String(month).padStart(2, '0')}/${priceList.id}.pdf`;
    const { error: storageError } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
    if (!storageError) {
      await supabase.from('supplier_price_lists').update({ storage_path: storagePath, source_file_url: storagePath }).eq('id', priceList.id);
    }

    // 3. Parse -> staging (never touches purchase_cost_history)
    const parseResult = await parseSupplierPdf(buffer);
    if (parseResult.status === 'MANUAL_REVIEW_REQUIRED') {
      await supabase
        .from('supplier_price_lists')
        .update({ status: 'needs_review', notes: `MANUAL_REVIEW_REQUIRED: ${parseResult.error}` })
        .eq('id', priceList.id);
      revalidatePath('/costs');
      return { success: true, priceListId: priceList.id, status: 'needs_review', message: `MANUAL_REVIEW_REQUIRED: ${parseResult.error}` };
    }

    // 4. Auto-map using confirmed Supplier SKU mappings only
    const { data: mappings } = await supabase
      .from('product_external_mappings')
      .select('product_id, external_code, status')
      .eq('source_type', 'supplier_price_list')
      .eq('supplier_id', supplierId)
      .in('status', ['confirmed', 'suggested', 'rejected']);
    const rows = parseResult.items.map(item => {
      return {
        price_list_id: priceList.id,
        supplier_sku: item.supplier_sku,
        supplier_product_name: item.description ?? null,
        specification: item.specification ?? null,
        pack_qty: item.pack_qty ?? null,
        purchase_unit: item.purchase_unit ?? null,
        unit_cost: item.unit_cost,
        calculated_pack_cost: item.calculated_pack_cost,
        raw_data: { raw_text: item.raw_text },
        row_status: item.row_status,
        error_message: item.error_message ?? null,
        ...applySupplierMapping(item.supplier_sku, mappings ?? []),
      };
    });

    const { error: itemsError } = await supabase.from('supplier_price_list_items').insert(rows);
    if (itemsError) throw itemsError;

    await supabase.from('supplier_price_lists').update({ status: 'parsed' }).eq('id', priceList.id);
    await refreshListStatus(supabase, priceList.id);

    revalidatePath('/costs');
    return { success: true, priceListId: priceList.id, status: 'parsed', itemCount: rows.length };
  } catch (error) {
    console.error('Error uploading PDF:', error);
    return { success: false, error: errorMessage(error) };
  }
}

async function assertEditable(supabase: Awaited<ReturnType<typeof createClient>>, itemId: string) {
  const { data: item } = await supabase
    .from('supplier_price_list_items')
    .select('id, price_list_id, supplier_price_lists(status)')
    .eq('id', itemId)
    .single();
  const status = (item?.supplier_price_lists as unknown as { status: string } | null)?.status;
  if (!item) throw new Error('找不到價格表項目');
  if (status === 'published' || status === 'rejected') throw new Error('已發布或已退回的價格表不可修改');
  return item.price_list_id as string;
}

/** Confirm (productId set), mark as suggestion, or reject a Supplier SKU -> Product mapping. */
export async function setItemMappingAction(itemId: string, productId: string | null, status: 'confirmed' | 'suggested' | 'rejected') {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false, error: authError };
  try {
    const priceListId = await assertEditable(supabase, itemId);
    if (status !== 'rejected' && !productId) throw new Error('請選擇內部商品');
    const { error } = await supabase.from('supplier_price_list_items').update({
      mapped_product_id: status === 'rejected' ? null : productId,
      mapping_status: status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', itemId);
    if (error) throw error;
    await refreshListStatus(supabase, priceListId);
    revalidatePath('/costs');
    return { success: true };
  } catch (e) {
    return { success: false, error: errorMessage(e) };
  }
}

/** Fix a parsed row's cost/pack qty by hand; the pack cost is recalculated with Decimal. */
export async function fixItemCostAction(itemId: string, unitCost: string, packQty: number) {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false, error: authError };
  try {
    const priceListId = await assertEditable(supabase, itemId);
    let cost: Decimal;
    try { cost = new Decimal(unitCost); } catch { throw new Error('成本格式錯誤'); }
    if (cost.lte(0)) throw new Error('成本必須大於 0');
    if (!Number.isInteger(packQty) || packQty <= 0) throw new Error('包裝數量必須為正整數');
    const { error } = await supabase.from('supplier_price_list_items').update({
      unit_cost: cost.toString(),
      pack_qty: packQty,
      calculated_pack_cost: calculatePackCost(cost, packQty),
      row_status: 'valid',
      error_message: null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', itemId);
    if (error) throw error;
    await refreshListStatus(supabase, priceListId);
    revalidatePath('/costs');
    return { success: true };
  } catch (e) {
    return { success: false, error: errorMessage(e) };
  }
}

/** Explicitly exclude (or re-include) a row from publishing. */
export async function setItemIgnoredAction(itemId: string, ignored: boolean) {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false, error: authError };
  try {
    const priceListId = await assertEditable(supabase, itemId);
    const { data: item } = await supabase.from('supplier_price_list_items').select('*').eq('id', itemId).single();
    let rowStatus: 'ignored' | 'valid' | 'error' = 'ignored';
    if (!ignored) {
      const c = item?.unit_cost === null ? null : new Decimal(item.unit_cost);
      rowStatus = c && c.gt(0) && item.pack_qty > 0 ? 'valid' : 'error';
    }
    const { error } = await supabase.from('supplier_price_list_items').update({
      row_status: rowStatus,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', itemId);
    if (error) throw error;
    await refreshListStatus(supabase, priceListId);
    revalidatePath('/costs');
    return { success: true };
  } catch (e) {
    return { success: false, error: errorMessage(e) };
  }
}

export async function rejectPriceListAction(priceListId: string, notes: string) {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false, error: authError };
  const { error } = await supabase
    .from('supplier_price_lists')
    .update({ status: 'rejected', notes: notes || 'Rejected by admin' })
    .eq('id', priceListId)
    .neq('status', 'published');
  if (error) return { success: false, error: error.message };
  revalidatePath('/costs');
  return { success: true };
}

/** Deletes an unpublished draft (e.g. to re-upload the same month). Published lists are permanent. */
export async function deleteDraftPriceListAction(priceListId: string) {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false, error: authError };
  const { data: list } = await supabase.from('supplier_price_lists').select('status, storage_path').eq('id', priceListId).single();
  if (!list) return { success: false, error: '找不到價格表' };
  if (list.status === 'published') return { success: false, error: '已發布的價格表不可刪除' };
  if (list.storage_path) await supabase.storage.from(PDF_BUCKET).remove([list.storage_path]);
  const { error } = await supabase.from('supplier_price_lists').delete().eq('id', priceListId);
  if (error) return { success: false, error: error.message };
  revalidatePath('/costs');
  return { success: true };
}

export async function publishPriceListAction(priceListId: string) {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false, error: authError };

  try {
    const { data: items, error: itemsErr } = await supabase
      .from('supplier_price_list_items')
      .select('*')
      .eq('price_list_id', priceListId);
    if (itemsErr) throw itemsErr;

    // Friendly pre-check; the RPC re-validates inside the transaction
    const check = checkPublishable(items ?? []);
    if (!check.ok) return { success: false, error: describePublishBlockers(check) };

    const { data, error } = await supabase.rpc('publish_supplier_price_list', { p_price_list_id: priceListId });
    if (error) throw error;

    revalidatePath('/costs');
    revalidatePath('/');
    return { success: true, rowsPublished: data as number };
  } catch (error) {
    console.error('Error publishing price list:', error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getPriceListFileUrlAction(priceListId: string) {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false, error: authError };
  const { data: list } = await supabase.from('supplier_price_lists').select('storage_path').eq('id', priceListId).single();
  if (!list?.storage_path) return { success: false, error: '此價格表沒有保存原始 PDF' };
  const { data, error } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(list.storage_path, 300);
  if (error) return { success: false, error: error.message };
  return { success: true, url: data.signedUrl };
}

/**
 * Staging rows of a price list plus the previous published cost of each mapped product
 * (cost in force the day before this list takes effect) for the change preview.
 */
export async function getPriceListReviewAction(priceListId: string) {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false as const, error: authError };

  const { data: list, error: listErr } = await supabase
    .from('supplier_price_lists')
    .select('*, suppliers(name)')
    .eq('id', priceListId)
    .single();
  if (listErr || !list) return { success: false as const, error: listErr?.message ?? '找不到價格表' };

  const { data: items, error: itemsErr } = await supabase
    .from('supplier_price_list_items')
    .select('*')
    .eq('price_list_id', priceListId)
    .order('supplier_sku');
  if (itemsErr) return { success: false as const, error: itemsErr.message };

  const productIds = [...new Set((items ?? []).map(i => i.mapped_product_id).filter(Boolean))];
  const previous = new Map<string, { cost: string; effective_from: string }>();
  if (productIds.length) {
    const { data: history } = await supabase
      .from('purchase_cost_history')
      .select('product_id, unit_cost, pack_cost, effective_date, created_at')
      .in('product_id', productIds)
      .not('source_price_list_id', 'is', null)
      .lt('effective_date', list.effective_from)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false });
    for (const h of history ?? []) {
      if (!previous.has(h.product_id)) {
        previous.set(h.product_id, { cost: String(h.pack_cost ?? h.unit_cost), effective_from: h.effective_date });
      }
    }
  }

  return {
    success: true as const,
    list,
    items: (items ?? []).map(i => ({
      ...i,
      old_cost: i.mapped_product_id ? previous.get(i.mapped_product_id)?.cost ?? null : null,
      old_effective_from: i.mapped_product_id ? previous.get(i.mapped_product_id)?.effective_from ?? null : null,
    })),
  };
}

export async function getEffectiveCostAction(productId: string): Promise<EffectiveCostResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return getEffectiveProductCost(productId, new Date());
}

export async function updatePricingPolicyAction(
  policies: { tier: string; default_margin: string; minimum_margin: string | null }[],
  costChangeThreshold?: string,
) {
  const { supabase, user, error: authError } = await requireAdmin();
  if (!user) return { success: false, error: authError };

  try {
    const { data: current } = await supabase.from('pricing_policies').select('*').eq('is_active', true);
    for (const p of policies) {
      const dm = new Decimal(p.default_margin);
      const mm = p.minimum_margin === null || p.minimum_margin === '' ? null : new Decimal(p.minimum_margin);
      if (dm.lt(0) || dm.gte(1)) throw new Error(`${p.tier}: 預設毛利率需介於 0% 與 100% 之間`);
      if (mm && (mm.lt(0) || mm.gt(dm))) throw new Error(`${p.tier}: 最低毛利率需介於 0 與預設毛利率之間`);
      const cur = current?.find(c => c.tier === p.tier && !c.effective_to);
      const unchanged = cur && new Decimal(cur.default_margin).eq(dm) &&
        ((cur.minimum_margin === null && mm === null) || (cur.minimum_margin !== null && mm !== null && new Decimal(cur.minimum_margin).eq(mm)));
      if (unchanged) continue;
      const { error } = await supabase.rpc('set_pricing_policy', {
        p_tier: p.tier,
        p_default_margin: dm.toString(),
        p_minimum_margin: mm ? mm.toString() : null,
      });
      if (error) throw error;
    }

    if (costChangeThreshold !== undefined) {
      const t = new Decimal(costChangeThreshold);
      if (t.lte(0) || t.gt(10)) throw new Error('漲跌警告門檻需大於 0');
      const { error } = await supabase
        .from('system_settings')
        .upsert({ setting_key: 'cost_change_warning_threshold', setting_value: t.toNumber(), updated_at: new Date().toISOString() }, { onConflict: 'setting_key' });
      if (error) throw error;
    }

    revalidatePath('/settings/pricing-policy');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error updating pricing policies:', error);
    return { success: false, error: errorMessage(error) };
  }
}
