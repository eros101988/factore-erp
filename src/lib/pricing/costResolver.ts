import { createClient } from '@/lib/supabase/server';

export const COST_NOT_FOUND = 'COST_NOT_FOUND' as const;

export interface CostRecord {
  id: string;
  product_id: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  external_supplier_sku: string | null;
  unit_cost: string | number;
  cost_unit: string | null;
  pack_qty: number | null;
  pack_cost: string | number | null;
  effective_date: string; // effective_from (YYYY-MM-DD)
  created_at?: string;
  source_price_list_id: string | null;
  source_price_list_item_id?: string | null;
}

export interface EffectiveCost {
  ok: true;
  cost_record_id: string;
  product_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_sku: string | null;
  effective_from: string;
  unit_cost: string;
  cost_unit: string | null;
  pack_qty: number | null;
  pack_cost: string | null;
  // Cost per quote (sales) unit: the pack cost when the supplier sells by pack, else the unit cost
  quote_unit_cost: string;
  source_price_list_id: string;
  source_price_list_item_id: string | null;
}

export type EffectiveCostResult = EffectiveCost | { ok: false; code: typeof COST_NOT_FOUND };

export function toDateString(date: Date | string): string {
  if (typeof date === 'string') return date.slice(0, 10);
  // Business calendar date in Taiwan, independent of the server's timezone (Vercel runs UTC)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Pure resolution rule:
 * - only published supplier price list costs (source_price_list_id set) count;
 *   historical purchase imports never drive quotes
 * - effective_from <= quoteDate (future costs ignored)
 * - newest effective_from wins; ties go to the most recently created record
 */
export function pickEffectiveCost(records: CostRecord[], quoteDate: Date | string): EffectiveCostResult {
  const day = toDateString(quoteDate);
  const candidates = records
    .filter(r => r.source_price_list_id && r.effective_date <= day)
    .sort((a, b) =>
      b.effective_date.localeCompare(a.effective_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const r = candidates[0];
  if (!r) return { ok: false, code: COST_NOT_FOUND };

  const unitCost = String(r.unit_cost);
  const packCost = r.pack_cost === null || r.pack_cost === undefined ? null : String(r.pack_cost);
  return {
    ok: true,
    cost_record_id: r.id,
    product_id: r.product_id,
    supplier_id: r.supplier_id,
    supplier_name: r.supplier_name ?? null,
    supplier_sku: r.external_supplier_sku,
    effective_from: r.effective_date,
    unit_cost: unitCost,
    cost_unit: r.cost_unit,
    pack_qty: r.pack_qty,
    pack_cost: packCost,
    quote_unit_cost: packCost ?? unitCost,
    source_price_list_id: r.source_price_list_id!,
    source_price_list_item_id: r.source_price_list_item_id ?? null,
  };
}

const COST_COLUMNS =
  'id, product_id, supplier_id, external_supplier_sku, unit_cost, cost_unit, pack_qty, pack_cost, effective_date, created_at, source_price_list_id, source_price_list_item_id, suppliers(name)';

export type CostRowWithSupplier = Omit<CostRecord, 'supplier_name'> & { suppliers?: unknown };

export function normalizeCostRow(row: CostRowWithSupplier): CostRecord {
  const { suppliers, ...rest } = row;
  const supplier = (Array.isArray(suppliers) ? suppliers[0] : suppliers) as { name?: string } | null | undefined;
  return { ...rest, supplier_name: supplier?.name ?? null };
}

/**
 * Official cost source for the pricing engine.
 * Returns COST_NOT_FOUND instead of falling back to 0, demo data, or future costs.
 */
export async function getEffectiveProductCost(productId: string, quoteDate: Date | string): Promise<EffectiveCostResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('purchase_cost_history')
    .select(COST_COLUMNS)
    .eq('product_id', productId)
    .not('source_price_list_id', 'is', null)
    .lte('effective_date', toDateString(quoteDate))
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return pickEffectiveCost((data ?? []).map(normalizeCostRow), quoteDate);
}

export interface PricingPolicyRow {
  id: string;
  tier: 'small' | 'medium' | 'large' | string;
  default_margin: string | number;
  minimum_margin: string | number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

/** Pure: the policy per tier in force on the given date. */
export function pickActivePolicies(rows: PricingPolicyRow[], onDate: Date | string): PricingPolicyRow[] {
  const day = toDateString(onDate);
  const byTier = new Map<string, PricingPolicyRow>();
  for (const r of rows) {
    if (!r.is_active || r.effective_from > day || (r.effective_to && r.effective_to < day)) continue;
    const cur = byTier.get(r.tier);
    if (!cur || r.effective_from > cur.effective_from) byTier.set(r.tier, r);
  }
  return [...byTier.values()];
}

export async function getPricingPolicies(onDate: Date | string = new Date()): Promise<PricingPolicyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('pricing_policies').select('*').eq('is_active', true);
  if (error) throw error;
  return pickActivePolicies(data ?? [], onDate);
}
