-- 0009b: permanent fix for the user_profiles RLS recursion (spec 002 FR-006..011, plan Decision 3, D-2).
-- Root cause (repo 0002 == Live): user_profiles policies query user_profiles inside their own policy, and every
-- B1/B2 policy of the form auth.uid() IN (SELECT id FROM user_profiles ...) inherits the recursion.
-- Fix: role checks go through the SECURITY DEFINER helpers, whose internal read bypasses user_profiles RLS.
-- Access model is unchanged (contracts/access-model.md): admin = all; active staff = read; inactive/non-member/anon = nothing.
-- Touches only: 2 helpers, 3 user_profiles policies, 12 B1 policies, 6 B2 policies. No data, no S1 policy, no auth.users.
-- Reversal: specs/002-live-security-remediation/rollout/recovery/R-0009b.sql (generated from the Live snapshot).

-- 1. Helpers: same results; hardened (empty search_path + qualified names closes pg_temp shadowing), STABLE.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_active = true
  );
$$;

-- 2. user_profiles: no policy queries user_profiles directly any more.
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
CREATE POLICY "Users can read own profile" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;
CREATE POLICY "Admins can read all profiles" ON public.user_profiles
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
CREATE POLICY "Admins can update all profiles" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- 3. B1 (0005, 0007) and B2 (0008) tables: same policy names; admin ALL gets an explicit WITH CHECK.
DO $policies$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'import_batches', 'customers', 'historical_sales', 'historical_purchases',
    'product_external_mappings', 'import_staging_rows',
    'pricing_policies', 'supplier_price_lists', 'supplier_price_list_items'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admin can do all on ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()))',
      'Admin can do all on ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Staff can view ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.is_active_user()))',
      'Staff can view ' || t, t);
  END LOOP;
END
$policies$;
