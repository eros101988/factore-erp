import { Decimal } from 'decimal.js';

export interface Product {
  id: string;
  internal_sku: string;
  name: string;
  specification: string;
  sales_unit: string;
  items_per_box: number;
}

export interface CostHistory {
  product_id: string;
  unit_cost: number;
  effective_date: string;
}

export const DEMO_PRODUCTS: Product[] = [
  {
    id: 'prod-001',
    internal_sku: 'DEMO-001',
    name: '[TEST] 測試垃圾袋',
    specification: '91×110',
    sales_unit: '箱',
    items_per_box: 40
  },
  {
    id: 'prod-002',
    internal_sku: 'DEMO-002',
    name: '[TEST] 測試手套',
    specification: 'M號 100雙',
    sales_unit: '箱',
    items_per_box: 10
  },
  {
    id: 'prod-003',
    internal_sku: 'DEMO-003',
    name: '[TEST] 測試耐熱袋',
    specification: '半斤',
    sales_unit: '包',
    items_per_box: 1
  }
];

export const DEMO_COST_HISTORY: CostHistory[] = [
  { product_id: 'prod-001', unit_cost: 1400.0, effective_date: '2026-10-01' },
  { product_id: 'prod-001', unit_cost: 1464.0, effective_date: '2026-11-01' }, // 最新成本
  { product_id: 'prod-002', unit_cost: 850.0, effective_date: '2026-10-15' },
  { product_id: 'prod-003', unit_cost: 45.5, effective_date: '2026-11-05' }
];

export function getEffectiveCost(productId: string, dateStr: string = new Date().toISOString().split('T')[0]): CostHistory | null {
  const histories = DEMO_COST_HISTORY.filter(h => h.product_id === productId && h.effective_date <= dateStr);
  if (histories.length === 0) return null;
  
  // Sort by date descending
  histories.sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  return histories[0];
}

export const DEMO_CHANNELS = [
  { id: 'chan-001', name: '一般現場' },
  { id: 'chan-002', name: 'Shopee Demo (TEST)' }
];

export const DEMO_CHANNEL_FEES: Record<string, { feeRate: number, fixedFee: number }> = {
  'chan-001': { feeRate: 0, fixedFee: 0 },
  'chan-002': { feeRate: 0.085, fixedFee: 0 } // 蝦皮 8.5%
};

export const DEMO_TIERS = [
  { id: 'tier-large', name: '大盤', defaultMargin: 0.15 },
  { id: 'tier-medium', name: '中盤', defaultMargin: 0.20 },
  { id: 'tier-small', name: '小盤', defaultMargin: 0.25 }
];

// Memory store for quotes (Since we don't have DB connected yet)
export interface QuoteItemSnapshot {
  product_id: string;
  internal_sku: string;
  product_name: string;
  specification: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  effective_cost_date: string;
  fixed_cost: number;
  channel_fee_rate: number;
  target_margin: number;
  unit_price: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
}

export interface Quote {
  id: string;
  quote_number: string;
  customer_name: string;
  channel_id: string;
  tier_name: string;
  items: QuoteItemSnapshot[];
  total_untaxed: number;
  total_tax: number;
  total_amount: number;
  created_at: string;
}

export const DEMO_QUOTES: Quote[] = [];

export function saveQuote(quote: Omit<Quote, 'id' | 'quote_number' | 'created_at'>): Quote {
  const newQuote: Quote = {
    ...quote,
    id: `quote-${Date.now()}`,
    quote_number: `Q${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Date.now()).slice(-4)}`,
    created_at: new Date().toISOString()
  };
  DEMO_QUOTES.push(newQuote);
  return newQuote;
}
