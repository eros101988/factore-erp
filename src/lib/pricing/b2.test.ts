// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseSupplierPdf, parsePriceListText, calculatePackCost } from './pdfParser';
import { pickEffectiveCost, pickActivePolicies, CostRecord, EffectiveCost, COST_NOT_FOUND } from './costResolver';
import { applySupplierMapping, checkPublishable, computeCostChange, deriveListStatus, PriceListItemLike } from './priceList';
import { buildCurrentCostRows } from './costView';
import { calculatePrice } from './engine';
import { buildQuoteItemSnapshot, computeQuote } from './quote';
import type { Quote } from '@/lib/data/demo';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/repositories', () => ({
  ProductRepository: { getProducts: vi.fn(), getEffectiveCost: vi.fn() },
  ConfigRepository: { getChannelFee: vi.fn(), getPricingPolicies: vi.fn() },
  QuoteRepository: { saveQuote: vi.fn() },
}));

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '../../../tests/fixtures', name));

const costRecord = (over: Partial<CostRecord>): CostRecord => ({
  id: 'c1',
  product_id: 'p1',
  supplier_id: 's1',
  supplier_name: '臺灣營德',
  external_supplier_sku: 'KA-T91N',
  unit_cost: '36.6',
  cost_unit: 'ROLL',
  pack_qty: 40,
  pack_cost: '1464',
  effective_date: '2026-11-01',
  created_at: '2026-11-01T00:00:00Z',
  source_price_list_id: 'pl-nov',
  source_price_list_item_id: 'it-nov',
  ...over,
});

const NOV = costRecord({});
const DEC = costRecord({ id: 'c2', unit_cost: '38', pack_cost: '1520', effective_date: '2026-12-01', source_price_list_id: 'pl-dec', source_price_list_item_id: 'it-dec' });

const item = (over: Partial<PriceListItemLike>): PriceListItemLike => ({
  supplier_sku: 'KA-T91N', unit_cost: '36.6', pack_qty: 40, calculated_pack_cost: '1464',
  mapping_status: 'confirmed', mapped_product_id: 'p1', row_status: 'valid', ...over,
});

