'use client';

import { useState, useMemo, useRef } from 'react';
import { computeQuote } from '@/lib/pricing/quote';
import type { EffectiveCost } from '@/lib/pricing/costResolver';
import { Product } from '@/lib/data/demo';
import { saveQuoteAction } from '@/app/actions/quote';
import { getEffectiveCostAction } from '@/app/actions/pricing';

import { MISSING_COST_MESSAGE } from '@/lib/pricing/quote';

interface TierOption {
  tier: string;
  name: string;
  defaultMargin: number;
  minimumMargin: number | null;
}

interface QuoteCalculatorProps {
  initialProducts: Product[];
  initialTiers: TierOption[];
  initialChannels: { id: string; name: string }[];
  channelFees: { channelId: string; fee: { feeRate: number; fixedFee: number } }[];
}

const fmt = (n: { toNumber(): number } | number, digits = 0) =>
  (typeof n === 'number' ? n : n.toNumber()).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });

export default function QuoteCalculator({
  initialProducts,
  initialTiers,
  initialChannels,
  channelFees
}: QuoteCalculatorProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [fixedCost, setFixedCost] = useState<number>(0);
  const [selectedChannelId, setSelectedChannelId] = useState<string>(initialChannels.length > 0 ? initialChannels[0].id : '');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [targetMargin, setTargetMargin] = useState<number | null>(null);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [cost, setCost] = useState<EffectiveCost | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [isLoadingCost, setIsLoadingCost] = useState(false);
  const requestRef = useRef(0);

  const selectedProduct = useMemo(() => initialProducts.find(p => p.id === selectedProductId), [selectedProductId, initialProducts]);
  const tierPolicy = initialTiers.find(t => t.tier === selectedTier) ?? null;

  const handleProductChange = async (pId: string) => {
    setSelectedProductId(pId);
    setCost(null);
    setCostError(null);
    setSaveError(null);
    if (!pId) return;

    const requestId = ++requestRef.current;
    setIsLoadingCost(true);
    try {
      const result = await getEffectiveCostAction(pId);
      if (requestId !== requestRef.current) return; // a newer selection won
      if (result.ok) setCost(result);
      else setCostError(MISSING_COST_MESSAGE);
    } catch {
      if (requestId === requestRef.current) setCostError('讀取成本失敗，請重新整理後再試。');
    } finally {
      if (requestId === requestRef.current) setIsLoadingCost(false);
    }
  };

  const channelFee = useMemo(() => {
    return channelFees.find(c => c.channelId === selectedChannelId)?.fee || { feeRate: 0, fixedFee: 0 };
  }, [selectedChannelId, channelFees]);

  const pricing = useMemo(() => {
    if (!cost || targetMargin === null) return null;
    try {
      return computeQuote(cost.quote_unit_cost, {
        quantity,
        fixedCost: fixedCost + (channelFee.fixedFee || 0),
        channelFeeRate: channelFee.feeRate,
        targetMargin,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Calculation error' };
    }
  }, [cost, quantity, fixedCost, channelFee, targetMargin]);

  const belowMinimum = tierPolicy?.minimumMargin != null && targetMargin !== null && targetMargin < tierPolicy.minimumMargin;

  const handleTierChange = (tier: TierOption) => {
    setSelectedTier(tier.tier);
    setTargetMargin(tier.defaultMargin);
  };

  const handleSaveQuote = async () => {
    if (!selectedProduct || !cost || !pricing || 'error' in pricing || targetMargin === null) return;
    setIsSaving(true);
    setSaveError(null);

    const result = await saveQuoteAction({
      productId: selectedProduct.id,
      quantity,
      fixedCost,
      channelId: selectedChannelId,
      tier: selectedTier,
      targetMargin,
      customerName: '臨時詢價客戶'
    });

    setIsSaving(false);
    if (result.success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setSaveError(result.error ?? '儲存失敗');
    }
  };

  return (
    <div className="p-4 space-y-6 pb-20">
      {/* 1. 選擇商品 */}
      <section className="space-y-3 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <h2 className="font-semibold text-gray-800 text-sm">1. 商品與數量</h2>

        <div className="space-y-2">
          <label className="text-xs text-gray-500 font-medium">選擇商品</label>
          <select
            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            value={selectedProductId}
            onChange={(e) => handleProductChange(e.target.value)}
          >
            <option value="">請選擇...</option>
            {initialProducts.map(p => (
              <option key={p.id} value={p.id}>{p.internal_sku} - {p.name}</option>
            ))}
          </select>
        </div>

        {isLoadingCost && <div className="text-xs text-gray-500">讀取有效成本中...</div>}

        {costError && (
          <div role="alert" className="text-sm p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
            {costError}
          </div>
        )}

        {selectedProduct && cost && (
          <>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900 space-y-1" data-testid="cost-source">
              <div className="font-semibold text-blue-800">成本來源 (Cost Source)</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="text-blue-600">供應商</span><span>{cost.supplier_name ?? '-'}</span>
                <span className="text-blue-600">價格月份 / 生效日</span>
                <span>{cost.effective_from.slice(0, 7).replace('-', '/')} ({cost.effective_from})</span>
                <span className="text-blue-600">Supplier SKU</span><span className="font-mono">{cost.supplier_sku ?? '-'}</span>
                <span className="text-blue-600">成本</span>
                <span className="font-semibold">
                  NT${fmt(Number(cost.quote_unit_cost), 4)} / {cost.pack_cost ? selectedProduct.sales_unit : (cost.cost_unit ?? selectedProduct.sales_unit)}
                </span>
                {cost.pack_cost && (
                  <>
                    <span className="text-blue-600">單位成本</span>
                    <span>NT${fmt(Number(cost.unit_cost), 4)} / {cost.cost_unit ?? '單位'} × {cost.pack_qty}</span>
                  </>
                )}
              </div>
            </div>
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
          </>
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
            onChange={(e) => setFixedCost(Math.max(0, parseFloat(e.target.value) || 0))}
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
          {(channelFee.feeRate > 0 || channelFee.fixedFee > 0) && (
            <p className="text-xs text-amber-600 mt-1">
              此通路收取 {(channelFee.feeRate * 100).toFixed(1)}% 手續費{channelFee.fixedFee > 0 ? ` + 固定 NT$${channelFee.fixedFee}` : ''}
            </p>
          )}
        </div>
      </section>

      {/* 3. 毛利設定 */}
      <section className="space-y-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <h2 className="font-semibold text-gray-800 text-sm">3. 報價級別與毛利</h2>

        {initialTiers.length === 0 && (
          <p className="text-xs text-red-600">尚未設定報價政策，請管理員至「報價政策」設定。</p>
        )}
        <div className="flex gap-2">
          {initialTiers.map(tier => (
            <button
              key={tier.tier}
              type="button"
              onClick={() => handleTierChange(tier)}
              className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                selectedTier === tier.tier
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tier.name}
              <span className="block text-[10px] text-gray-400">預設 {(tier.defaultMargin * 100).toFixed(1)}%</span>
            </button>
          ))}
        </div>

        {targetMargin === null ? (
          <p className="text-xs text-gray-500">請先選擇報價級別，滑桿會帶入該級別的預設毛利率。</p>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center">
              <label className="text-xs text-gray-500 font-medium">
                目標毛利率 (Gross Margin)
                {tierPolicy && <span className="ml-1 text-gray-400">預設 {(tierPolicy.defaultMargin * 100).toFixed(1)}%</span>}
              </label>
              <span className="text-sm font-bold text-blue-600">{(targetMargin * 100).toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              step="0.5"
              value={targetMargin * 100}
              onChange={(e) => setTargetMargin(parseFloat(e.target.value) / 100)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            {belowMinimum && (
              <p className="text-xs text-red-600">低於此級別最低毛利 {(tierPolicy!.minimumMargin! * 100).toFixed(1)}%，無法儲存。</p>
            )}
          </div>
        )}
      </section>

      {/* 4. 計算結果 */}
      {pricing && cost && (
        <section className="bg-slate-800 p-5 rounded-xl shadow-md text-white space-y-4">
          {'error' in pricing ? (
            <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded">
              錯誤: {pricing.error === 'Invalid margin and fee: 1 - r - m must be greater than 0'
                ? '毛利率 + 通路費率必須小於 100%'
                : pricing.error}
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs text-slate-400 font-medium mb-1">建議未稅售價 (Suggested Pre-Tax Price)</p>
                <div className="text-3xl font-bold text-emerald-400">
                  NT$ {fmt(pricing.roundedPrice)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  P = (C + F) / (1 − r − m) = NT$ {fmt(pricing.suggestedPrice, 2)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm border-t border-slate-700 pt-4">
                <div>
                  <p className="text-slate-400 text-xs">成本 (Cost)</p>
                  <p className="font-medium">NT$ {fmt(pricing.totalCost.plus(pricing.fixedCost), 2)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">目標毛利率 (Target Margin)</p>
                  <p className="font-medium">{(targetMargin! * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">毛利 (Gross Profit)</p>
                  <p className="font-medium text-blue-300">NT$ {fmt(pricing.grossProfit, 2)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">實際毛利率 (Gross Margin)</p>
                  <p className="font-medium text-blue-300">{pricing.grossMargin.times(100).toFixed(2)}%</p>
                </div>
                {pricing.channelFee.gt(0) && (
                  <div>
                    <p className="text-slate-400 text-xs">通路手續費</p>
                    <p className="font-medium">NT$ {fmt(pricing.channelFee, 2)}</p>
                  </div>
                )}
                <div>
                  <p className="text-slate-400 text-xs">營業稅 (5%)</p>
                  <p className="font-medium">NT$ {fmt(pricing.taxAmount)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">含稅總額</p>
                  <p className="font-medium text-white">NT$ {fmt(pricing.totalAmount)}</p>
                </div>
              </div>

              {saveError && <div className="text-red-300 text-sm bg-red-900/30 p-2 rounded">{saveError}</div>}

              <button
                onClick={handleSaveQuote}
                disabled={isSaving || belowMinimum}
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
