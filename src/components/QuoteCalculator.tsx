'use client';

import { useState, useMemo } from 'react';
import { calculatePrice, roundPrice } from '@/lib/pricing/engine';
import { Product, CostHistory } from '@/lib/data/demo';
import { saveQuoteAction } from '@/app/actions/quote';

interface QuoteCalculatorProps {
  initialProducts: Product[];
  initialTiers: { id: string; name: string; defaultMargin: number }[];
  initialChannels: { id: string; name: string }[];
  productCosts: { productId: string; cost: CostHistory | null }[];
  channelFees: { channelId: string; fee: { feeRate: number; fixedFee: number } }[];
}

export default function QuoteCalculator({ 
  initialProducts, 
  initialTiers, 
  initialChannels, 
  productCosts, 
  channelFees 
}: QuoteCalculatorProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [fixedCost, setFixedCost] = useState<number>(0);
  const [selectedChannelId, setSelectedChannelId] = useState<string>(initialChannels.length > 0 ? initialChannels[0].id : '');
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [targetMargin, setTargetMargin] = useState<number>(0.2); // 20% default
  
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedProduct = useMemo(() => initialProducts.find(p => p.id === selectedProductId), [selectedProductId, initialProducts]);
  const effectiveCost = useMemo(() => {
    if (!selectedProduct) return null;
    return productCosts.find(c => c.productId === selectedProduct.id)?.cost || null;
  }, [selectedProduct, productCosts]);
  
  const channelFee = useMemo(() => {
    return channelFees.find(c => c.channelId === selectedChannelId)?.fee || { feeRate: 0, fixedFee: 0 };
  }, [selectedChannelId, channelFees]);
  
  // Calculate pricing
  const pricingResult = useMemo(() => {
    if (!effectiveCost) return null;
    
    try {
      const unitCost = effectiveCost.unit_cost;
      const totalCost = unitCost * quantity;
      
      const result = calculatePrice({
        cost: totalCost,
        fixedCost: fixedCost,
        channelFeeRate: channelFee.feeRate,
        targetMargin: targetMargin
      });
      
      // Nearest rounding to 1
      const roundedPrice = roundPrice(result.unitPrice, '1');
      
      // Tax calculation (5%)
      const taxRate = 0.05;
      const taxAmount = roundedPrice.times(taxRate).round();
      const totalAmount = roundedPrice.plus(taxAmount);
      
      return {
        ...result,
        roundedUnitPrice: roundedPrice,
        taxAmount,
        totalAmount
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Calculation error' };
    }
  }, [effectiveCost, quantity, fixedCost, channelFee, targetMargin]);

  const handleTierChange = (tierId: string) => {
    setSelectedTierId(tierId);
    const tier = initialTiers.find(t => t.id === tierId);
    if (tier) {
      setTargetMargin(tier.defaultMargin);
    }
  };

  const handleSaveQuote = async () => {
    if (!selectedProduct || !effectiveCost || !pricingResult || 'error' in pricingResult) return;
    setIsSaving(true);
    
    const result = await saveQuoteAction({
      productId: selectedProduct.id,
      quantity,
      fixedCost,
      channelId: selectedChannelId,
      tierId: selectedTierId,
      targetMargin,
      customerName: '臨時詢價客戶'
    });
    
    setIsSaving(false);
    if (result.success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      alert(result.error);
    }
  };

  return (
    <div className="p-4 space-y-6 pb-20">
      {/* 1. 選擇商品 */}
      <section className="space-y-3 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <h2 className="font-semibold text-gray-800 text-sm">1. 商品與數量</h2>
        
        <div className="space-y-2">
          <label className="text-xs text-gray-500 font-medium">選擇商品 (DEMO)</label>
          <select 
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">請選擇...</option>
            {initialProducts.map(p => (
              <option key={p.id} value={p.id}>{p.internal_sku} - {p.name}</option>
            ))}
          </select>
        </div>

        {selectedProduct && effectiveCost && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-gray-500 font-medium">數量 ({selectedProduct.sales_unit})</label>
              <input 
                type="number" 
                min="1"
                className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-gray-500 font-medium">單位成本</label>
              <div className="p-2 bg-gray-100 rounded-lg text-sm text-gray-600 border border-gray-200">
                NT$ {effectiveCost.unit_cost.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. 額外成本與通路 */}
      <section className="space-y-3 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <h2 className="font-semibold text-gray-800 text-sm">2. 費用與通路</h2>
        
        <div className="space-y-2">
          <label className="text-xs text-gray-500 font-medium">固定直接成本 (運費/包裝等)</label>
          <input 
            type="number" 
            min="0"
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            value={fixedCost}
            onChange={(e) => setFixedCost(Math.max(0, parseInt(e.target.value) || 0))}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-gray-500 font-medium">銷售通路</label>
          <select 
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
          >
            {initialChannels.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {channelFee.feeRate > 0 && (
            <p className="text-xs text-amber-600 mt-1">此通路將收取 {(channelFee.feeRate * 100).toFixed(1)}% 手續費</p>
          )}
        </div>
      </section>

      {/* 3. 毛利設定 */}
      <section className="space-y-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <h2 className="font-semibold text-gray-800 text-sm">3. 報價級別與毛利</h2>
        
        <div className="flex gap-2">
          {initialTiers.map(tier => (
            <button
              key={tier.id}
              onClick={() => handleTierChange(tier.id)}
              className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                selectedTierId === tier.id 
                  ? 'bg-blue-50 border-blue-500 text-blue-700' 
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tier.name}
            </button>
          ))}
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center">
            <label className="text-xs text-gray-500 font-medium">目標毛利率</label>
            <span className="text-sm font-bold text-blue-600">{(targetMargin * 100).toFixed(1)}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="80" 
            step="0.5"
            value={targetMargin * 100}
            onChange={(e) => {
              setTargetMargin(parseFloat(e.target.value) / 100);
              setSelectedTierId(''); // 自訂時取消選取預設級別
            }}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
      </section>

      {/* 4. 計算結果 */}
      {pricingResult && (
        <section className="bg-slate-800 p-5 rounded-xl shadow-md text-white space-y-4">
          {'error' in pricingResult ? (
            <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
              錯誤: {pricingResult.error}
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs text-slate-400 font-medium mb-1">建議未稅售價</p>
                <div className="text-3xl font-bold text-emerald-400">
                  NT$ {pricingResult.roundedUnitPrice.toNumber().toLocaleString()}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm border-t border-slate-700 pt-4">
                <div>
                  <p className="text-slate-400 text-xs">商品成本</p>
                  <p className="font-medium">NT$ {pricingResult.cost.toNumber().toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">預估毛利金額</p>
                  <p className="font-medium text-blue-300">NT$ {pricingResult.marginAmount.round().toNumber().toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">營業稅 (5%)</p>
                  <p className="font-medium">NT$ {pricingResult.taxAmount.toNumber().toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">含稅總額</p>
                  <p className="font-medium text-white">NT$ {pricingResult.totalAmount.toNumber().toLocaleString()}</p>
                </div>
              </div>

              <button 
                onClick={handleSaveQuote}
                disabled={isSaving}
                className="w-full py-3 mt-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors focus:ring-4 focus:ring-blue-500/50 disabled:opacity-50"
              >
                {isSaving ? '儲存中...' : saveSuccess ? '已儲存報價！' : '儲存報價'}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
