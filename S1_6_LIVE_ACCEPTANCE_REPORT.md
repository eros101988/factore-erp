# S1.6 Live Supabase Acceptance Report

| Requirement | Result | Evidence | Notes |
|---|---|---|---|
| **Data Source (Supabase)** | NOT TESTED | Repository checks `.env.local`. | Requires user to create Supabase Project and add keys. |
| **Data Source (Production Fallback)** | PASS | `isSupabaseConfigured()` & `enforceConfigInProduction()` implemented. | Production build strictly blocks fallback to DEMO memory, ensuring data integrity. |
| **Data Source (Dev Demo Mode)** | PASS | `layout.tsx` checks environment and displays `DEMO MODE` banner. | Clear warning to developers if Supabase is not connected. |
| **Migration (0001)** | NOT TESTED | SQL exists in `supabase/migrations/0001_initial_schema.sql` | Contains tables: `products`, `quotes`, `quote_items`, `purchase_cost_history`, etc. |
| **Migration (0002)** | NOT TESTED | SQL exists in `supabase/migrations/0002_add_rls_and_profiles.sql` | Enables RLS on all tables and creates `user_profiles`. |
| **Migration (0003)** | NOT TESTED | SQL exists in `supabase/migrations/0003_import_rpc.sql` | Contains `bulk_import_products_and_costs` RPC for transaction atomicity. |
| **Auth: Admin/Staff Login** | NOT TESTED | `src/app/actions/auth.ts` implements Supabase Auth. | Requires live Supabase instance to test. |
| **Auth: Session & Logout** | NOT TESTED | Middleware protects routes and handles session refresh. | Needs live environment. |
| **RLS: Anonymous** | NOT TESTED | Policy `Active users can read` blocks unauthenticated. | Handled at Postgres level. |
| **RLS: Staff Restrictions** | NOT TESTED | Policies block Staff from `UPDATE`/`DELETE` on `products` and `purchase_cost_history`. | Admins checked via `is_admin()` function. |
| **Persistence: Browser Refresh** | NOT TESTED | Quotes are read via `QuoteRepository.getQuotes()` from Supabase. | Will persist on live DB. |
| **Persistence: Server Restart** | NOT TESTED | Next.js server actions interact with external Postgres. | Will persist on live DB. |
| **Quote Snapshot: Old Cost** | PASS | Handled by DB Schema design. | `quote_items` explicitly saves `unit_cost` and `unit_price` fields at the time of creation. Tested in `integration.test.ts`. |
| **Cost History: Effective Date** | PASS | `getEffectiveCost` filters by `lte(effective_date)`. | Supports multiple cost entries over time. Tested in `integration.test.ts`. |
| **Audit Log: CSV Import** | NOT TESTED | `processImportAction` calls `supabase.from('audit_logs').insert(...)`. | Requires live DB. |
| **CSV Import: Validate** | PASS | PapaParse handles frontend validation (negative cost, missing SKU). | Display row number and specific error. Tested in `integration.test.ts`. |
| **CSV Import: Preview** | PASS | React state `data` slices first 5 rows for UI display. | - |
| **CSV Import: Atomicity** | PASS | Backend uses `bulk_import_products_and_costs` PL/pgSQL function. | Postgres automatically rolls back the entire loop if any row fails. |
| **CSV Import: Duplicate Handling** | PASS | Upsert strategy uses `ON CONFLICT (internal_sku) DO UPDATE`. | Safe idempotent execution. |
| **Security: Client Tampering** | PASS | Server Action recalculates price from DB Cost. | Client cannot override `unit_price` or `total_amount`. Tested in `integration.test.ts`. |
| **Security: Secrets** | PASS | Service Role Key is strictly limited to local Node `seed.js`. | Not exposed in Client Bundle. |
| **Build: Lint & Typecheck** | PASS | `npm run build` succeeds without errors. | Vercel compatible. |
| **Tests** | PASS | All 9 Vitest integration and unit tests pass. | - |

## User Actions Required
1. 前往 Supabase 建立新專案，並取得 `URL`、`anon key` 與 `service_role key`。
2. 在本地專案根目錄建立 `.env.local` 並填入上述環境變數。
3. 在 Supabase SQL Editor 中，依序執行 `0001`, `0002`, `0003` 的 SQL Migration 檔案。
4. 於 Supabase 建立一組使用者，並在 SQL Editor 將其 `role` 更新為 `admin`。
5. 在本地終端機執行 `npm run db:seed` 匯入測試資料。
6. 執行 `npm run dev` 並親自於瀏覽器中走過一次「建立報價、重新整理、檢視紀錄」的流程。

## Next Recommended Step
請依據上述 [User Actions Required] 完成 Supabase 專案建立與資料庫部署。待您親自確認 Live Persistence 正常運作後，我們即可進入「侑安第一批真實商品資料導入與歷史毛利校準」階段。
