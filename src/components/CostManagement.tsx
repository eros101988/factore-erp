'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  uploadSupplierPdfAction,
  publishPriceListAction,
  getPriceListReviewAction,
  setItemMappingAction,
  fixItemCostAction,
  setItemIgnoredAction,
  rejectPriceListAction,
  deleteDraftPriceListAction,
  getPriceListFileUrlAction,
} from '@/app/actions/pricing';
import { checkPublishable, computeCostChange, describePublishBlockers } from '@/lib/pricing/priceList';
import type { CurrentCostRow } from '@/lib/pricing/costView';
import { FileText, Upload, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface Supplier { id: string; name: string }
interface ProductOption { id: string; internal_sku: string; name: string; sales_unit: string }
interface PriceList {
  id: string;
  supplier_id: string;
  year: number;
  month: number;
  effective_from: string;
  status: string;
  source_filename: string | null;
  storage_path: string | null;
  notes: string | null;
  published_at: string | null;
  suppliers: { name: string } | null;
  supplier_price_list_items?: { count: number }[];
}
interface ReviewItem {
  id: string;
  supplier_sku: string;
  supplier_product_name: string | null;
  specification: string | null;
  pack_qty: number | null;
  purchase_unit: string | null;
  unit_cost: string | number | null;
  calculated_pack_cost: string | number | null;
  mapping_status: string;
  mapped_product_id: string | null;
  row_status: string;
  error_message: string | null;
  raw_data: { raw_text?: string } | null;
  old_cost: string | null;
  old_effective_from: string | null;
}

interface CostManagementProps {
  suppliers: Supplier[];
  priceLists: PriceList[];
  products: ProductOption[];
  currentCosts: CurrentCostRow[];
  threshold: string;
  loadError: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  published: 'bg-green-100 text-green-700',
  ready: 'bg-emerald-100 text-emerald-700',
  needs_review: 'bg-amber-100 text-amber-700',
  rejected: 'bg-gray-200 text-gray-600',
  parsed: 'bg-blue-100 text-blue-700',
  draft: 'bg-blue-100 text-blue-700',
};

const MAPPING_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  suggested: 'Suggested',
  rejected: 'Rejected',
  unmapped: 'Unmapped',
};

const money = (v: string | number | null | undefined) =>
  v === null || v === undefined ? '-' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });

function ChangeCell({ diff, pct, isWarning }: { diff: string | null; pct: string | null; isWarning: boolean }) {
  if (diff === null) return <span className="text-gray-400">新成本</span>;
  const d = Number(diff);
  const color = d > 0 ? 'text-red-600' : d < 0 ? 'text-green-600' : 'text-gray-400';
  return (
    <span className={`inline-flex items-center justify-end gap-1 ${color}`}>
      {d > 0 ? '+' : ''}{money(diff)}
      {pct !== null && <span className="text-xs">({d > 0 ? '+' : ''}{pct}%)</span>}
      {isWarning && (
        <span title="漲跌幅超過警告門檻，請確認是否解析錯誤" className="inline-flex items-center gap-0.5 text-amber-600 text-xs font-semibold">
          <AlertTriangle size={14} /> 異常
        </span>
      )}
    </span>
  );
}

