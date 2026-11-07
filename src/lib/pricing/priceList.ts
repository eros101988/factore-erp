import Decimal from 'decimal.js';

export type PriceListStatus = 'draft' | 'parsed' | 'needs_review' | 'ready' | 'published' | 'rejected';
export type MappingStatus = 'suggested' | 'confirmed' | 'rejected' | 'unmapped';
export type RowStatus = 'valid' | 'error' | 'ignored';

export const DEFAULT_COST_CHANGE_WARNING_THRESHOLD = '0.30';

export interface PriceListItemLike {
  id?: string;
  supplier_sku: string;
  unit_cost: string | number | null;
  pack_qty: number | null;
  calculated_pack_cost?: string | number | null;
  mapping_status: MappingStatus | string;
  mapped_product_id: string | null;
  row_status: RowStatus | string;
}

export interface CostChange {
  oldCost: string | null;
  newCost: string;
  diff: string | null;
  pct: string | null; // percent, e.g. "3.83"
  isWarning: boolean;
}

/** threshold is a ratio (0.30 = 30%), read from system_settings */
export function computeCostChange(
  oldCost: Decimal.Value | null | undefined,
  newCost: Decimal.Value,
  threshold: Decimal.Value = DEFAULT_COST_CHANGE_WARNING_THRESHOLD,
): CostChange {
  const n = new Decimal(newCost);
  if (oldCost === null || oldCost === undefined || oldCost === '') {
    return { oldCost: null, newCost: n.toString(), diff: null, pct: null, isWarning: false };
  }
  const o = new Decimal(oldCost);
  const diff = n.minus(o);
  if (o.isZero()) {
    return { oldCost: o.toString(), newCost: n.toString(), diff: diff.toString(), pct: null, isWarning: true };
  }
  const ratio = diff.div(o);
  return {
    oldCost: o.toString(),
    newCost: n.toString(),
    diff: diff.toString(),
    pct: ratio.times(100).toFixed(2),
    isWarning: ratio.abs().gte(new Decimal(threshold)),
  };
}

export interface PublishCheck {
  ok: boolean;
  publishable: number;
  unmapped: string[];
  invalidCost: string[];
  errorRows: string[];
}

function isValidCost(v: string | number | null): boolean {
  if (v === null || v === undefined || v === '') return false;
  try {
    return new Decimal(v).gt(0);
  } catch {
    return false;
  }
}

/**
 * Mirrors the checks in the publish_supplier_price_list RPC (the DB is the final authority).
 * Every row must be either explicitly ignored or (valid + confirmed mapping + positive cost).
 */
export function checkPublishable(items: PriceListItemLike[]): PublishCheck {
  const res: PublishCheck = { ok: false, publishable: 0, unmapped: [], invalidCost: [], errorRows: [] };
  for (const it of items) {
    if (it.row_status === 'ignored') continue;
    let bad = false;
    if (it.row_status === 'error') { res.errorRows.push(it.supplier_sku); bad = true; }
    if (!isValidCost(it.unit_cost) || !it.pack_qty || it.pack_qty <= 0) { res.invalidCost.push(it.supplier_sku); bad = true; }
    if (it.mapping_status !== 'confirmed' || !it.mapped_product_id) { res.unmapped.push(it.supplier_sku); bad = true; }
    if (!bad) res.publishable++;
  }
  res.ok = res.publishable > 0 && !res.unmapped.length && !res.invalidCost.length && !res.errorRows.length;
  return res;
}

export function deriveListStatus(items: PriceListItemLike[]): PriceListStatus {
  return checkPublishable(items).ok ? 'ready' : 'needs_review';
}

export function describePublishBlockers(check: PublishCheck): string {
  const parts: string[] = [];
  if (check.unmapped.length) parts.push(`${check.unmapped.length} 筆未確認對應 (${check.unmapped.slice(0, 5).join(', ')})`);
  if (check.invalidCost.length) parts.push(`${check.invalidCost.length} 筆成本無效 (${check.invalidCost.slice(0, 5).join(', ')})`);
  if (check.errorRows.length) parts.push(`${check.errorRows.length} 筆解析錯誤 (${check.errorRows.slice(0, 5).join(', ')})`);
  if (!parts.length && check.publishable === 0) parts.push('沒有可發布的項目');
  return `無法發布：${parts.join('；')}。請修正或明確標記忽略後再發布。`;
}

export interface SupplierSkuMapping {
  external_code: string;
  product_id: string | null;
  status: 'suggested' | 'confirmed' | 'rejected' | string;
}

/**
 * Applies remembered Supplier SKU -> Product mappings (same supplier only).
 * Confirmed stays confirmed, suggested needs admin confirmation, rejected/unknown are unmapped.
 */
export function applySupplierMapping(supplierSku: string, mappings: SupplierSkuMapping[]): { mapping_status: MappingStatus; mapped_product_id: string | null } {
  const m = mappings.find(x => x.external_code === supplierSku);
  if (!m || !m.product_id || m.status === 'rejected') return { mapping_status: 'unmapped', mapped_product_id: null };
  return { mapping_status: m.status === 'confirmed' ? 'confirmed' : 'suggested', mapped_product_id: m.product_id };
}

export function effectiveFromFor(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
