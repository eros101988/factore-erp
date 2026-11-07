import { CostRecord, pickEffectiveCost, toDateString } from './costResolver';
import { computeCostChange, CostChange } from './priceList';

export interface CostHistoryRow extends CostRecord {
  product_internal_sku: string;
  product_name: string;
  source_filename: string | null;
}

export interface CurrentCostRow {
  product_id: string;
  internal_sku: string;
  product_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_sku: string | null;
  effective_from: string;
  effective_to: string | null; // derived: day before the next (future) record, if any
  current_cost: string;        // per quote unit (pack cost if available)
  previous_cost: string | null;
  previous_effective_from: string | null;
  change: CostChange;
  source_price_list_id: string;
  source_filename: string | null;
  next_effective_from: string | null;
}

const quoteCost = (r: CostRecord) => String(r.pack_cost ?? r.unit_cost);

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** One row per product: cost in force today vs the previous published cost. */
export function buildCurrentCostRows(history: CostHistoryRow[], today: Date | string, threshold?: string): CurrentCostRow[] {
  const day = toDateString(today);
  const byProduct = new Map<string, CostHistoryRow[]>();
  for (const h of history) {
    if (!h.source_price_list_id) continue;
    const list = byProduct.get(h.product_id) ?? [];
    list.push(h);
    byProduct.set(h.product_id, list);
  }

  const rows: CurrentCostRow[] = [];
  for (const [productId, records] of byProduct) {
    const current = pickEffectiveCost(records, day);
    if (!current.ok) continue;
    const cur = records.find(r => r.id === current.cost_record_id)!;
    const older = records
      .filter(r => r.effective_date < cur.effective_date)
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
    const next = records
      .filter(r => r.effective_date > cur.effective_date)
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0];
    rows.push({
      product_id: productId,
      internal_sku: cur.product_internal_sku,
      product_name: cur.product_name,
      supplier_id: cur.supplier_id,
      supplier_name: cur.supplier_name ?? null,
      supplier_sku: cur.external_supplier_sku,
      effective_from: cur.effective_date,
      effective_to: next ? dayBefore(next.effective_date) : null,
      current_cost: quoteCost(cur),
      previous_cost: older ? quoteCost(older) : null,
      previous_effective_from: older?.effective_date ?? null,
      change: computeCostChange(older ? quoteCost(older) : null, quoteCost(cur), threshold),
      source_price_list_id: cur.source_price_list_id!,
      source_filename: cur.source_filename,
      next_effective_from: next?.effective_date ?? null,
    });
  }
  return rows.sort((a, b) => a.internal_sku.localeCompare(b.internal_sku));
}
