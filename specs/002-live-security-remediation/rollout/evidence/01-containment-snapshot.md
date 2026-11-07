# T005 Live read-only pre-containment snapshot - 2026-11-07 23:51 (Asia/Taipei)
Project: factory erp (mdyldmshwapikwnhlkvs). Only catalog SELECTs, counts, and one forced-rollback read-only probe. No writes.

## F1-F6 re-confirmed
- F1 list_migrations: 0001, 0002 (x2), 0003-0007, 0008_b2_pricing_foundation.sql (20261107104621), 0009_b2_publish_rpc.sql (20261107104850); 0010 absent - unchanged.
- F2 legacy function public.publish_supplier_price_list(uuid,uuid): SECURITY DEFINER, owner postgres, def md5 061467fe96803b2f43181b8409611e75;
  EXECUTE anon=true, authenticated=true, PUBLIC=true, service_role=true. One-argument version absent.
- F3 user_profiles policies: "Admins can read all profiles" (SELECT) and "Admins can update all profiles" (UPDATE) self-reference user_profiles; "Users can read own profile" does not.
- F4 probe as authenticated test subject: user_profiles, product_external_mappings (B1), pricing_policies (B2) -> infinite recursion.
- F5 S1 products -> OK 3; is_admin()/is_active_user(): SECURITY DEFINER, search_path=public (def md5 456bcac3... / 1f44c7b4...).

## Current ACL (raw proacl)
{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}

## Usage check (C-06 baseline) - legacy function use found: NO
audit_logs PUBLISH_PRICE_LIST = 0; audit_logs total = 0; purchase_cost_history with source_price_list_id = 0;
supplier_price_lists published = 0; supplier_price_lists total = 0

## Row counts (pre-containment)
auth.users 1, audit_logs 0, channel_fee_rules 1, customers 0, historical_purchases 0, historical_sales 0, import_batches 1,
import_staging_rows 0, pricing_policies 3, product_external_mappings 0, products 3, purchase_cost_history 4, quote_items 0,
quotes 0, sales_channels 2, supplier_price_list_items 0, supplier_price_lists 0, supplier_product_mappings 0, suppliers 0,
system_settings 2, tier_policies 3, user_profiles 1, storage.buckets 0

## Inventory fingerprints (md5)
policies adace9bcd55aea94ea917012d68b6ef8 (48 policies in public+storage)
functions 5f0289ac9ee1f0021d0d512d537d6332 (9 public functions, incl. sorted ACL)
functions_excl_legacy_acl dba4f319da5de3ffe723fa96771a751f   <- must be unchanged after 0009a (only the legacy ACL may change)
constraints fa2639bb99f53316d2ab7a59a21572e0
indexes 72378d176baf2bc7cf228bcd308f4541
columns fab55feac1f0749a32df041f65c5d382
table_privileges 241a7cf6e3637aa7869f36a5532df9c2

## Read-only proof
Recheck after all probes: counts identical; policies/functions/table_privileges md5 identical. Live changed: NO.

## R-0009a finalized
Grantees confirmed against Live: GRANT EXECUTE ... TO PUBLIC, anon, authenticated (postgres/service_role never revoked).
T005 RESULT: PASS
