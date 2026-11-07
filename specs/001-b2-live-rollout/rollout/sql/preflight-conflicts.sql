-- T003 / contracts/inspection-report.md "Conflict scan". READ-ONLY.
-- Tables that may not exist yet are queried through query_to_xml so the statement still parses;
-- such checks return NULL (= table absent, not applicable).
-- Expected for READY: every rows_found is 0 or NULL (bucket_objects is informational).
WITH q(check_id, applies, sql) AS (VALUES
  ('pem_duplicate_supplier_code', true,
   $$SELECT count(*) AS c FROM (SELECT 1 FROM public.product_external_mappings
       GROUP BY source_type, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), external_code
       HAVING count(*) > 1) d$$),
  ('pem_status_outside_allowed', true,
   $$SELECT count(*) AS c FROM public.product_external_mappings
     WHERE status IS NULL OR status NOT IN ('suggested','confirmed','rejected')$$),
  ('pricing_policies_more_than_one_open_per_tier', to_regclass('public.pricing_policies') IS NOT NULL,
   $$SELECT count(*) AS c FROM (SELECT tier FROM public.pricing_policies
       WHERE is_active AND effective_to IS NULL GROUP BY tier HAVING count(*) > 1) d$$),
  ('pricing_policies_tier_outside_allowed', to_regclass('public.pricing_policies') IS NOT NULL,
   $$SELECT count(*) AS c FROM public.pricing_policies WHERE tier NOT IN ('small','medium','large')$$),
  ('pricing_policies_margin_out_of_range', to_regclass('public.pricing_policies') IS NOT NULL,
   $$SELECT count(*) AS c FROM public.pricing_policies
     WHERE default_margin < 0 OR default_margin >= 1
        OR (minimum_margin IS NOT NULL AND (minimum_margin < 0 OR minimum_margin > default_margin))$$),
  ('pricing_policies_existing_rows', to_regclass('public.pricing_policies') IS NOT NULL,
   $$SELECT count(*) AS c FROM public.pricing_policies$$),
  ('supplier_price_lists_status_outside_allowed', to_regclass('public.supplier_price_lists') IS NOT NULL,
   $$SELECT count(*) AS c FROM public.supplier_price_lists
     WHERE status IS NULL OR status NOT IN ('draft','parsed','needs_review','ready','published','rejected')$$),
  ('supplier_price_lists_existing_rows', to_regclass('public.supplier_price_lists') IS NOT NULL,
   $$SELECT count(*) AS c FROM public.supplier_price_lists$$),
  ('supplier_price_list_items_existing_rows', to_regclass('public.supplier_price_list_items') IS NOT NULL,
   $$SELECT count(*) AS c FROM public.supplier_price_list_items$$),
  ('bucket_objects_informational', true,
   $$SELECT count(*) AS c FROM storage.objects WHERE bucket_id = 'supplier-price-lists'$$)
)
SELECT check_id,
  CASE WHEN applies
       THEN substring(query_to_xml(sql, false, true, '')::text FROM '<c>(\d+)</c>')::bigint
  END AS rows_found
FROM q
ORDER BY check_id;
