-- R-0009a: reversal of 0009a. RUN ONLY ON OWNER APPROVAL (tasks Phase R, T019).
-- Restores EXECUTE on the legacy two-argument publish function to exactly the grantees that held it
-- before containment.
-- FINALIZED at T005 (2026-11-07, Asia/Taipei) from the Live proacl snapshot:
--   pre-containment proacl = {=X/postgres, postgres=X/postgres, anon=X/postgres,
--                             authenticated=X/postgres, service_role=X/postgres}
--   0009a removes =X (PUBLIC), anon=X, authenticated=X; postgres and service_role are untouched.
-- Verified locally (tests/security_rls_matrix.test.ts): after this script the ACL equals post-0009 exactly.
-- Note: re-opening this grant re-exposes the impersonation risk (spec F2). Use only if containment itself is wrong.
GRANT EXECUTE ON FUNCTION public.publish_supplier_price_list(uuid, uuid) TO PUBLIC, anon, authenticated;
