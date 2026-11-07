-- T005 reverse script for migration 0010. RUN ONLY ON OWNER APPROVAL (Phase R, T022/T023).
-- Result: the post-0008 state (run R-0009 as well to remove the two-argument function if it exists).
-- One transaction. Aborts if any B2 data exists.
-- NOT reversible here (documented in recovery-runbook.md):
--   * the 0010 UPDATE of supplier_price_lists.status (expected to affect 0 rows on an empty table);
--   * the storage bucket row: Supabase blocks direct SQL deletes on storage tables, so an empty
--     'supplier-price-lists' bucket is removed via Dashboard > Storage (or the Storage API) if required.
DO $r0010$
BEGIN
  IF to_regclass('public.supplier_price_list_items') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.supplier_price_list_items) THEN
    RAISE EXCEPTION 'R-0010 aborted: supplier_price_list_items has rows';
  END IF;
  IF to_regclass('public.supplier_price_lists') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.supplier_price_lists) THEN
    RAISE EXCEPTION 'R-0010 aborted: supplier_price_lists has rows';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'supplier-price-lists') THEN
    RAISE EXCEPTION 'R-0010 aborted: bucket supplier-price-lists has objects';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'purchase_cost_history' AND column_name = 'source_price_list_id') THEN
    EXECUTE 'DO $x$ BEGIN IF EXISTS (SELECT 1 FROM public.purchase_cost_history WHERE source_price_list_id IS NOT NULL)
             THEN RAISE EXCEPTION ''R-0010 aborted: purchase_cost_history has published B2 rows''; END IF; END $x$';
  END IF;

  -- functions / trigger
  DROP TRIGGER IF EXISTS trg_purchase_cost_history_append_only ON public.purchase_cost_history;
  DROP FUNCTION IF EXISTS public.purchase_cost_history_append_only();
  DROP FUNCTION IF EXISTS public.set_pricing_policy(text, numeric, numeric);
  DROP FUNCTION IF EXISTS public.publish_supplier_price_list(uuid);

  -- storage policy + setting
  DROP POLICY IF EXISTS "Admins manage supplier price list files" ON storage.objects;
  DELETE FROM public.system_settings WHERE setting_key = 'cost_change_warning_threshold';

  -- indexes
  DROP INDEX IF EXISTS public.pch_source_item_unique;
  DROP INDEX IF EXISTS public.pch_product_effective_idx;
  DROP INDEX IF EXISTS public.product_external_mappings_src_supplier_code;
  DROP INDEX IF EXISTS public.spli_price_list_idx;
  DROP INDEX IF EXISTS public.pricing_policies_one_open_per_tier;

  -- check constraints
  ALTER TABLE public.pricing_policies DROP CONSTRAINT IF EXISTS pricing_policies_margin_range;
  ALTER TABLE public.pricing_policies DROP CONSTRAINT IF EXISTS pricing_policies_tier_values;
  ALTER TABLE public.supplier_price_lists DROP CONSTRAINT IF EXISTS supplier_price_lists_status_values;
  ALTER TABLE public.supplier_price_list_items DROP CONSTRAINT IF EXISTS spli_row_status_values;
  ALTER TABLE public.supplier_price_list_items DROP CONSTRAINT IF EXISTS spli_mapping_status_values;
  ALTER TABLE public.product_external_mappings DROP CONSTRAINT IF EXISTS pem_status_values;

  -- columns
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS supplier_name;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS cost_unit;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS source_price_list_id;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS pricing_policy_id;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS pricing_tier;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS default_margin;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS suggested_price;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS gross_profit;
  ALTER TABLE public.supplier_price_list_items DROP COLUMN IF EXISTS row_status;
  ALTER TABLE public.supplier_price_list_items DROP COLUMN IF EXISTS error_message;
  ALTER TABLE public.supplier_price_list_items DROP COLUMN IF EXISTS reviewed_by;
  ALTER TABLE public.supplier_price_list_items DROP COLUMN IF EXISTS reviewed_at;
  ALTER TABLE public.supplier_price_list_items ALTER COLUMN unit_cost SET NOT NULL;   -- table is empty (checked above)
  ALTER TABLE public.supplier_price_lists DROP COLUMN IF EXISTS storage_path;

  -- restore the uniqueness rules 0010 dropped (only if current data allows it)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_policies_tier_key') THEN
    IF EXISTS (SELECT tier FROM public.pricing_policies GROUP BY tier HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'R-0010 aborted: duplicate pricing_policies tiers prevent restoring pricing_policies_tier_key';
    END IF;
    ALTER TABLE public.pricing_policies ADD CONSTRAINT pricing_policies_tier_key UNIQUE (tier);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_external_mappings_source_type_external_code_key') THEN
    IF EXISTS (SELECT 1 FROM public.product_external_mappings GROUP BY source_type, external_code HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'R-0010 aborted: duplicate (source_type, external_code) prevents restoring the original unique key';
    END IF;
    ALTER TABLE public.product_external_mappings
      ADD CONSTRAINT product_external_mappings_source_type_external_code_key UNIQUE (source_type, external_code);
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE $q$DELETE FROM supabase_migrations.schema_migrations WHERE name = 'b2_0010_cost_integrity'$q$;
  END IF;
END
$r0010$;
