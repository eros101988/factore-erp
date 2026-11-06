# 侑安 ERP - S1.5 Persistence & Production Foundation

本專案為侑安報價引擎導向 ERP 的第一與一點五階段（S1.5 MVP），主要完成報價核心引擎、持久化資料庫結構、認證授權、CSV 匯入功能與報價快照機制。

## 核心功能

- **Pricing Engine**：獨立可測試的報價公式模組（使用 `decimal.js` 確保財務計算精度）。
- **Quote Calculator**：支援手機與電腦的響應式報價計算器，能即時算出「未稅售價、含稅總額與預估毛利」。
- **Quote History & Snapshot**：查看報價歷史，每次儲存皆會將當時的商品、成本與定價狀態儲存為快照（Snapshot），未來商品成本變動不影響歷史報價。
- **Supabase Persistence & Auth**：支援 Email 登入機制，區分 Admin 與 Staff 權限，並實作 Row Level Security (RLS) 保護商業機密。
- **CSV Import Center**：支援大量商品與成本資料上傳、解析、前端驗證預覽、並透過 Server Action 寫入 Supabase 與記錄 Audit Log。

## Supabase Setup (環境設定指南)

如果您尚未建立 Supabase，請按照以下步驟完成設定並啟動系統：

1. **建立 Supabase Project**
   - 前往 [Supabase](https://supabase.com) 註冊並建立一個新 Project。
2. **取得 API Keys**
   - 在專案儀表板的 `Project Settings` -> `API` 中，找到 `Project URL`、`anon public` Key 與 `service_role` Key。
3. **設定環境變數**
   - 在專案根目錄複製 `.env.example` 並重新命名為 `.env.local`。
   - 填入您的 Supabase 資訊：
     ```
     NEXT_PUBLIC_SUPABASE_URL=your-project-url
     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
     SUPABASE_SECRET_KEY=your-secret-key
     ```
4. **執行 Database Migration (建立資料表與 RLS)**
   - 在 Supabase SQL Editor 中，依序執行 `supabase/migrations/` 資料夾內的 SQL 檔案（先執行 `0001_initial_schema.sql`，再執行 `0002_add_rls_and_profiles.sql`）。
5. **建立第一個 Admin 帳號**
   - 在 Supabase `Authentication` -> `Users` 中手動新增一個 User（例如 `admin@yuan.com` / `admin123`）。
   - 在 Supabase SQL Editor 執行以下語法將該使用者設為 Admin：
     ```sql
     INSERT INTO user_profiles (id, display_name, role, is_active)
     VALUES ('剛剛建立的 User UUID', '管理員', 'admin', true);
     ```
6. **匯入 DEMO 測試資料 (Seed)**
   - 在專案目錄執行：`npm run db:seed`
   - 此步驟將會寫入 DEMO 的商品、成本、通路、手續費等基礎資料。
7. **啟動 Next.js 開發伺服器**
   - 執行 `npm run dev` 並開啟 [http://localhost:3000](http://localhost:3000) 即可登入操作。

## 執行測試

```bash
npm run test
```

## 技術架構

- **框架**：Next.js (App Router)
- **語言**：TypeScript
- **樣式**：Tailwind CSS
- **金額運算**：decimal.js
- **資料庫與驗證**：Supabase (PostgreSQL, Auth, RLS)
- **CSV 解析**：PapaParse
- **測試**：Vitest
