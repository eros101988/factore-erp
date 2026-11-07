-- T005 reverse script for migration 0008. RUN ONLY ON OWNER APPROVAL (Phase R, T020).
-- Precondition: 0009 and 0010 are NOT applied (run R-0010 / R-0009 first if they are).
-- One transaction (DO block). Aborts without changing anything if any B2 data exists.
DO $r0008$
BEGIN
  IF to_regprocedure('public.publish_supplier_price_list(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.publish_supplier_price_list(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'R-0008 aborted: run R-0010/R-0009 first (publish function still present)';
  END IF;
  IF to_regclass('public.supplier_price_list_items') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.supplier_price_list_items) THEN
    RAISE EXCEPTION 'R-0008 aborted: supplier_price_list_items has rows';
  END IF;
  IF to_regclass('public.supplier_price_lists') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.supplier_price_lists) THEN
    RAISE EXCEPTION 'R-0008 aborted: supplier_price_lists has rows';
  END IF;
  IF to_regclass('public.pricing_policies') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.pricing_policies WHERE created_by IS NOT NULL OR tier NOT IN ('small','medium','large')) THEN
    RAISE EXCEPTION 'R-0008 aborted: pricing_policies has non-seed rows';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'purchase_cost_history' AND column_name = 'source_price_list_id') THEN
    EXECUTE 'DO $x$ BEGIN IF EXISTS (SELECT 1 FROM public.purchase_cost_history WHERE source_price_list_id IS NOT NULL OR pack_cost IS NOT NULL)
             THEN RAISE EXCEPTION ''R-0008 aborted: purchase_cost_history has B2 cost rows''; END IF; END $x$';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'quotes' AND column_name = 'pricing_policy_id') THEN
    EXECUTE 'DO $x$ BEGIN IF EXISTS (SELECT 1 FROM public.quotes WHERE pricing_policy_id IS NOT NULL)
             OR EXISTS (SELECT 1 FROM public.quote_items WHERE supplier_id IS NOT NULL OR supplier_sku IS NOT NULL
                        OR cost_source_type IS NOT NULL OR cost_source_id IS NOT NULL)
             THEN RAISE EXCEPTION ''R-0008 aborted: quotes reference B2 columns''; END IF; END $x$';
  END IF;

  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS cost_source_id;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS cost_source_type;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS supplier_sku;
  ALTER TABLE public.quote_items DROP COLUMN IF EXISTS supplier_id;
  ALTER TABLE public.quotes DROP COLUMN IF EXISTS pricing_policy_id;
  ALTER TABLE public.purchase_cost_history DROP COLUMN IF EXISTS pack_cost;
  ALTER TABLE public.purchase_cost_history DROP COLUMN IF EXISTS source_price_list_item_id;
  ALTER TABLE public.purchase_cost_history DROP COLUMN IF EXISTS source_price_list_id;
  DROP TABLE IF EXISTS public.supplier_price_list_items;   -- its policies go with it
  DROP TABLE IF EXISTS public.supplier_price_lists;
  DROP TABLE IF EXISTS public.pricing_policies;

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE $q$DELETE FROM supabase_migrations.schema_migrations WHERE name = 'b2_0008_pricing_foundation'$q$;
  END IF;
END
$r0008$;
