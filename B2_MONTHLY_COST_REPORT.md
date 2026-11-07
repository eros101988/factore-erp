# B2 Monthly Cost & Pricing Result

## Database
**新增 Tables：** `supplier_price_lists`、`supplier_price_list_items`、`pricing_policies`

**修改 Tables：**
- `purchase_cost_history`：+`source_price_list_id`、`source_price_list_item_id`、`pack_cost`（B1 已有 `supplier_id`、`external_supplier_sku`、`cost_unit`、`pack_qty`）；append-only trigger；`source_price_list_item_id` unique
- `product_external_mappings`：Supplier SKU mapping 使用 `source_type='supplier_price_list'`；唯一鍵改為 (source_type, supplier_id, external_code)
- `quotes`：+`pricing_policy_id`
- `quote_items`：+`supplier_id`、`supplier_name`、`supplier_sku`、`cost_unit`、`cost_source_type`、`cost_source_id`、`source_price_list_id`、`pricing_policy_id`、`pricing_tier`、`default_margin`、`suggested_price`、`gross_profit`
- `system_settings`：+`cost_change_warning_threshold` (0.30)
- Storage：private bucket `supplier-price-lists`（Admin only）

**新增 Migrations：**
- `0008_b2_pricing_foundation.sql`
- `0009_b2_publish_rpc.sql`（已被 0010 取代）
- `0010_b2_cost_integrity.sql`（idempotent）

欄位對照：`purchase_cost_history.effective_date` 就是 `effective_from`；`effective_to` 不存，由下一筆 `effective_from` 推算（避免 UPDATE 舊月份）。

## PDF
- **Upload：** 成本管理 →「上傳供應商價格表」（Supplier / Year / Month / PDF），原檔存 Storage
- **Parse：** pdf-parse v2，Text-based PDF；解析 SKU / Description / Spec / Pack Qty / Purchase Unit / Unit Cost；掃描圖片 PDF → `MANUAL_REVIEW_REQUIRED`
- **Staging：** 寫入 `supplier_price_list_items`，不碰正式成本
- **Mapping：** 依 confirmed Supplier SKU mapping 自動對應；suggested 需確認；可 Reject
- **Review：** Old / New / Difference / % / Mapping；超過門檻顯示「異常」；可修正成本、明確忽略列、Reject 整份
- **Publish：** `publish_supplier_price_list` RPC，單一 Transaction，all-or-nothing；有 Unmapped / Invalid Cost / Error Row 時整份拒絕

## Monthly Cost
- **Append Only：** YES（trigger 擋 UPDATE；DELETE 僅 service_role 維護用）
- **Effective Date：** 價格表月份第一天，持續有效到下一筆 effective_from 前
- **Future Cost Protection：** YES（`effective_from <= quoteDate`，台灣時區）

## Pricing Policy
- **Small：** 25%（Demo 初始值，資料庫 seed）
- **Medium：** 20%
- **Large：** 15%
- **Configurable：** YES。「報價政策」頁可改預設 / 最低毛利率與漲跌警告門檻；每次修改都新增版本並保留歷史

## Quote Engine
- **Effective Cost：** `getEffectiveProductCost(productId, quoteDate)`，只採用已 Publish 的價格表成本；歷史進貨匯入不影響報價
- **Margin：** P = (C + F) / (1 − r − m)，檢查 1 − r − m > 0；成本 100、毛利 20% → 125
- **Channel Fee：** 通路費率 r 與固定費加入 F
- **Snapshot：** Supplier / SKU / Cost / Cost Effective Date / Pricing Policy / Default Margin / Selected Margin / Fees / Suggested Price 全部寫入 `quote_items`

## Missing Cost
**Behavior：** 回傳 `COST_NOT_FOUND`，畫面顯示「此商品尚無有效成本，請先建立本月供應商成本。」，Server 拒絕儲存，不會以 0 / Demo / 未來成本代替

## Tests
`src/lib/pricing/b2.test.ts`（18）＋`tests/b2_publish_db.test.ts`（8，在 PGlite 上執行真實 migration SQL）

- PDF parse text（真實 fixture PDF：KA-T91N / 40 / 36.6 → 1464；下月 38 → 1520；掃描 PDF → MANUAL_REVIEW_REQUIRED）
- Pack cost Decimal calculation
- Supplier mapping
- Unmapped item blocks publish（unit + DB）
- Invalid cost blocks publish（unit + DB）
- Only active admins can publish
- Monthly cost append（DB：11 月與 12 月並存，舊列 UPDATE 被拒）
- Effective cost by quote date
- Future cost not used
- Historical purchase imports never become quote cost
- Missing cost blocks quote
- Tier default margin
- Margin formula
- Quote snapshot remains unchanged after cost update（unit + DB）
- Publish transaction rollback（DB：中途失敗不留任何部分成本、mapping 或 audit）
- Cost change preview（+56 / +3.83%，門檻可設定）
- Pricing policy versioning

**Passed：** 48 / 48（含 S1 / B1 既有測試）
**Failed：** 0

`npm run build`：成功；`tsc`：無錯誤

## Production Business Cost Published
**NO**

## Ready For First Real Supplier PDF
**YES**，前提是先在 Supabase 依序套用 migrations 0008 → 0009 → 0010（尚未套用到 Live DB）。
解析器目前預期每列格式為 `SKU … PackQty [Unit] UnitCost`；真實 PDF 版面若不同，可能需要針對該供應商微調。
