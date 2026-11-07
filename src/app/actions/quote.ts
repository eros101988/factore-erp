'use server';

import { ProductRepository, ConfigRepository, QuoteRepository } from '@/repositories';
import { buildQuoteItemSnapshot, MISSING_COST_MESSAGE } from '@/lib/pricing/quote';
import { toDateString } from '@/lib/pricing/costResolver';
import Decimal from 'decimal.js';

export async function saveQuoteAction(formData: {
  productId: string;
  quantity: number;
  fixedCost: number;
  channelId: string;
  tier: string | null; // small | medium | large, null = custom margin
  targetMargin: number;
  customerName: string;
}) {
  try {
    // 1. Server-side validation & recalculation (client figures are never trusted)
    if (!Number.isInteger(formData.quantity) || formData.quantity <= 0) throw new Error('數量必須為正整數');
    if (formData.fixedCost < 0) throw new Error('固定成本不可為負數');
    const margin = new Decimal(formData.targetMargin);
    if (margin.lt(0) || margin.gte(1)) throw new Error('毛利率需介於 0% 與 100% 之間');

    const products = await ProductRepository.getProducts();
    const product = products.find(p => p.id === formData.productId);
    if (!product) throw new Error('Product not found');

    const quoteDate = toDateString(new Date());
    const cost = await ProductRepository.getEffectiveCost(formData.productId, quoteDate);
    if (!cost.ok) return { success: false, code: cost.code, error: MISSING_COST_MESSAGE };

    const channelFee = await ConfigRepository.getChannelFee(formData.channelId);
    const policies = await ConfigRepository.getPricingPolicies(quoteDate);
    const policy = formData.tier ? policies.find(p => p.tier === formData.tier) : undefined;
    if (formData.tier && !policy) throw new Error(`找不到 ${formData.tier} 的有效報價政策`);
    if (policy?.minimum_margin !== null && policy?.minimum_margin !== undefined && margin.lt(policy.minimum_margin)) {
      throw new Error(`毛利率低於此級別最低毛利 ${new Decimal(policy.minimum_margin).times(100).toString()}%`);
    }

    const item = buildQuoteItemSnapshot(
      product,
      cost,
      { id: policy?.id ?? null, tier: policy?.tier ?? null, default_margin: policy ? String(policy.default_margin) : null },
      {
        quantity: formData.quantity,
        fixedCost: new Decimal(formData.fixedCost).plus(channelFee.fixedFee || 0),
        channelFeeRate: channelFee.feeRate,
        targetMargin: margin,
      },
    );

    const tierNames: Record<string, string> = { small: '小盤', medium: '中盤', large: '大盤' };

    // 2. Save (header + immutable item snapshot)
    const savedQuote = await QuoteRepository.saveQuote(
      {
        customer_name: formData.customerName,
        channel_id: formData.channelId,
        tier_name: policy ? tierNames[policy.tier] ?? policy.tier : '自訂',
        pricing_policy_id: policy?.id ?? null,
        total_untaxed: Number(item.subtotal),
        total_tax: Number(item.tax_amount),
        total_amount: Number(item.total),
      },
      [item],
    );

    return { success: true, quote: savedQuote };
  } catch (error) {
    console.error('Save quote error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save quote' };
  }
}
