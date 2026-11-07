-- 0009a: containment of the legacy two-argument publish function (spec 002, FR-001..005, plan Decision 1).
-- publish_supplier_price_list(uuid, uuid) is SECURITY DEFINER and trusts the caller-supplied p_user_id.
-- Supabase grants EXECUTE on public functions to anon/authenticated explicitly, so PUBLIC alone is not enough.
-- ACL-only change: no data, policy, helper or other function is touched. The function is dropped by 0010.
-- Reversal: specs/002-live-security-remediation/rollout/recovery/R-0009a.sql
REVOKE EXECUTE ON FUNCTION public.publish_supplier_price_list(uuid, uuid) FROM PUBLIC, anon, authenticated;
