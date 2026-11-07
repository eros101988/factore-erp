-- T003 / contracts/verification-result.md §A-0008. READ-ONLY. Returns (id, result, detail).
-- A-0008-05 (counts unchanged except +3 pricing_policies; history entry) is evaluated with
-- baseline-counts.sql + MCP list_migrations, not here.
WITH
cols(tbl, col) AS (VALUES
  ('pricing_policies','id'),('pricing_policies','tier'),('pricing_policies','default_margin'),('pricing_policies','minimum_margin'),
  ('pricing_policies','effective_from'),('pricing_policies','effective_to'),('pricing_policies','is_active'),('pricing_policies','created_by'),
  ('supplier_price_lists','supplier_id'),('supplier_price_lists','year'),('supplier_price_lists','month'),('supplier_price_lists','effective_from'),
  ('supplier_price_lists','status'),('supplier_price_lists','source_filename'),('supplier_price_lists','source_file_url'),
  ('supplier_price_lists','uploaded_by'),('supplier_price_lists','published_by'),('supplier_price_lists','published_at'),
  ('supplier_price_list_items','price_list_id'),('supplier_price_list_items','supplier_sku'),('supplier_price_list_items','pack_qty'),
  ('supplier_price_list_items','purchase_unit'),('supplier_price_list_items','unit_cost'),('supplier_price_list_items','calculated_pack_cost'),
  ('supplier_price_list_items','raw_data'),('supplier_price_list_items','mapping_status'),('supplier_price_list_items','mapped_product_id')),
added(tbl, col) AS (VALUES
  ('purchase_cost_history','source_price_list_id'),('purchase_cost_history','source_price_list_item_id'),('purchase_cost_history','pack_cost'),
  ('quotes','pricing_policy_id'),('quote_items','supplier_id'),('quote_items','supplier_sku'),
  ('quote_items','cost_source_type'),('quote_items','cost_source_id')),
pols(tbl, pol) AS (VALUES
  ('pricing_policies','Admin can do all on pricing_policies'),('pricing_policies','Staff can view pricing_policies'),
  ('supplier_price_lists','Admin can do all on supplier_price_lists'),('supplier_price_lists','Staff can view supplier_price_lists'),
  ('supplier_price_list_items','Admin can do all on supplier_price_list_items'),('supplier_price_list_items','Staff can view supplier_price_list_items')),
missing_cols AS (
  SELECT tbl || '.' || col AS m FROM cols
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=tbl AND c.column_name=col)),
missing_added AS (
  SELECT tbl || '.' || col AS m FROM added
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=tbl AND c.column_name=col)),
missing_pols AS (
  SELECT pol AS m FROM pols
  WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=tbl AND p.policyname=pol)),
no_rls AS (
  SELECT t AS m FROM unnest(ARRAY['pricing_policies','supplier_price_lists','supplier_price_list_items']) t
  WHERE NOT COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || t)), false)),
seed AS (
  SELECT substring(query_to_xml(
    $$SELECT string_agg(tier || '=' || default_margin::text, ',' ORDER BY tier) AS c
      FROM public.pricing_policies WHERE is_active AND effective_to IS NULL$$, false, true, '')::text
    FROM '<c>([^<]*)</c>') AS s
  WHERE to_regclass('public.pricing_policies') IS NOT NULL)
SELECT 'A-0008-01' AS id,
       CASE WHEN to_regclass('public.pricing_policies') IS NOT NULL AND to_regclass('public.supplier_price_lists') IS NOT NULL
             AND to_regclass('public.supplier_price_list_items') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM missing_cols)
            THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE((SELECT 'missing: ' || string_agg(m, ', ') FROM missing_cols), '3 tables with expected columns') AS detail
UNION ALL
SELECT 'A-0008-02',
       CASE WHEN NOT EXISTS (SELECT 1 FROM missing_added) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT 'missing: ' || string_agg(m, ', ') FROM missing_added), '8 added columns present')
UNION ALL
SELECT 'A-0008-03',
       -- PASS when exactly the 3 demo tiers are open, OR pre-existing rows were kept (judged against preflight evidence).
       CASE WHEN (SELECT s FROM seed) = 'large=0.1500,medium=0.2000,small=0.2500' THEN 'PASS' ELSE 'FAIL' END,
       'open policies: ' || COALESCE((SELECT s FROM seed), 'none') || ' (if preflight showed pre-existing rows, compare with evidence instead)'
UNION ALL
SELECT 'A-0008-04',
       CASE WHEN NOT EXISTS (SELECT 1 FROM no_rls) AND NOT EXISTS (SELECT 1 FROM missing_pols) THEN 'PASS' ELSE 'FAIL' END,
       COALESCE((SELECT 'RLS off: ' || string_agg(m, ', ') FROM no_rls), 'RLS on 3 tables') || '; ' ||
       COALESCE((SELECT 'missing policies: ' || string_agg(m, ', ') FROM missing_pols), '6 policies present');
