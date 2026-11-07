import CostManagement from "@/components/CostManagement";
import { createClient } from "@/lib/supabase/server";
import { CostRowWithSupplier, normalizeCostRow, toDateString } from "@/lib/pricing/costResolver";
import { buildCurrentCostRows, CostHistoryRow } from "@/lib/pricing/costView";
import { DEFAULT_COST_CHANGE_WARNING_THRESHOLD } from "@/lib/pricing/priceList";
import { connection } from "next/server";
import { redirect } from "next/navigation";

export default async function CostsPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('user_profiles').select('role, is_active').eq('id', user.id).single();
  if (profile?.role !== 'admin' || !profile.is_active) {
    return <div className="p-8 text-center text-gray-500">成本管理僅限管理員使用。</div>;
  }

  const [suppliersRes, listsRes, productsRes, historyRes, thresholdRes] = await Promise.all([
    supabase.from('suppliers').select('id, name').order('name'),
    supabase
      .from('supplier_price_lists')
      .select('*, suppliers(name), supplier_price_list_items(count)')
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
    supabase.from('products').select('id, internal_sku, name, sales_unit').eq('is_active', true).order('internal_sku'),
    supabase
      .from('purchase_cost_history')
      .select('id, product_id, supplier_id, external_supplier_sku, unit_cost, cost_unit, pack_qty, pack_cost, effective_date, created_at, source_price_list_id, source_price_list_item_id, suppliers(name), products(internal_sku, name), supplier_price_lists(source_filename)')
      .not('source_price_list_id', 'is', null),
    supabase.from('system_settings').select('setting_value').eq('setting_key', 'cost_change_warning_threshold').maybeSingle(),
  ]);

  const threshold = thresholdRes.data?.setting_value != null
    ? String(thresholdRes.data.setting_value)
    : DEFAULT_COST_CHANGE_WARNING_THRESHOLD;

  type HistoryJoinRow = CostRowWithSupplier & {
    products?: { internal_sku: string; name: string } | null;
    supplier_price_lists?: { source_filename: string | null } | null;
  };
  const history: CostHistoryRow[] = ((historyRes.data ?? []) as unknown as HistoryJoinRow[]).map(row => {
    const { products, supplier_price_lists, ...rest } = row;
    return {
      ...normalizeCostRow(rest),
      product_internal_sku: products?.internal_sku ?? '',
      product_name: products?.name ?? '',
      source_filename: supplier_price_lists?.source_filename ?? null,
    };
  });

  return (
    <div className="p-4 h-full flex flex-col">
      <CostManagement
        suppliers={suppliersRes.data ?? []}
        priceLists={listsRes.data ?? []}
        products={productsRes.data ?? []}
        currentCosts={buildCurrentCostRows(history, toDateString(new Date()), threshold)}
        threshold={threshold}
        loadError={[suppliersRes, listsRes, productsRes, historyRes].find(r => r.error)?.error?.message ?? null}
      />
    </div>
  );
}
