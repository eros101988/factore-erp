import { Decimal } from 'decimal.js';

export interface PricingInput {
  cost: number | string | Decimal;
  fixedCost?: number | string | Decimal;
  channelFeeRate?: number | string | Decimal; // 0 to 1
  targetMargin: number | string | Decimal; // 0 to 1
}

export interface PricingResult {
  cost: Decimal;
  fixedCost: Decimal;
  channelFeeRate: Decimal;
  targetMargin: Decimal;
  unitPrice: Decimal; // 未稅售價 P = (C + F) / (1 - r - m)
  marginAmount: Decimal; // 毛利金額 = P - C - F - (P * r)
}

export function calculatePrice(input: PricingInput): PricingResult {
  const C = new Decimal(input.cost);
  const F = new Decimal(input.fixedCost || 0);
  const r = new Decimal(input.channelFeeRate || 0);
  const m = new Decimal(input.targetMargin);

  const denominator = new Decimal(1).minus(r).minus(m);

  if (denominator.lte(0)) {
    throw new Error('Invalid margin and fee: 1 - r - m must be greater than 0');
  }

  const P = C.plus(F).dividedBy(denominator);
  
  if (P.isNegative()) {
    throw new Error('Price cannot be negative');
  }

  const marginAmount = P.minus(C).minus(F).minus(P.times(r));

  return {
    cost: C,
    fixedCost: F,
    channelFeeRate: r,
    targetMargin: m,
    unitPrice: P,
    marginAmount: marginAmount
  };
}

export type RoundingMode = 'none' | '1' | '5' | '10' | '50' | '100';

export function roundPrice(price: Decimal, mode: RoundingMode): Decimal {
  if (mode === 'none') return price;
  
  const step = new Decimal(mode);
  // Using nearest rounding (half up)
  return price.dividedBy(step).round().times(step);
}
