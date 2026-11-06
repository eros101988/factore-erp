'use server';

import { ProductRepository, ConfigRepository, QuoteRepository } from '@/repositories';
import { calculatePrice, roundPrice } from '@/lib/pricing/engine';
import { Quote } from '@/lib/data/demo';

export async function saveQuoteAction(formData: {
  productId: string;
  quantity: number;
  fixedCost: number;
  channelId: string;
  tierId: string;
  targetMargin: number;
  customerName: string;
}) {
  try {
    // 1. Server-side validation & recalculation
    const products = await ProductRepository.getProducts();
    const product = products.find(p => p.id === formData.productId);
    if (!product) throw new Error('Product not found');

    const effectiveCost = await ProductRepository.getEffectiveCost(formData.productId, new Date().toISOString().split('T')[0]);
    if (!effectiveCost) throw new Error('Cost not found for product');

    const channelFee = await ConfigRepository.getChannelFee(formData.channelId);
    const tiers = await ConfigRepository.getTiers();
    const tier = tiers.find(t => t.id === formData.tierId);
    const tierName = tier ? tier.name : '自訂';

    const totalCost = effectiveCost.unit_cost * formData.quantity;
    
    // Recalculate using Pricing Engine
    const pricingResult = calculatePrice({
      cost: totalCost,
      fixedCost: formData.fixedCost,
      channelFeeRate: channelFee.feeRate,
      targetMargin: formData.targetMargin
    });

    const roundedPrice = roundPrice(pricingResult.unitPrice, '1');
    const taxRate = 0.05;
    const taxAmount = roundedPrice.times(taxRate).round();
    const totalAmount = roundedPrice.plus(taxAmount);

    // 2. Prepare Quote Data
    const quoteData: Omit<Quote, 'id' | 'quote_number' | 'created_at'> = {
      customer_name: formData.customerName,
      channel_id: formData.channelId,
      tier_name: tierName,
      total_untaxed: roundedPrice.toNumber(),
      total_tax: taxAmount.toNumber(),
      total_amount: totalAmount.toNumber(),
      items: [
        {
          product_id: product.id,
          internal_sku: product.internal_sku,
          product_name: product.name,
          specification: product.specification,
          unit: product.sales_unit,
          quantity: formData.quantity,
          unit_cost: effectiveCost.unit_cost,
          effective_cost_date: effectiveCost.effective_date,
          fixed_cost: formData.fixedCost,
          channel_fee_rate: channelFee.feeRate,
          target_margin: formData.targetMargin,
          unit_price: roundedPrice.toNumber() / formData.quantity,
          subtotal: roundedPrice.toNumber(),
          tax_rate: taxRate,
          tax_amount: taxAmount.toNumber(),
          total: totalAmount.toNumber()
        }
      ]
    };

    // 3. Save to Repository
    const savedQuote = await QuoteRepository.saveQuote(quoteData);
    
    return { success: true, quote: savedQuote };
  } catch (error: any) {
    console.error('Save quote error:', error);
    return { success: false, error: error.message || 'Failed to save quote' };
  }
}
