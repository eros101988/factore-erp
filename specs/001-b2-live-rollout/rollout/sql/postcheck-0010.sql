-- T003 / contracts/verification-result.md §A-0010. READ-ONLY. Returns (id, result, detail).
-- A-0010-09 (counts: only +1 system_settings, +1 storage.buckets; history entry) is evaluated with
-- baseline-counts.sql + MCP list_migrations.
WITH
cons(tbl, con) AS (VALUES
  ('pricing_policies','pricing_policies_margin_range'),('pricing_policies','pricing_policies_tier_values'),
  ('supplier_price_lists','supplier_price_lists_status_values'),
  ('supplier_price_list_items','spli_row_status_values'),('supplier_price_list_items','spli_mapping_status_values'),
  ('product_external_mappings','pem_status_values')),
idx(name) AS (VALUES
  ('public.pricing_policies_one_open_per_tier'),('public.spli_price_list_idx'),
  ('public.product_external_mappings_src_supplier_code'),('public.pch_source_item_unique'),('public.pch_product_effective_idx')),
dropped(tbl, con) AS (VALUES
  ('pricing_policies','pricing_policies_tier_key'),
  ('product_external_mappings','product_external_mappings_source_type_external_code_key')),
qcols(col) AS (VALUES ('supplier_name'),('cost_unit'),('source_price_list_id'),('pricing_policy_id'),
                      ('pricing_tier'),('default_margin'),('suggested_price'),('gross_profit')),
spli_cols(col) AS (VALUES ('row_status'),('error_message'),('reviewed_by'),('reviewed_at')),
fns(sig) AS (VALUES ('public.publish_supplier_price_list(uuid)'),('public.set_pricing_policy(text,numeric,numeric)')),
tbls(t) AS (VALUES ('pricing_policies'),('supplier_price_lists'),('supplier_price_list_items')),
miss_cons AS (SELECT con AS m FROM cons WHERE NOT EXISTS (
  SELECT 1 FROM pg_constraint WHERE conname = con AND conrelid = to_regclass('public.' || tbl))),
miss_idx AS (SELECT name AS m FROM idx WHERE to_regclass(name) IS NULL),
still_there AS (SELECT con AS m FROM dropped WHERE EXISTS (
  SELECT 1 FROM pg_constraint WHERE conname = con AND conrelid = to_regclass('public.' || tbl))),
miss_spli AS (SELECT col AS m FROM spli_cols WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='supplier_price_list_items' AND column_name=col)),
miss_q AS (SELECT col AS m FROM qcols WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quote_items' AND column_name=col)),
bad_fn_priv AS (SELECT sig AS m FROM fns WHERE to_regprocedure(sig) IS NULL
  OR has_function_privilege('anon', sig, 'EXECUTE')
  OR NOT has_function_privilege('authenticated', sig, 'EXECUTE')),
bad_tbl_priv AS (SELECT t AS m FROM tbls WHERE to_regclass('public.' || t) IS NULL
  OR NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE')
  OR NOT COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || t)), false)
  OR EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t
             AND ('anon' = ANY (p.roles) OR 'public' = ANY (p.roles))))
SELECT 'A-0010-01' AS id,
  CASE WHEN to_regprocedure('public.publish_supplier_price_list(uuid,uuid)') IS NULL
        AND EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure('public.publish_supplier_price_list(uuid)')
                    AND prorettype = 'integer'::regtype AND prosecdef)
       THEN 'PASS' ELSE 'FAIL' END AS result,
  'publish(uuid,uuid) absent: ' || (to_regprocedure('public.publish_supplier_price_list(uuid,uuid)') IS NULL)::text ||
  '; publish(uuid) returns integer, security definer' AS detail
UNION ALL
SELECT 'A-0010-02', CASE WHEN NOT EXISTS (SELECT 1 FROM bad_fn_priv) THEN 'PASS' ELSE 'FAIL' END,
  COALESCE((SELECT 'bad: ' || string_agg(m, ', ') FROM bad_fn_priv), 'anon cannot EXECUTE; authenticated can')
UNION ALL
SELECT 'A-0010-03',
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_purchase_cost_history_append_only'
                    AND tgrelid = to_regclass('public.purchase_cost_history') AND tgenabled <> 'D' AND NOT tgisinternal)
       THEN 'PASS' ELSE 'FAIL' END,
  'append-only trigger present and enabled'
UNION ALL
SELECT 'A-0010-04',
  CASE WHEN NOT EXISTS (SELECT 1 FROM miss_cons) AND NOT EXISTS (SELECT 1 FROM miss_idx)
        AND NOT EXISTS (SELECT 1 FROM still_there) AND NOT EXISTS (SELECT 1 FROM miss_spli)
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
                    AND table_name='supplier_price_lists' AND column_name='storage_path')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
                    AND table_name='supplier_price_list_items' AND column_name='unit_cost' AND is_nullable='YES')
       THEN 'PASS' ELSE 'FAIL' END,
  concat_ws('; ',
    (SELECT 'missing constraints: ' || string_agg(m, ', ') FROM miss_cons),
    (SELECT 'missing indexes: ' || string_agg(m, ', ') FROM miss_idx),
    (SELECT 'not dropped: ' || string_agg(m, ', ') FROM still_there),
    (SELECT 'missing spli cols: ' || string_agg(m, ', ') FROM miss_spli),
    'constraints/indexes/columns checked')
UNION ALL
SELECT 'A-0010-05', CASE WHEN NOT EXISTS (SELECT 1 FROM miss_q) THEN 'PASS' ELSE 'FAIL' END,
  COALESCE((SELECT 'missing: ' || string_agg(m, ', ') FROM miss_q), '8 quote snapshot columns present')
UNION ALL
SELECT 'A-0010-06',
  CASE WHEN (SELECT setting_value::text FROM public.system_settings WHERE setting_key = 'cost_change_warning_threshold') IN ('0.30', '0.3')
       THEN 'PASS' ELSE 'FAIL' END,
  'cost_change_warning_threshold = ' || COALESCE((SELECT setting_value::text FROM public.system_settings
                                                 WHERE setting_key = 'cost_change_warning_threshold'), 'missing')
UNION ALL
SELECT 'A-0010-07',
  CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'supplier-price-lists' AND public = false)
        AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                    AND policyname = 'Admins manage supplier price list files')
       THEN 'PASS' ELSE 'FAIL' END,
  'bucket private + storage policy (object count compared via baseline-counts)'
UNION ALL
SELECT 'A-0010-08', CASE WHEN NOT EXISTS (SELECT 1 FROM bad_tbl_priv) THEN 'PASS' ELSE 'FAIL' END,
  COALESCE((SELECT 'bad: ' || string_agg(m, ', ') FROM bad_tbl_priv),
           'authenticated has table privileges; RLS on; no anon/public policy');
