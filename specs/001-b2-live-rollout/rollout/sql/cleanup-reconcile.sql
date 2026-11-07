-- T003 / contracts/verification-result.md §C-01. READ-ONLY.
-- Counts rows carrying test markers ([TEST], TEST-, year >= 2099). Every row must be 0.
-- C-02 (count reconciliation) = baseline-counts.sql compared with evidence; C-03 = MCP get_advisors diff.
-- Test-subject profile check: run test-subject.sql and compare with preflight evidence.
WITH q(check_id, sql) AS (VALUES
  ('suppliers',                  $$SELECT count(*) AS c FROM public.suppliers WHERE name LIKE '[TEST]%'$$),
  ('products',                   $$SELECT count(*) AS c FROM public.products WHERE internal_sku LIKE '[TEST]%' OR name LIKE '[TEST]%'$$),
  ('supplier_price_lists',       $$SELECT count(*) AS c FROM public.supplier_price_lists WHERE year >= 2099 OR source_filename LIKE '[TEST]%'$$),
  ('supplier_price_list_items',  $$SELECT count(*) AS c FROM public.supplier_price_list_items WHERE supplier_sku LIKE 'TEST-%'$$),
  ('purchase_cost_history',      $$SELECT count(*) AS c FROM public.purchase_cost_history WHERE external_supplier_sku LIKE 'TEST-%' OR effective_date >= DATE '2099-01-01'$$),
  ('product_external_mappings',  $$SELECT count(*) AS c FROM public.product_external_mappings WHERE external_code LIKE 'TEST-%'$$),
  ('quotes',                     $$SELECT count(*) AS c FROM public.quotes WHERE quote_number LIKE '[TEST]%' OR customer_name LIKE '[TEST]%'$$),
  ('quote_items',                $$SELECT count(*) AS c FROM public.quote_items WHERE internal_sku LIKE '[TEST]%'$$),
  ('audit_logs',                 $$SELECT count(*) AS c FROM public.audit_logs a WHERE a.created_at >= now() - interval '1 day'
                                     AND a.action IN ('PUBLISH_PRICE_LIST','SET_PRICING_POLICY')$$),
  ('pricing_policies_open_rows', $$SELECT count(*) AS c FROM public.pricing_policies WHERE is_active AND effective_to IS NULL$$)
)
SELECT check_id,
  CASE WHEN check_id IN ('supplier_price_lists','supplier_price_list_items','product_external_mappings')
             AND to_regclass('public.' || check_id) IS NULL THEN NULL
       WHEN check_id = 'pricing_policies_open_rows' AND to_regclass('public.pricing_policies') IS NULL THEN NULL
       ELSE substring(query_to_xml(sql, false, true, '')::text FROM '<c>(\d+)</c>')::bigint END AS rows_found,
  CASE WHEN check_id = 'pricing_policies_open_rows' THEN 'expected 3 (one per tier)' ELSE 'expected 0' END AS expected
FROM q
ORDER BY check_id;
