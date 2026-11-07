'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { updatePricingPolicyAction } from '@/app/actions/pricing';
import { CheckCircle, AlertTriangle, Save } from 'lucide-react';

interface PolicyRow {
  id: string;
  tier: string;
  default_margin: string | number;
  minimum_margin: string | number | null;
  effective_from: string;
}

interface PricingPolicyProps {
  initialPolicies: PolicyRow[];
  history: (PolicyRow & { effective_to: string | null; created_at: string })[];
  threshold: string;
}

const TIERS = [
  { tier: 'small', name: '小盤 (Small)' },
  { tier: 'medium', name: '中盤 (Medium)' },
  { tier: 'large', name: '大盤 (Large)' },
];

// Percent strings in the form; converted with Decimal (no float drift) on save
const toPct = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '' : new Decimal(v).times(100).toString();
const fromPct = (v: string) => (v.trim() === '' ? null : new Decimal(v).div(100).toString());

export default function PricingPolicy({ initialPolicies, history, threshold }: PricingPolicyProps) {
  const router = useRouter();
  const [form, setForm] = useState(() =>
    Object.fromEntries(TIERS.map(({ tier }) => {
      const p = initialPolicies.find(x => x.tier === tier);
      return [tier, { def: toPct(p?.default_margin), min: toPct(p?.minimum_margin) }];
    })) as Record<string, { def: string; min: string }>,
  );
  const [thresholdPct, setThresholdPct] = useState(toPct(threshold));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const policies = TIERS.map(({ tier }) => {
        if (form[tier].def.trim() === '') throw new Error(`${tier}: 請輸入預設毛利率`);
        return { tier, default_margin: fromPct(form[tier].def)!, minimum_margin: fromPct(form[tier].min) };
      });
      const result = await updatePricingPolicyAction(policies, fromPct(thresholdPct) ?? undefined);
      if (!result.success) throw new Error(result.error ?? 'Failed to save');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">報價政策 (Pricing Policy)</h2>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={18} />
          {isSaving ? '儲存中...' : '儲存設定'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start gap-3">
          <AlertTriangle className="mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg flex items-center gap-3">
          <CheckCircle className="text-green-600" />
          <p className="font-medium">儲存成功（新版本自今日生效，舊版本保留於歷史）</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-bold mb-1">預設毛利率 (Default Gross Margin)</h3>
          <p className="text-sm text-gray-500">報價時選擇級別後，滑桿預設帶入此毛利率，員工仍可調整。毛利率 ≠ 加成率：成本 100、毛利 20% → 售價 125。</p>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-3 items-center text-sm">
          <div className="text-gray-500 text-xs">級別</div>
          <div className="text-gray-500 text-xs">預設毛利率</div>
          <div className="text-gray-500 text-xs">最低毛利率 (選填)</div>
          {TIERS.map(({ tier, name }) => (
            <div key={tier} className="contents">
              <div className="font-medium text-gray-700">{name}</div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  aria-label={`${name} 預設毛利率`}
                  value={form[tier].def}
                  onChange={e => setForm({ ...form, [tier]: { ...form[tier], def: e.target.value } })}
                  className="border p-2 rounded-lg w-24 text-right"
                  step="0.1" min="0" max="99"
                />
                <span className="text-gray-500">%</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  aria-label={`${name} 最低毛利率`}
                  value={form[tier].min}
                  onChange={e => setForm({ ...form, [tier]: { ...form[tier], min: e.target.value } })}
                  className="border p-2 rounded-lg w-24 text-right"
                  step="0.1" min="0" max="99" placeholder="—"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
        <h3 className="text-lg font-bold">成本漲跌警告門檻</h3>
        <p className="text-sm text-gray-500">供應商價格表 Review 時，成本變動超過此比例會標示異常，協助判斷是否解析錯誤。</p>
        <div className="flex items-center gap-1">
          <input
            type="number"
            aria-label="成本漲跌警告門檻"
            value={thresholdPct}
            onChange={e => setThresholdPct(e.target.value)}
            className="border p-2 rounded-lg w-24 text-right"
            step="1" min="1"
          />
          <span className="text-gray-500">%</span>
        </div>
      </div>

      {history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold mb-3">變更歷史</h3>
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs text-left">
              <tr><th className="pb-2">級別</th><th className="pb-2">預設</th><th className="pb-2">最低</th><th className="pb-2">有效期間</th></tr>
            </thead>
            <tbody className="divide-y">
              {history.map(h => (
                <tr key={h.id}>
                  <td className="py-1">{h.tier}</td>
                  <td className="py-1">{toPct(h.default_margin)}%</td>
                  <td className="py-1">{h.minimum_margin === null ? '-' : `${toPct(h.minimum_margin)}%`}</td>
                  <td className="py-1">{h.effective_from} ~ {h.effective_to ?? '目前'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
