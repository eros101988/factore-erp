import { describe, it, expect } from 'vitest';
import { calculatePrice, roundPrice } from './engine';
import { Decimal } from 'decimal.js';

describe('Pricing Engine', () => {
  it('Test 1: Simple cost and margin', () => {
    const result = calculatePrice({
      cost: 100,
      targetMargin: 0.2
    });
    expect(result.unitPrice.toNumber()).toBe(125);
    expect(result.marginAmount.toNumber()).toBe(25);
  });

  it('Test 2: Cost, fixed cost, and margin', () => {
    const result = calculatePrice({
      cost: 1000,
      fixedCost: 150, // 100 shipping + 50 packaging
      targetMargin: 0.2
    });
    expect(result.unitPrice.toNumber()).toBe(1437.5);
  });

  it('Test 3: Cost, platform fee, and margin', () => {
    const result = calculatePrice({
      cost: 1000,
      channelFeeRate: 0.1,
      targetMargin: 0.2
    });
    expect(result.unitPrice.toNumber()).toBeCloseTo(1428.571428, 5);
  });

  it('Test 4: Invalid margin + fee > 100%', () => {
    expect(() => calculatePrice({
      cost: 100,
      channelFeeRate: 0.4,
      targetMargin: 0.6
    })).toThrowError('1 - r - m must be greater than 0');
  });

  it('Test 5: 0% margin', () => {
    const result = calculatePrice({
      cost: 100,
      targetMargin: 0
    });
    expect(result.unitPrice.toNumber()).toBe(100);
    expect(result.marginAmount.toNumber()).toBe(0);
  });

  it('Test 6: Decimal precision', () => {
    // 0.1 + 0.2 in float is 0.30000000000000004
    // Using decimal.js it should be exact
    const result = calculatePrice({
      cost: 0.1,
      fixedCost: 0.2,
      targetMargin: 0
    });
    expect(result.unitPrice.toNumber()).toBe(0.3);
  });

  it('Test 7: Price rounding', () => {
    const price = new Decimal('1437.50');
    expect(roundPrice(price, 'none').toNumber()).toBe(1437.5);
    expect(roundPrice(price, '1').toNumber()).toBe(1438);
    expect(roundPrice(price, '5').toNumber()).toBe(1440);
    expect(roundPrice(price, '10').toNumber()).toBe(1440); // 1437.5 / 10 = 143.75 -> 144 -> 1440
    
    const price2 = new Decimal('1434.99');
    expect(roundPrice(price2, '10').toNumber()).toBe(1430);
  });
});
