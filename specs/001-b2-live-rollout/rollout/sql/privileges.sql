-- T003: Data API exposure + function privileges. READ-ONLY.
-- Part 1: default privileges that new tables/functions in schema public will receive.
-- Part 2: actual privileges on B2 tables/functions (NULL = object absent).
SELECT 'default_acl' AS kind,
       pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text AS name,
       d.defaclacl::text AS detail
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public'
UNION ALL
SELECT 'table_priv', r.role || ' on ' || t.tbl,
  CASE WHEN to_regclass('public.' || t.tbl) IS NULL THEN NULL
       ELSE concat_ws(',',
         CASE WHEN has_table_privilege(r.role, 'public.' || t.tbl, 'SELECT') THEN 'SELECT' END,
         CASE WHEN has_table_privilege(r.role, 'public.' || t.tbl, 'INSERT') THEN 'INSERT' END,
         CASE WHEN has_table_privilege(r.role, 'public.' || t.tbl, 'UPDATE') THEN 'UPDATE' END,
         CASE WHEN has_table_privilege(r.role, 'public.' || t.tbl, 'DELETE') THEN 'DELETE' END)
  END
FROM (VALUES ('pricing_policies'), ('supplier_price_lists'), ('supplier_price_list_items')) t(tbl)
CROSS JOIN (VALUES ('authenticated'), ('anon')) r(role)
UNION ALL
SELECT 'function_exec', r.role || ' on ' || f.sig,
  CASE WHEN to_regprocedure(f.sig) IS NULL THEN NULL
       ELSE has_function_privilege(r.role, f.sig, 'EXECUTE')::text END
FROM (VALUES ('public.publish_supplier_price_list(uuid,uuid)'),
             ('public.publish_supplier_price_list(uuid)'),
             ('public.set_pricing_policy(text,numeric,numeric)')) f(sig)
CROSS JOIN (VALUES ('authenticated'), ('anon')) r(role)
ORDER BY 1, 2;
