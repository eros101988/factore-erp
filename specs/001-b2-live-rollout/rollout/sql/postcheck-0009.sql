-- T003 / contracts/verification-result.md §A-0009. READ-ONLY. Returns (id, result, detail).
-- A-0009-02 (no count change; history entry) is evaluated with baseline-counts.sql + MCP list_migrations.
SELECT 'A-0009-01' AS id,
       CASE WHEN to_regprocedure('public.publish_supplier_price_list(uuid,uuid)') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS result,
       'publish_supplier_price_list(uuid, uuid) present (transient until 0010; risk R1)' AS detail;
