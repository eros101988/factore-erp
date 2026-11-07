-- R-0009b: reversal of 0009b. RUN ONLY ON OWNER APPROVAL (tasks Phase R, T021/T022).
-- GENERATED at T011 (2026-11-08, Asia/Taipei) from the Live pre-0009b catalog (project mdyldmshwapikwnhlkvs):
-- the 21 user_profiles/B1/B2 policies (pg_policies) and the 2 helper definitions (pg_get_functiondef), verbatim.
-- WARNING: this restores the RECURSIVE policies (spec F3/F4). Use only if 0009b itself is unsafe (fail-open);
-- otherwise fix forward (plan Risk R3).
BEGIN;

DROP POLICY IF EXISTS "Admin can do all on customers" ON public.customers;
CREATE POLICY "Admin can do all on customers" ON public.customers AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'admin'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Staff can view customers" ON public.customers;
CREATE POLICY "Staff can view customers" ON public.customers AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'staff'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Admin can do all on historical_purchases" ON public.historical_purchases;
CREATE POLICY "Admin can do all on historical_purchases" ON public.historical_purchases AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'admin'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Staff can view historical_purchases" ON public.historical_purchases;
CREATE POLICY "Staff can view historical_purchases" ON public.historical_purchases AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'staff'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Admin can do all on historical_sales" ON public.historical_sales;
CREATE POLICY "Admin can do all on historical_sales" ON public.historical_sales AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'admin'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Staff can view historical_sales" ON public.historical_sales;
CREATE POLICY "Staff can view historical_sales" ON public.historical_sales AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'staff'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Admin can do all on import_batches" ON public.import_batches;
CREATE POLICY "Admin can do all on import_batches" ON public.import_batches AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'admin'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Staff can view import_batches" ON public.import_batches;
CREATE POLICY "Staff can view import_batches" ON public.import_batches AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'staff'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Admin can do all on import_staging_rows" ON public.import_staging_rows;
CREATE POLICY "Admin can do all on import_staging_rows" ON public.import_staging_rows AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'admin'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Staff can view import_staging_rows" ON public.import_staging_rows;
CREATE POLICY "Staff can view import_staging_rows" ON public.import_staging_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'staff'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Admin can do all on pricing_policies" ON public.pricing_policies;
CREATE POLICY "Admin can do all on pricing_policies" ON public.pricing_policies AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'admin'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Staff can view pricing_policies" ON public.pricing_policies;
CREATE POLICY "Staff can view pricing_policies" ON public.pricing_policies AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'staff'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Admin can do all on product_external_mappings" ON public.product_external_mappings;
CREATE POLICY "Admin can do all on product_external_mappings" ON public.product_external_mappings AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'admin'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Staff can view product_external_mappings" ON public.product_external_mappings;
CREATE POLICY "Staff can view product_external_mappings" ON public.product_external_mappings AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'staff'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Admin can do all on supplier_price_list_items" ON public.supplier_price_list_items;
CREATE POLICY "Admin can do all on supplier_price_list_items" ON public.supplier_price_list_items AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'admin'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Staff can view supplier_price_list_items" ON public.supplier_price_list_items;
CREATE POLICY "Staff can view supplier_price_list_items" ON public.supplier_price_list_items AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'staff'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Admin can do all on supplier_price_lists" ON public.supplier_price_lists;
CREATE POLICY "Admin can do all on supplier_price_lists" ON public.supplier_price_lists AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'admin'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Staff can view supplier_price_lists" ON public.supplier_price_lists;
CREATE POLICY "Staff can view supplier_price_lists" ON public.supplier_price_lists AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (((user_profiles.role)::text = 'staff'::text) AND (user_profiles.is_active = true)))));
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;
CREATE POLICY "Admins can read all profiles" ON public.user_profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IN ( SELECT user_profiles_1.id
   FROM user_profiles user_profiles_1
  WHERE ((user_profiles_1.role)::text = 'admin'::text))));
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
CREATE POLICY "Admins can update all profiles" ON public.user_profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IN ( SELECT user_profiles_1.id
   FROM user_profiles user_profiles_1
  WHERE ((user_profiles_1.role)::text = 'admin'::text))));
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
CREATE POLICY "Users can read own profile" ON public.user_profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
CREATE OR REPLACE FUNCTION public.is_active_user()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_active = true
  );
$function$;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$function$;

DO $hist$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE $q$DELETE FROM supabase_migrations.schema_migrations WHERE name = '0009b_fix_rls_recursion.sql'$q$;
  END IF;
END
$hist$;

COMMIT;
