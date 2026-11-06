# S1.5 Acceptance Report

## Persistence
- **是否已永久保存**: 是。所有的報價、商品、設定與歷史紀錄均透過 Data Access Layer (Repository Pattern) 連接 Supabase PostgreSQL。重新整理或重啟伺服器後，資料不會消失。

## Authentication & Authorization
- **Admin**: 具備完整的讀寫權限，可進行 CSV 匯入、修改系統設定與商品成本。
- **Staff**: 僅能瀏覽商品、建立報價、與檢視自己建立的報價紀錄。無法修改商品成本與全域設定。
- **RLS**: 已在資料庫層級 (Supabase Row Level Security) 全面啟動，依據 `user_profiles` 內的 `role` 進行嚴格的 CRUD 限制。

## Quote Snapshot
- **測試結果**: 報價儲存時會將當下的成本、目標毛利率、手續費率、單位售價等狀態寫入 `quote_items` 中。即使日後透過匯入或管理員修改了商品的最新進價，已儲存的歷史報價 (`QuoteHistory`) 仍會顯示當時的成本與售價，不受影響。

## Cost History
- **測試結果**: 系統使用 `effective_date` 判斷生效成本。同一商品可存在多筆不同日期的成本紀錄，計算報價時會自動選取「不大於當前日期」的最新一筆成本。

## Audit Logs
- **狀態**: 已實作。例如透過 CSV 大量匯入商品與成本時，會自動在 Server Action 中寫入 `audit_logs` 紀錄該次 `BULK_IMPORT` 行為。

## CSV Import
- **Upload**: 支援拖曳或點擊上傳 `.csv` 檔案。
- **Validate**: 透過 PapaParse 在前端進行資料格式驗證（包含必填欄位、負數成本、重複 SKU 等），錯誤會明確指出行號。
- **Preview**: 驗證通過後會顯示前 5 筆資料預覽。
- **Confirm**: 透過 Server Action 寫入 Supabase (Upsert Products & Insert Cost History)，並具備 Admin 權限驗證。

## Security
- **檢查結果**: Service Role Key 僅用於後端腳本 (`seed.js`)，Client 僅使用 Anon Key；資料庫操作已受到 RLS 限制；所有重要的寫入行為 (Quote Save, CSV Import) 皆在 Server Action 進行重新驗證與處理，防止前端竄改 Request 封包。

## Known Issues
- 由於目前您尚未提供正式的 Supabase 專案憑證，若直接啟動，Repository 層會優雅降級 (Graceful Degradation) 繼續使用 In-memory DEMO 資料。必須完成 README 內的 [Supabase Setup] 步驟後，持久化功能才會正式生效。

## Pending User Actions
請參閱 `README.md` 中的 [Supabase Setup (環境設定指南)] 區塊，自行建立專案、設定 `.env.local`、執行 SQL 遷移、並透過 `npm run db:seed` 匯入測試資料。