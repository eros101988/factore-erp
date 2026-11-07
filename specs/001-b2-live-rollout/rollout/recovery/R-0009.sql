-- T005 reverse script for migration 0009. RUN ONLY ON OWNER APPROVAL (Phase R, T021/T022/T023).
-- Removes the transient two-argument SECURITY DEFINER publish function (risk R1). One transaction.
-- Safe to run whether or not 0010 is applied (0010 already drops this signature).
DO $r0009$
BEGIN
  DROP FUNCTION IF EXISTS public.publish_supplier_price_list(uuid, uuid);
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE $q$DELETE FROM supabase_migrations.schema_migrations WHERE name = 'b2_0009_publish_rpc'$q$;
  END IF;
END
$r0009$;
