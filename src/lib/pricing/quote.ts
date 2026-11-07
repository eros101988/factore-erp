import Decimal from 'decimal.js';
import { calculatePrice, roundPrice } from './engine';
import type { EffectiveCost } from './costResolver';

type DecimalInput = string | number | Decimal;

export const TAX_RATE = '0.05';
export const MISSING_COST_MESSAGE = '此商品尚無有效成本，請先建立本月供應商成本。';

export interface QuoteInputs {
  quantity: number;
  fixedCost: DecimalInput;
  channelFeeRate: DecimalInput;
  targetMargin: DecimalInput;
}

export interface QuoteFigures {
  totalCost: Decimal;      // C (product cost x qty)
  fixedCost: Decimal;      // F
  suggestedPrice: Decimal; // P before rounding
  roundedPrice: Decimal;   // pre-tax price actually quoted
  channelFee: Decimal;
  grossProfit: Decimal;    // on rounded price: P - C - F - P*r
  grossMargin: Decimal;    // grossProfit / P
  taxAmount: Decimal;
  totalAmount: Decimal;
}

export function computeQuote(quoteUnitCost: DecimalInput, inputs: QuoteInputs): QuoteFigures {
  const totalCost = new Decimal(quoteUnitCost).times(inputs.quantity);
  const r = new Decimal(inputs.channelFeeRate || 0);
  const result = calculatePrice({
    cost: totalCost,
    fixedCost: inputs.fixedCost,
    channelFeeRate: r,
    targetMargin: inputs.targetMargin,
  });
  const roundedPrice = roundPrice(result.unitPrice, '1');
  const channelFee = roundedPrice.times(r);
  const grossProfit = roundedPrice.minus(totalCost).minus(result.fixedCost).minus(channelFee);
  const grossMargin = roundedPrice.isZero() ? new Decimal(0) : grossProfit.div(roundedPrice);
  const taxAmount = roundedPrice.times(TAX_RATE).round();
  return {
    totalCost,
    fixedCost: result.fixedCost,
    suggestedPrice: result.unitPrice,
    roundedPrice,
    channelFee,
    grossProfit,
    grossMargin,
    taxAmount,
    totalAmount: roundedPrice.plus(taxAmount),
  };
}

export interface ProductLike {
  id: string;
  internal_sku: string;
  name: string;
  specification: string | null;
  sales_unit: string;
}

export interface PolicySnapshot {
  id: string | null;
  tier: string | null;
  default_margin: string | null;
}

/**
 * Builds the immutable quote_items row. Every value is copied (as strings/numbers),
 * so later cost or policy updates never change a saved quote.
 */
export function buildQuoteItemSnapshot(
  product: ProductLike,
  cost: EffectiveCost,
  policy: PolicySnapshot,
  inputs: QuoteInputs,
) {
  const f = computeQuote(cost.quote_unit_cost, inputs);
  return {
    product_id: product.id,
    internal_sku: product.internal_sku,
    product_name: product.name,
    specification: product.specification,
    unit: product.sales_unit,
    quantity: inputs.quantity,
    // cost source snapshot
    supplier_id: cost.supplier_id,
    supplier_name: cost.supplier_name,
    supplier_sku: cost.supplier_sku,
    unit_cost: cost.quote_unit_cost,
    cost_unit: cost.pack_cost ? product.sales_unit : cost.cost_unit,
    effective_cost_date: cost.effective_from,
    cost_source_type: 'supplier_price_list',
    cost_source_id: cost.cost_record_id,
    source_price_list_id: cost.source_price_list_id,
    // policy snapshot
    pricing_policy_id: policy.id,
    pricing_tier: policy.tier,
    default_margin: policy.default_margin,
    target_margin: new Decimal(inputs.targetMargin).toString(),
    // fees & price
    fixed_cost: f.fixedCost.toString(),
    channel_fee_rate: new Decimal(inputs.channelFeeRate || 0).toString(),
    suggested_price: f.suggestedPrice.toDecimalPlaces(4).toString(),
    unit_price: f.roundedPrice.div(inputs.quantity).toDecimalPlaces(2).toString(),
    subtotal: f.roundedPrice.toString(),
    gross_profit: f.grossProfit.toDecimalPlaces(2).toString(),
    tax_rate: TAX_RATE,
    tax_amount: f.taxAmount.toString(),
    total: f.totalAmount.toString(),
  };
}

export type QuoteItemSnapshot = ReturnType<typeof buildQuoteItemSnapshot>;