describe('B2 PDF parsing', () => {
  it('PDF parse text: extracts KA-T91N / 40 / 36.6 from the text-based fixture PDF', async () => {
    const result = await parseSupplierPdf(fixture('supplier_price_list_2026_11.pdf'));
    expect(result.status).toBe('PARSED');
    expect(result.items).toHaveLength(2);
    const t91 = result.items.find(i => i.supplier_sku === 'KA-T91N')!;
    expect(t91).toMatchObject({ pack_qty: 40, purchase_unit: 'ROLL', unit_cost: '36.6', calculated_pack_cost: '1464', row_status: 'valid' });
    expect(t91.description).toBe('TAPE');
    expect(t91.specification).toBe('910x1100');
  });

  it('PDF parse text: next month fixture KA-T91N 38 -> pack cost 1520, unreadable cost becomes an error row', async () => {
    const result = await parseSupplierPdf(fixture('supplier_price_list_2026_12.pdf'));
    const t91 = result.items.find(i => i.supplier_sku === 'KA-T91N')!;
    expect(t91.unit_cost).toBe('38');
    expect(t91.calculated_pack_cost).toBe('1520');
    const bad = result.items.find(i => i.supplier_sku === 'KA-X99')!;
    expect(bad.row_status).toBe('error');
    expect(bad.unit_cost).toBeNull();
  });

  it('PDF parse text: image-only PDF is flagged MANUAL_REVIEW_REQUIRED', async () => {
    const result = await parseSupplierPdf(fixture('supplier_price_list_scanned.pdf'));
    expect(result.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(result.items).toHaveLength(0);
  });

  it('PDF parse text: supports pack tokens like 40捲/箱 and flags non-positive cost', () => {
    const r = parsePriceListText('臺灣營德 價格表 2026/11 ......\nKA-T91N 透明膠帶 910x1100 40捲/箱 36.6\nCC-M01 測試 10包 -5');
    expect(r.items[0]).toMatchObject({ supplier_sku: 'KA-T91N', pack_qty: 40, purchase_unit: '捲', calculated_pack_cost: '1464' });
    expect(r.items[1]).toMatchObject({ supplier_sku: 'CC-M01', row_status: 'error' });
  });

  it('Pack cost Decimal calculation: exact decimal math', () => {
    expect(calculatePackCost('36.6', 40)).toBe('1464');
    expect(calculatePackCost('38', 40)).toBe('1520');
    expect(calculatePackCost(0.1, 3)).toBe('0.3'); // not 0.30000000000000004
    expect(calculatePackCost('1.15', 3)).toBe('3.45');
  });
});

describe('B2 supplier mapping & publish rules', () => {
  const mappings = [
    { external_code: 'KA-T91N', product_id: 'p1', status: 'confirmed' },
    { external_code: 'KA-B20', product_id: 'p2', status: 'suggested' },
    { external_code: 'KA-OLD', product_id: 'p3', status: 'rejected' },
  ];

  it('Supplier mapping: confirmed / suggested / rejected / unknown SKU', () => {
    expect(applySupplierMapping('KA-T91N', mappings)).toEqual({ mapping_status: 'confirmed', mapped_product_id: 'p1' });
    expect(applySupplierMapping('KA-B20', mappings)).toEqual({ mapping_status: 'suggested', mapped_product_id: 'p2' });
    expect(applySupplierMapping('KA-OLD', mappings)).toEqual({ mapping_status: 'unmapped', mapped_product_id: null });
    expect(applySupplierMapping('NEW-SKU', mappings)).toEqual({ mapping_status: 'unmapped', mapped_product_id: null });
  });

  it('Unmapped item blocks publish (suggested is not enough)', () => {
    expect(checkPublishable([item({}), item({ supplier_sku: 'KA-B20', mapping_status: 'suggested' })]).ok).toBe(false);
    const check = checkPublishable([item({}), item({ supplier_sku: 'NEW', mapping_status: 'unmapped', mapped_product_id: null })]);
    expect(check.ok).toBe(false);
    expect(check.unmapped).toEqual(['NEW']);
    expect(deriveListStatus([item({ mapping_status: 'unmapped', mapped_product_id: null })])).toBe('needs_review');
  });

  it('Invalid cost blocks publish; explicitly ignored rows do not', () => {
    const bad = item({ supplier_sku: 'KA-X99', unit_cost: null, row_status: 'error' });
    const check = checkPublishable([item({}), bad]);
    expect(check.ok).toBe(false);
    expect(check.invalidCost).toEqual(['KA-X99']);
    expect(check.errorRows).toEqual(['KA-X99']);
    expect(checkPublishable([item({}), item({ unit_cost: '0' })]).ok).toBe(false);
    expect(checkPublishable([item({}), { ...bad, row_status: 'ignored' }]).ok).toBe(true);
    expect(checkPublishable([{ ...bad, row_status: 'ignored' }]).ok).toBe(false); // nothing left to publish
  });

  it('Cost change preview: 1464 -> 1520 = +56 / +3.83%, threshold is a parameter', () => {
    const c = computeCostChange('1464', '1520', '0.30');
    expect(c).toMatchObject({ diff: '56', pct: '3.83', isWarning: false });
    expect(computeCostChange('1464', '1520', '0.03').isWarning).toBe(true);
    expect(computeCostChange('1000', '1300', '0.30').isWarning).toBe(true);
    expect(computeCostChange(null, '1520').diff).toBeNull();
  });
});

describe('B2 effective cost resolution', () => {
  it('Effective cost by quote date: newest effective_from <= quote date', () => {
    const r = pickEffectiveCost([NOV, DEC], '2026-12-15') as EffectiveCost;
    expect(r.ok).toBe(true);
    expect(r.quote_unit_cost).toBe('1520');
    expect(r.supplier_sku).toBe('KA-T91N');
    // monthly rule: November cost stays valid until the next effective_from
    expect((pickEffectiveCost([NOV, DEC], '2026-11-30') as EffectiveCost).quote_unit_cost).toBe('1464');
    expect((pickEffectiveCost([NOV], '2027-03-01') as EffectiveCost).quote_unit_cost).toBe('1464');
  });

  it('Future cost not used', () => {
    const r = pickEffectiveCost([NOV, DEC], '2026-11-20') as EffectiveCost;
    expect(r.effective_from).toBe('2026-11-01');
    expect(pickEffectiveCost([DEC], '2026-11-20')).toEqual({ ok: false, code: COST_NOT_FOUND });
  });

  it('Historical purchase imports (no published price list) never become quote cost', () => {
    const historical = costRecord({ id: 'h1', unit_cost: '10', pack_cost: null, source_price_list_id: null, effective_date: '2026-11-05' });
    expect(pickEffectiveCost([historical], '2026-11-20')).toEqual({ ok: false, code: COST_NOT_FOUND });
    expect((pickEffectiveCost([NOV, historical], '2026-11-20') as EffectiveCost).quote_unit_cost).toBe('1464');
  });

  it('Cost management view: current vs previous month with derived effective_to', () => {
    const rows = buildCurrentCostRows(
      [NOV, DEC].map(r => ({ ...r, product_internal_sku: '23191001', product_name: 'Tape', source_filename: 'x.pdf' })),
      '2026-12-10',
    );
    expect(rows[0]).toMatchObject({ current_cost: '1520', previous_cost: '1464', change: { diff: '56', pct: '3.83' } });
    const novView = buildCurrentCostRows(
      [NOV, DEC].map(r => ({ ...r, product_internal_sku: '23191001', product_name: 'Tape', source_filename: 'x.pdf' })),
      '2026-11-10',
    );
    expect(novView[0]).toMatchObject({ current_cost: '1464', effective_to: '2026-11-30', next_effective_from: '2026-12-01' });
  });
});

describe('B2 pricing policy & quote engine', () => {
  const policies = [
    { id: 'old-small', tier: 'small', default_margin: '0.22', minimum_margin: null, effective_from: '2026-01-01', effective_to: '2026-10-31', is_active: false },
    { id: 'small', tier: 'small', default_margin: '0.25', minimum_margin: null, effective_from: '2026-11-01', effective_to: null, is_active: true },
    { id: 'medium', tier: 'medium', default_margin: '0.20', minimum_margin: '0.10', effective_from: '2026-11-01', effective_to: null, is_active: true },
    { id: 'large', tier: 'large', default_margin: '0.15', minimum_margin: null, effective_from: '2026-11-01', effective_to: null, is_active: true },
    { id: 'future-large', tier: 'large', default_margin: '0.12', minimum_margin: null, effective_from: '2027-01-01', effective_to: null, is_active: true },
  ];

  it('Tier default margin comes from the active pricing_policies rows', () => {
    const active = pickActivePolicies(policies, '2026-11-15');
    const byTier = Object.fromEntries(active.map(p => [p.tier, p.default_margin]));
    expect(byTier).toEqual({ small: '0.25', medium: '0.20', large: '0.15' });
    expect(pickActivePolicies(policies, '2027-01-02').find(p => p.tier === 'large')!.default_margin).toBe('0.12');
  });

  it('Margin formula: P = (C + F) / (1 - r - m); margin is not markup', () => {
    expect(calculatePrice({ cost: 100, targetMargin: 0.2 }).unitPrice.toNumber()).toBe(125);
    expect(calculatePrice({ cost: 100, targetMargin: 0.2 }).unitPrice.toNumber()).not.toBe(120);
    expect(calculatePrice({ cost: 90, fixedCost: 10, channelFeeRate: 0.05, targetMargin: 0.15 }).unitPrice.toNumber()).toBe(125);
    expect(() => calculatePrice({ cost: 100, channelFeeRate: 0.3, targetMargin: 0.7 })).toThrow();
    const q = computeQuote('1464', { quantity: 1, fixedCost: 0, channelFeeRate: 0, targetMargin: '0.2' });
    expect(q.roundedPrice.toString()).toBe('1830');
    expect(q.grossProfit.toString()).toBe('366');
    expect(q.grossMargin.toString()).toBe('0.2');
  });

  it('Quote snapshot remains unchanged after cost update', () => {
    const product = { id: 'p1', internal_sku: '23191001', name: 'Tape', specification: '910x1100', sales_unit: '箱' };
    const cost = pickEffectiveCost([NOV], '2026-11-20') as EffectiveCost;
    const snapshot = buildQuoteItemSnapshot(product, cost, { id: 'medium', tier: 'medium', default_margin: '0.20' },
      { quantity: 2, fixedCost: 0, channelFeeRate: 0, targetMargin: '0.18' });
    const frozen = JSON.parse(JSON.stringify(snapshot));

    // December cost is published and policy changes afterwards
    const newCost = pickEffectiveCost([NOV, DEC], '2026-12-20') as EffectiveCost;
    expect(newCost.quote_unit_cost).toBe('1520');
    expect(snapshot).toEqual(frozen);
    expect(snapshot).toMatchObject({
      supplier_name: '臺灣營德', supplier_sku: 'KA-T91N', unit_cost: '1464', cost_unit: '箱',
      effective_cost_date: '2026-11-01', pricing_tier: 'medium', default_margin: '0.20', target_margin: '0.18',
      subtotal: '3571', // 2928 / 0.82 = 3570.73 -> 3571
    });
  });
});

describe('B2 quote save (server action)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Missing cost blocks quote: COST_NOT_FOUND, nothing saved, no 0 cost', async () => {
    const { ProductRepository, ConfigRepository, QuoteRepository } = await import('@/repositories');
    const { saveQuoteAction } = await import('@/app/actions/quote');
    const { MISSING_COST_MESSAGE } = await import('./quote');
    vi.mocked(ProductRepository.getProducts).mockResolvedValue([
      { id: 'p1', internal_sku: 'SKU1', name: 'P1', specification: '', sales_unit: '箱', items_per_box: 1 },
    ]);
    vi.mocked(ProductRepository.getEffectiveCost).mockResolvedValue({ ok: false, code: COST_NOT_FOUND });
    vi.mocked(ConfigRepository.getChannelFee).mockResolvedValue({ feeRate: 0, fixedFee: 0 });
    vi.mocked(ConfigRepository.getPricingPolicies).mockResolvedValue([]);

    const result = await saveQuoteAction({ productId: 'p1', quantity: 1, fixedCost: 0, channelId: 'c1', tier: null, targetMargin: 0.2, customerName: 'T' });
    expect(result).toMatchObject({ success: false, code: COST_NOT_FOUND, error: MISSING_COST_MESSAGE });
    expect(QuoteRepository.saveQuote).not.toHaveBeenCalled();
  });

  it('Saves policy + cost source snapshot and enforces minimum margin', async () => {
    const { ProductRepository, ConfigRepository, QuoteRepository } = await import('@/repositories');
    const { saveQuoteAction } = await import('@/app/actions/quote');
    vi.mocked(ProductRepository.getProducts).mockResolvedValue([
      { id: 'p1', internal_sku: '23191001', name: 'Tape', specification: '', sales_unit: '箱', items_per_box: 40 },
    ]);
    vi.mocked(ProductRepository.getEffectiveCost).mockResolvedValue(pickEffectiveCost([NOV], '2026-11-20'));
    vi.mocked(ConfigRepository.getChannelFee).mockResolvedValue({ feeRate: 0, fixedFee: 0 });
    vi.mocked(ConfigRepository.getPricingPolicies).mockResolvedValue([
      { id: 'medium', tier: 'medium', default_margin: '0.20', minimum_margin: '0.10', effective_from: '2026-11-01', effective_to: null, is_active: true },
    ]);
    vi.mocked(QuoteRepository.saveQuote).mockImplementation(async (h, items) => ({ ...h, items, id: 'q1', quote_number: 'Q1', created_at: '' }) as unknown as Quote);

    const ok = await saveQuoteAction({ productId: 'p1', quantity: 1, fixedCost: 0, channelId: 'c1', tier: 'medium', targetMargin: 0.2, customerName: 'T' });
    expect(ok.success).toBe(true);
    const [header, items] = vi.mocked(QuoteRepository.saveQuote).mock.calls[0];
    expect(header).toMatchObject({ tier_name: '中盤', pricing_policy_id: 'medium', total_untaxed: 1830 });
    expect(items[0]).toMatchObject({ supplier_sku: 'KA-T91N', unit_cost: '1464', default_margin: '0.20', target_margin: '0.2', effective_cost_date: '2026-11-01' });

    const low = await saveQuoteAction({ productId: 'p1', quantity: 1, fixedCost: 0, channelId: 'c1', tier: 'medium', targetMargin: 0.05, customerName: 'T' });
    expect(low.success).toBe(false);
  });
});