export default function CostManagement({ suppliers, priceLists, products, currentCosts, threshold, loadError }: CostManagementProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<'current' | 'lists' | 'upload' | 'review'>('current');
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Filters
  const [fSupplier, setFSupplier] = useState('');
  const [fMonth, setFMonth] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [fMapping, setFMapping] = useState('');

  // Upload
  const now = new Date();
  const [uploadSupplierId, setUploadSupplierId] = useState('');
  const [uploadYear, setUploadYear] = useState(String(now.getFullYear()));
  const [uploadMonth, setUploadMonth] = useState(String(now.getMonth() + 1));
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Review
  const [selectedList, setSelectedList] = useState<PriceList | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [editing, setEditing] = useState<{ id: string; cost: string; qty: string } | null>(null);

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const pctThreshold = (Number(threshold) * 100).toFixed(0);

  const months = useMemo(
    () => [...new Set([...currentCosts.map(c => c.effective_from.slice(0, 7)), ...priceLists.map(l => l.effective_from.slice(0, 7))])].sort().reverse(),
    [currentCosts, priceLists],
  );

  const filteredCosts = currentCosts.filter(c =>
    (!fSupplier || c.supplier_id === fSupplier) &&
    (!fMonth || c.effective_from.startsWith(fMonth)) &&
    (!fProduct || `${c.internal_sku} ${c.product_name} ${c.supplier_sku ?? ''}`.toLowerCase().includes(fProduct.toLowerCase())));

  const filteredLists = priceLists.filter(l =>
    (!fSupplier || l.supplier_id === fSupplier) && (!fMonth || l.effective_from.startsWith(fMonth)));

  const filteredItems = items.filter(i => {
    const p = i.mapped_product_id ? productById.get(i.mapped_product_id) : null;
    return (!fMapping || i.mapping_status === fMapping) &&
      (!fProduct || `${i.supplier_sku} ${i.supplier_product_name ?? ''} ${p?.internal_sku ?? ''} ${p?.name ?? ''}`.toLowerCase().includes(fProduct.toLowerCase()));
  });

  const publishCheck = checkPublishable(items);
  const isLocked = selectedList?.status === 'published' || selectedList?.status === 'rejected';

  const loadReview = async (listId: string) => {
    const res = await getPriceListReviewAction(listId);
    if (!res.success) {
      setMessage({ type: 'error', text: res.error ?? '讀取失敗' });
      return;
    }
    setSelectedList(res.list as PriceList);
    setItems(res.items as ReviewItem[]);
  };

  const openReview = async (list: PriceList) => {
    setMessage(null);
    setEditing(null);
    await loadReview(list.id);
    setTab('review');
  };

  const run = async (fn: () => Promise<{ success: boolean; error?: string | null }>, ok?: string) => {
    setMessage(null);
    const res = await fn();
    if (!res.success) setMessage({ type: 'error', text: res.error ?? '操作失敗' });
    else if (ok) setMessage({ type: 'success', text: ok });
    if (selectedList) await loadReview(selectedList.id);
    startTransition(() => router.refresh());
    return res.success;
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setIsUploading(true);
    setMessage(null);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('supplierId', uploadSupplierId);
    formData.append('year', uploadYear);
    formData.append('month', uploadMonth);
    const res = await uploadSupplierPdfAction(formData);
    setIsUploading(false);
    if (!res.success) {
      setMessage({ type: 'error', text: res.error ?? '上傳失敗' });
      return;
    }
    setUploadFile(null);
    startTransition(() => router.refresh());
    if (res.message) setMessage({ type: 'error', text: res.message });
    else setMessage({ type: 'success', text: `已解析 ${res.itemCount} 筆，請完成對應與檢查後再 Publish。` });
    if (res.priceListId) {
      await loadReview(res.priceListId);
      setTab('review');
    }
  };

  const handlePublish = async () => {
    if (!selectedList) return;
    if (!confirm(`確定發布 ${selectedList.suppliers?.name} ${selectedList.year}/${selectedList.month} 價格表？發布後將新增正式成本紀錄，無法修改。`)) return;
    setIsPublishing(true);
    const res = await publishPriceListAction(selectedList.id);
    setIsPublishing(false);
    if (!res.success) {
      setMessage({ type: 'error', text: res.error ?? '發布失敗' });
      return;
    }
    setMessage({ type: 'success', text: `已發布 ${res.rowsPublished} 筆正式成本 (生效日 ${selectedList.effective_from})。` });
    await loadReview(selectedList.id);
    startTransition(() => router.refresh());
  };

  const openPdf = async (listId: string) => {
    const res = await getPriceListFileUrlAction(listId);
    if (res.success && res.url) window.open(res.url, '_blank', 'noopener');
    else setMessage({ type: 'error', text: res.error ?? '無法開啟 PDF' });
  };

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      key={key}
      onClick={() => { setTab(key); setMessage(null); }}
      className={`px-3 py-2 text-sm rounded-lg ${tab === key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-800">成本管理</h2>
        <div className="flex flex-wrap gap-2">
          {tabBtn('current', '目前成本')}
          {tabBtn('lists', '供應商價格表')}
          {selectedList && tabBtn('review', 'Review')}
          <button
            onClick={() => { setTab('upload'); setMessage(null); }}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 text-sm"
          >
            <Upload size={16} /> 上傳供應商價格表
          </button>
        </div>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">資料讀取錯誤：{loadError}（請確認 B2 migrations 已套用）</div>}

      {message && (
        <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${message.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
          {message.type === 'error' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle size={16} className="mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Filters */}
      {tab !== 'upload' && (
        <div className="flex flex-wrap gap-2 bg-white p-3 rounded-xl border border-gray-100 text-sm">
          {tab !== 'review' && (
            <>
              <select value={fSupplier} onChange={e => setFSupplier(e.target.value)} className="border p-2 rounded-lg" aria-label="供應商篩選">
                <option value="">全部供應商</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={fMonth} onChange={e => setFMonth(e.target.value)} className="border p-2 rounded-lg" aria-label="月份篩選">
                <option value="">全部月份</option>
                {months.map(m => <option key={m} value={m}>{m.replace('-', '/')}</option>)}
              </select>
            </>
          )}
          {tab !== 'lists' && (
            <input value={fProduct} onChange={e => setFProduct(e.target.value)} placeholder="商品 / SKU 搜尋" className="border p-2 rounded-lg flex-1 min-w-[160px]" />
          )}
          {tab === 'review' && (
            <select value={fMapping} onChange={e => setFMapping(e.target.value)} className="border p-2 rounded-lg" aria-label="對應狀態篩選">
              <option value="">全部對應狀態</option>
              {Object.entries(MAPPING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Current costs */}
      {tab === 'current' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap text-sm">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="p-3 font-medium">商品</th>
                <th className="p-3 font-medium">供應商</th>
                <th className="p-3 font-medium">Supplier SKU</th>
                <th className="p-3 font-medium">有效日期</th>
                <th className="p-3 font-medium text-right">上月成本</th>
                <th className="p-3 font-medium text-right">本月成本</th>
                <th className="p-3 font-medium text-right">差額 / 漲跌 %</th>
                <th className="p-3 font-medium">來源 PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCosts.map(c => (
                <tr key={c.product_id} className="hover:bg-gray-50">
                  <td className="p-3"><span className="font-mono text-xs text-gray-500">{c.internal_sku}</span> {c.product_name}</td>
                  <td className="p-3">{c.supplier_name ?? '-'}</td>
                  <td className="p-3 font-mono">{c.supplier_sku ?? '-'}</td>
                  <td className="p-3">
                    {c.effective_from} ~ {c.effective_to ?? ''}
                    {c.next_effective_from && <div className="text-xs text-blue-600">下一筆 {c.next_effective_from} 生效</div>}
                  </td>
                  <td className="p-3 text-right text-gray-500">{money(c.previous_cost)}</td>
                  <td className="p-3 text-right font-semibold">{money(c.current_cost)}</td>
                  <td className="p-3 text-right"><ChangeCell {...c.change} /></td>
                  <td className="p-3">
                    <button onClick={() => openPdf(c.source_price_list_id)} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                      <FileText size={14} /> {c.source_filename ?? '檢視'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCosts.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">尚無已發布的供應商成本</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload */}
      {tab === 'upload' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-md">
          <h3 className="text-lg font-bold mb-1">上傳供應商價格表 PDF</h3>
          <p className="text-xs text-gray-500 mb-4">支援文字型 PDF。解析結果進入 Staging，Admin Review 並 Publish 後才會成為正式成本；掃描圖片 PDF 將標記為 MANUAL_REVIEW_REQUIRED。</p>
          <form onSubmit={handleUpload} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">供應商</label>
              <select value={uploadSupplierId} onChange={e => setUploadSupplierId(e.target.value)} className="w-full border p-2 rounded-lg" required>
                <option value="">選擇供應商...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">年份</label>
                <input type="number" value={uploadYear} onChange={e => setUploadYear(e.target.value)} className="w-full border p-2 rounded-lg" min="2000" max="2100" required />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">月份</label>
                <input type="number" value={uploadMonth} onChange={e => setUploadMonth(e.target.value)} className="w-full border p-2 rounded-lg" min="1" max="12" required />
              </div>
            </div>
            <p className="text-xs text-gray-500">生效日：{uploadYear}-{uploadMonth.padStart(2, '0')}-01，持續有效至下一筆成本生效前。</p>
            <div>
              <label className="block text-sm text-gray-600 mb-1">PDF 檔案</label>
              <input type="file" accept="application/pdf,.pdf" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded-lg" required />
            </div>
            <button type="submit" disabled={isUploading || !uploadFile || !uploadSupplierId} className="bg-blue-600 text-white p-2 rounded-lg mt-2 disabled:opacity-50">
              {isUploading ? '上傳解析中...' : '上傳並解析'}
            </button>
          </form>
        </div>
      )}

      {/* Price lists */}
      {tab === 'lists' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap text-sm">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="p-3 font-medium">供應商</th>
                <th className="p-3 font-medium">價格月份</th>
                <th className="p-3 font-medium">生效日</th>
                <th className="p-3 font-medium">檔案</th>
                <th className="p-3 font-medium text-right">項目數</th>
                <th className="p-3 font-medium">狀態</th>
                <th className="p-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLists.map(list => (
                <tr key={list.id} className="hover:bg-gray-50">
                  <td className="p-3">{list.suppliers?.name}</td>
                  <td className="p-3">{list.year}/{String(list.month).padStart(2, '0')}</td>
                  <td className="p-3">{list.effective_from}</td>
                  <td className="p-3">
                    {list.storage_path ? (
                      <button onClick={() => openPdf(list.id)} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                        <FileText size={14} /> <span className="truncate max-w-[200px]">{list.source_filename}</span>
                      </button>
                    ) : <span className="text-gray-500">{list.source_filename}</span>}
                  </td>
                  <td className="p-3 text-right">{list.supplier_price_list_items?.[0]?.count ?? 0}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[list.status] ?? 'bg-gray-100'}`}>{list.status}</span>
                    {list.notes?.startsWith('MANUAL_REVIEW_REQUIRED') && <div className="text-xs text-red-600 mt-1">MANUAL_REVIEW_REQUIRED</div>}
                  </td>
                  <td className="p-3">
                    <button onClick={() => openReview(list)} className="text-blue-600 hover:underline font-medium">
                      {list.status === 'published' || list.status === 'rejected' ? '檢視' : 'Review & Publish'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredLists.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">尚無價格表紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Review */}
      {tab === 'review' && selectedList && (
        <div className="flex flex-col gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-3 justify-between items-center">
            <div>
              <h3 className="font-bold text-lg">{selectedList.suppliers?.name} · {selectedList.year}/{String(selectedList.month).padStart(2, '0')} 價格表</h3>
              <p className="text-sm text-gray-500">
                狀態：<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[selectedList.status] ?? ''}`}>{selectedList.status}</span>
                {' '}· 生效日 {selectedList.effective_from} · 檔案 {selectedList.source_filename}
              </p>
              {selectedList.notes && <p className="text-xs text-red-600 mt-1">{selectedList.notes}</p>}
              {!isLocked && items.length > 0 && (
                <p className={`text-xs mt-1 ${publishCheck.ok ? 'text-green-700' : 'text-amber-700'}`}>
                  {publishCheck.ok ? `可發布 ${publishCheck.publishable} 筆` : describePublishBlockers(publishCheck)}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">漲跌超過 {pctThreshold}% 標示為異常（可在報價政策設定修改門檻）</p>
            </div>
            {!isLocked && (
              <div className="flex gap-2">
                {selectedList.status !== 'ready' && items.length === 0 && (
                  <button
                    onClick={() => run(() => deleteDraftPriceListAction(selectedList.id), '已刪除草稿').then(ok => { if (ok) { setSelectedList(null); setTab('lists'); } })}
                    className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    刪除草稿
                  </button>
                )}
                <button
                  onClick={() => { const n = prompt('退回原因？'); if (n !== null) run(() => rejectPriceListAction(selectedList.id, n), '已退回'); }}
                  className="border border-red-300 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 text-sm"
                >
                  Reject
                </button>
                <button
                  onClick={handlePublish}
                  disabled={isPublishing || !publishCheck.ok}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50"
                >
                  {isPublishing ? '發布中...' : 'Publish 正式成本'}
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap text-sm">
              <thead className="bg-gray-50 border-b text-gray-600">
                <tr>
                  <th className="p-3 font-medium">Supplier SKU</th>
                  <th className="p-3 font-medium">品名 / 規格</th>
                  <th className="p-3 font-medium text-right">單位成本 × 包裝</th>
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium text-right">Old Cost</th>
                  <th className="p-3 font-medium text-right">New Cost</th>
                  <th className="p-3 font-medium text-right">Difference / %</th>
                  <th className="p-3 font-medium">Mapping</th>
                  <th className="p-3 font-medium">Row</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredItems.map(item => {
                  const ignored = item.row_status === 'ignored';
                  const newCost = item.calculated_pack_cost ?? null;
                  const change = newCost !== null ? computeCostChange(item.old_cost, newCost, threshold) : null;
                  const product = item.mapped_product_id ? productById.get(item.mapped_product_id) : null;
                  const isEditing = editing?.id === item.id;
                  return (
                    <tr key={item.id} className={`${ignored ? 'opacity-50' : ''} ${item.row_status === 'error' ? 'bg-red-50' : change?.isWarning ? 'bg-amber-50' : ''}`}>
                      <td className="p-3 font-mono">{item.supplier_sku}</td>
                      <td className="p-3 text-xs">
                        <div>{item.supplier_product_name ?? '-'}</div>
                        <div className="text-gray-400">{item.specification}</div>
                      </td>
                      <td className="p-3 text-right">
                        {isEditing ? (
                          <span className="inline-flex gap-1 items-center">
                            <input aria-label="單位成本" value={editing.cost} onChange={e => setEditing({ ...editing, cost: e.target.value })} className="border rounded p-1 w-20 text-right" />
                            ×
                            <input aria-label="包裝數量" value={editing.qty} onChange={e => setEditing({ ...editing, qty: e.target.value })} className="border rounded p-1 w-14 text-right" />
                            <button className="text-blue-600 text-xs" onClick={() => run(() => fixItemCostAction(item.id, editing.cost, parseInt(editing.qty, 10)), '已更新成本').then(ok => ok && setEditing(null))}>儲存</button>
                            <button className="text-gray-500 text-xs" onClick={() => setEditing(null)}>取消</button>
                          </span>
                        ) : (
                          <>
                            {money(item.unit_cost)} × {item.pack_qty ?? '?'} {item.purchase_unit ?? ''}
                            {!isLocked && !ignored && (
                              <button className="ml-2 text-xs text-blue-600" onClick={() => setEditing({ id: item.id, cost: String(item.unit_cost ?? ''), qty: String(item.pack_qty ?? '') })}>修正</button>
                            )}
                          </>
                        )}
                      </td>
                      <td className="p-3">
                        {isLocked || ignored ? (
                          <span>{product ? `${product.internal_sku} - ${product.name}` : 'Unmapped'}</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <select
                              value={item.mapped_product_id || ''}
                              onChange={e => e.target.value && run(() => setItemMappingAction(item.id, e.target.value, 'confirmed'))}
                              className={`border p-1 rounded w-full max-w-[220px] ${item.mapping_status !== 'confirmed' ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}
                            >
                              <option value="">-- 選擇對應商品 --</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.internal_sku} - {p.name}</option>)}
                            </select>
                            {item.mapping_status === 'suggested' && item.mapped_product_id && (
                              <button title="確認建議對應" className="text-green-600" onClick={() => run(() => setItemMappingAction(item.id, item.mapped_product_id, 'confirmed'))}><CheckCircle size={16} /></button>
                            )}
                            {item.mapped_product_id && (
                              <button title="拒絕此對應" className="text-red-500" onClick={() => run(() => setItemMappingAction(item.id, null, 'rejected'))}><XCircle size={16} /></button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right text-gray-500">
                        {money(item.old_cost)}
                        {item.old_effective_from && <div className="text-[10px]">{item.old_effective_from}</div>}
                      </td>
                      <td className="p-3 text-right font-medium">{money(newCost)}</td>
                      <td className="p-3 text-right">{change ? <ChangeCell {...change} /> : '-'}</td>
                      <td className="p-3">
                        {item.mapping_status === 'confirmed' ? (
                          <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle size={14} /> Confirmed</span>
                        ) : (
                          <span className="text-amber-600 inline-flex items-center gap-1"><AlertTriangle size={14} /> {MAPPING_LABEL[item.mapping_status] ?? item.mapping_status}</span>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {item.row_status === 'error' && <div className="text-red-600" title={item.raw_data?.raw_text}>Error: {item.error_message}</div>}
                        {ignored && <div className="text-gray-500">Ignored</div>}
                        {item.row_status === 'valid' && <div className="text-gray-500">OK</div>}
                        {!isLocked && (
                          <button className="text-blue-600 underline" onClick={() => run(() => setItemIgnoredAction(item.id, !ignored))}>
                            {ignored ? '取消忽略' : '忽略此列'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-gray-500">
                    {items.length === 0 ? '此價格表沒有解析出任何項目（MANUAL_REVIEW_REQUIRED）。請刪除草稿後改用文字型 PDF，或人工建立。' : '沒有符合篩選的項目'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {isPending && <div className="text-xs text-gray-400">更新中...</div>}
        </div>
      )}
    </div>
  );
}
