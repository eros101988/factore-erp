-- T003: row counts for every public table + B2 bucket objects + buckets + auth.users (count only). READ-ONLY.
-- Returns one JSON object {name: count}; compared before/after every Live step.
SELECT json_object_agg(name, n ORDER BY name) AS counts
FROM (
  SELECT 'public.' || tablename AS name,
         substring(query_to_xml(format('SELECT count(*) AS c FROM public.%I', tablename), false, true, '')::text
                   FROM '<c>(\d+)</c>')::bigint AS n
  FROM pg_tables
  WHERE schemaname = 'public'
  UNION ALL
  SELECT 'storage.objects[supplier-price-lists]', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'supplier-price-lists')
  UNION ALL
  SELECT 'storage.buckets', (SELECT count(*) FROM storage.buckets)
  UNION ALL
  SELECT 'auth.users', (SELECT count(*) FROM auth.users)
) s;
