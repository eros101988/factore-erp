'use client';

import { Quote } from '@/lib/data/demo';

interface QuoteHistoryProps {
  initialQuotes: Quote[];
}

export default function QuoteHistory({ initialQuotes }: QuoteHistoryProps) {
  if (initialQuotes.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        目前沒有報價紀錄。
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {initialQuotes.map(quote => (
        <div key={quote.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500">{new Date(quote.created_at).toLocaleString()}</div>
              <div className="font-semibold text-sm text-gray-800">{quote.quote_number}</div>
            </div>
            <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded">
              {quote.tier_name}
            </span>
          </div>
          
          <div className="border-t border-gray-100 pt-3">
            {quote.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <div>
                  <div className="font-medium text-gray-700">{item.product_name}</div>
                  <div className="text-xs text-gray-500">
                    {item.quantity} {item.unit} × NT$ {Number(item.unit_price).toLocaleString()}
                  </div>
                  {item.supplier_sku && (
                    <div className="text-[11px] text-gray-400">
                      成本 {item.supplier_name} · {item.supplier_sku} · {item.effective_cost_date} · NT$ {Number(item.unit_cost).toLocaleString()}/{item.cost_unit ?? item.unit} · 毛利 {(Number(item.target_margin) * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div className="font-medium text-gray-800">
                  NT$ {Number(item.subtotal).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-3 flex justify-between items-center bg-gray-50 -mx-4 -mb-4 p-4 rounded-b-xl">
            <div className="text-xs text-gray-500">
              未稅: {quote.total_untaxed.toLocaleString()} | 稅: {quote.total_tax.toLocaleString()}
            </div>
            <div className="font-bold text-emerald-600 text-base">
              NT$ {quote.total_amount.toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
