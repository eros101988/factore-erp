-- T003 / contracts/inspection-report.md: object inventory. READ-ONLY (catalog lookups only).
-- One row per expected object: grp, kind, obj, sub, present.
-- grp '0010-drop' lists objects that 0010 removes (expected PRESENT before 0010, ABSENT after).
WITH exp(grp, kind, obj, sub) AS (VALUES
  -- prerequisites (0001-0007)
  ('prereq','table','public.suppliers',NULL),
  ('prereq','table','public.products',NULL),
  ('prereq','table','public.purchase_cost_history',NULL),
  ('prereq','table','public.quotes',NULL),
  ('prereq','table','public.quote_items',NULL),
  ('prereq','table','public.system_settings',NULL),
  ('prereq','table','public.audit_logs',NULL),
  ('prereq','table','public.user_profiles',NULL),
  ('prereq','table','public.product_external_mappings',NULL),
  ('prereq','table','public.import_batches',NULL),
  ('prereq','table','storage.buckets',NULL),
  ('prereq','table','storage.objects',NULL),
  ('prereq','column','purchase_cost_history','supplier_id'),
  ('prereq','column','purchase_cost_history','external_supplier_sku'),
  ('prereq','column','purchase_cost_history','cost_unit'),
  ('prereq','column','purchase_cost_history','pack_qty'),
  ('prereq','column','purchase_cost_history','source_import_batch_id'),
  ('prereq','function','public.is_admin()',NULL),
  ('prereq','function','public.is_active_user()',NULL),
  ('prereq','unique_col','system_settings','setting_key'),
  ('prereq','unique_cols','product_external_mappings','source_type,external_code'),
  -- 0008
  ('0008','table','public.pricing_policies',NULL),
  ('0008','table','public.supplier_price_lists',NULL),
  ('0008','table','public.supplier_price_list_items',NULL),
  ('0008','column','purchase_cost_history','source_price_list_id'),
  ('0008','column','purchase_cost_history','source_price_list_item_id'),
  ('0008','column','purchase_cost_history','pack_cost'),
  ('0008','column','quotes','pricing_policy_id'),
  ('0008','column','quote_items','supplier_id'),
  ('0008','column','quote_items','supplier_sku'),
  ('0008','column','quote_items','cost_source_type'),
  ('0008','column','quote_items','cost_source_id'),
  ('0008','rls','pricing_policies',NULL),
  ('0008','rls','supplier_price_lists',NULL),
  ('0008','rls','supplier_price_list_items',NULL),
  ('0008','policy','pricing_policies','Admin can do all on pricing_policies'),
  ('0008','policy','pricing_policies','Staff can view pricing_policies'),
  ('0008','policy','supplier_price_lists','Admin can do all on supplier_price_lists'),
  ('0008','policy','supplier_price_lists','Staff can view supplier_price_lists'),
  ('0008','policy','supplier_price_list_items','Admin can do all on supplier_price_list_items'),
  ('0008','policy','supplier_price_list_items','Staff can view supplier_price_list_items'),
  -- 0009 (transient, removed by 0010)
  ('0009','function','public.publish_supplier_price_list(uuid,uuid)',NULL),
  -- 0010
  ('0010','index','public.pricing_policies_one_open_per_tier',NULL),
  ('0010','constraint','pricing_policies','pricing_policies_margin_range'),
  ('0010','constraint','pricing_policies','pricing_policies_tier_values'),
  ('0010','column','supplier_price_lists','storage_path'),
  ('0010','constraint','supplier_price_lists','supplier_price_lists_status_values'),
  ('0010','column','supplier_price_list_items','row_status'),
  ('0010','column','supplier_price_list_items','error_message'),
  ('0010','column','supplier_price_list_items','reviewed_by'),
  ('0010','column','supplier_price_list_items','reviewed_at'),
  ('0010','constraint','supplier_price_list_items','spli_row_status_values'),
  ('0010','constraint','supplier_price_list_items','spli_mapping_status_values'),
  ('0010','index','public.spli_price_list_idx',NULL),
  ('0010','index','public.product_external_mappings_src_supplier_code',NULL),
  ('0010','constraint','product_external_mappings','pem_status_values'),
  ('0010','index','public.pch_source_item_unique',NULL),
  ('0010','index','public.pch_product_effective_idx',NULL),
  ('0010','function','public.purchase_cost_history_append_only()',NULL),
  ('0010','trigger','purchase_cost_history','trg_purchase_cost_history_append_only'),
  ('0010','column','quote_items','supplier_name'),
  ('0010','column','quote_items','cost_unit'),
  ('0010','column','quote_items','source_price_list_id'),
  ('0010','column','quote_items','pricing_policy_id'),
  ('0010','column','quote_items','pricing_tier'),
  ('0010','column','quote_items','default_margin'),
  ('0010','column','quote_items','suggested_price'),
  ('0010','column','quote_items','gross_profit'),
  ('0010','setting','cost_change_warning_threshold',NULL),
  ('0010','bucket','supplier-price-lists',NULL),
  ('0010','storage_policy','objects','Admins manage supplier price list files'),
  ('0010','function','public.publish_supplier_price_list(uuid)',NULL),
  ('0010','function','public.set_pricing_policy(text,numeric,numeric)',NULL),
  -- objects 0010 drops
  ('0010-drop','constraint','pricing_policies','pricing_policies_tier_key'),
  ('0010-drop','constraint','product_external_mappings','product_external_mappings_source_type_external_code_key')
)
SELECT grp, kind, obj, sub,
  CASE kind
    WHEN 'table' THEN to_regclass(obj) IS NOT NULL
    WHEN 'column' THEN EXISTS (SELECT 1 FROM information_schema.columns c
                               WHERE c.table_schema = 'public' AND c.table_name = obj AND c.column_name = sub)
    WHEN 'constraint' THEN EXISTS (SELECT 1 FROM pg_constraint
                                   WHERE conname = sub AND conrelid = to_regclass('public.' || obj))
    WHEN 'index' THEN to_regclass(obj) IS NOT NULL
    WHEN 'function' THEN to_regprocedure(obj) IS NOT NULL
    WHEN 'trigger' THEN EXISTS (SELECT 1 FROM pg_trigger
                                WHERE tgname = sub AND tgrelid = to_regclass('public.' || obj) AND NOT tgisinternal)
    WHEN 'policy' THEN EXISTS (SELECT 1 FROM pg_policies
                               WHERE schemaname = 'public' AND tablename = obj AND policyname = sub)
    WHEN 'storage_policy' THEN EXISTS (SELECT 1 FROM pg_policies
                                       WHERE schemaname = 'storage' AND tablename = obj AND policyname = sub)
    WHEN 'rls' THEN COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || obj)), false)
    WHEN 'bucket' THEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = obj)
    WHEN 'setting' THEN EXISTS (SELECT 1 FROM public.system_settings WHERE setting_key = obj)
    WHEN 'unique_col' THEN EXISTS (
      SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = to_regclass('public.' || obj) AND i.indisunique AND i.indnatts = 1 AND a.attname = sub)
    WHEN 'unique_cols' THEN EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = to_regclass('public.' || obj) AND i.indisunique
        AND (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
             FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) = sub)
  END AS present
FROM exp
ORDER BY grp, kind, obj, sub;
