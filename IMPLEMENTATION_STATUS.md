# Implementation Status

## Completed
- Next.js (App Router) 專案初始化與 TypeScript / Tailwind 設定。
- 獨立的 Pricing Engine (`src/lib/pricing/engine.ts`)。
- Pricing Engine 核心測試案例 (`src/lib/pricing/engine.test.ts`)，所有測試均已通過。
- 支援 Mobile-first 的 Quote Calculator UI (`src/components/QuoteCalculator.tsx`)。
- Quote History 列表介面 (`src/components/QuoteHistory.tsx`)。
- 基於 Supabase 的 Database Schema (`supabase/migrations/0001_initial_schema.sql` 與 `0002_add_rls_and_profiles.sql`)，支援快照儲存報價歷史、商品成本追溯、認證配置與 RLS。
- Decimal.js 整合，確保無浮點數精度誤差。
- Supabase Authentication (Email/Password) 與 Middleware 路由保護。
- CSV 匯入中心 (Upload, Parse, Validate, Preview, Server Action)。
- Data Access Layer (Repositories) 串接 Supabase。
- 伺服器端驗證與報價儲存 Action。
- 整合測試 (`integration.test.ts`) 確保快照與權限邏輯。
- Build, Typecheck, Tests 完全通過。

## Partially Completed
- **Data Persistence Implementation**: Completed. Repositories and Server Actions are built.
- **Live Persistence Verification**: Pending. Waiting for user to configure real Supabase credentials and verify against live DB.

## Not Implemented
- 舊 ERP 匯入與 API 同步 (等待後續階段)。
- 蝦皮 API 與 LINE Messaging API (依指示本輪不實作)。
- 庫存、進銷存管理與正式帳務。

## Pending Business Decisions
- **D-01**: 月累計門檻口徑（未稅/含稅）、跨級計價方式。
- **D-02**: 舊 ERP SKU 與供應商 SKU 之精確對應關係與箱入數確認。
- **D-03**: 大中小盤正式預設毛利率。
- **D-04**: 固定費用與各通路的精確負擔歸屬。
- **D-05**: 取整級距決策 (目前使用預設至整數 1 元級距，四捨五入)。

## Demo Data
- **Products**: 
  - `DEMO-001` (測試垃圾袋 91x110)
  - `DEMO-002` (測試手套)
  - `DEMO-003` (測試耐熱袋)
- **Tiers**: 大盤(15%), 中盤(20%), 小盤(25%)
- **Channels**: 一般現場, Shopee Demo (8.5% 費率)
- **Cost History**: 模擬 2026-10 與 2026-11 的多筆成本變動紀錄。

## Known Issues
- 無。一切已準備就緒，僅需使用者自行完成 Supabase 專案建立與連線。

## Next Recommended Step
- 請依照 `README.md` 的指引，建立 Supabase 專案、執行 Migration、Seed、並建立第一個 Admin 帳號。完成後即可提供**真實商品資料與歷史進價表**，我們將用其進行正式 CSV 匯入測試。
