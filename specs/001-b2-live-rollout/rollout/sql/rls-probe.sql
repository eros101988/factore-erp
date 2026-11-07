-- T003 (preflight addendum): READ-ONLY RLS probe. Writes nothing; ends with a forced rollback.
-- Why: in repo migration 0002, the user_profiles policy "Admins can read all profiles" queries
-- user_profiles inside its own policy. In Postgres that is "infinite recursion detected in policy".
-- Every B1/B2 policy of the form auth.uid() IN (SELECT id FROM user_profiles ...) inherits it,
-- as do the app's profile/role lookups. The PGlite dry-run reproduces it. The S1.6 report marks
-- 0002 "NOT TESTED" on Live, so the Live behaviour must be observed, not assumed.
-- Runs as role authenticated with the test subject's UUID (__ADMIN_ID__) via transaction-local claims.
DO $probe$
DECLARE
  v_res jsonb := '{}'::jsonb;
  v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '__ADMIN_ID__', 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '__ADMIN_ID__', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_n FROM public.user_profiles;
    v_res := v_res || jsonb_build_object('user_profiles_read', 'OK rows=' || v_n);
  EXCEPTION WHEN OTHERS THEN v_res := v_res || jsonb_build_object('user_profiles_read', 'ERROR: ' || SQLERRM);
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.product_external_mappings;   -- B1 table using the same policy pattern
    v_res := v_res || jsonb_build_object('b1_policy_table_read', 'OK rows=' || v_n);
  EXCEPTION WHEN OTHERS THEN v_res := v_res || jsonb_build_object('b1_policy_table_read', 'ERROR: ' || SQLERRM);
  END;
  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'B2_PROBE_RESULT %', v_res::text;
END
$probe$;
