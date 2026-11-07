# T007 apply + T008 containment verification (G2) - 2026-11-08 00:13 (Asia/Taipei)
Project: factory erp (mdyldmshwapikwnhlkvs). Owner approval: rollout-record.md "T006 Owner approval".

## T007 apply
MCP apply_migration name=0009a_revoke_legacy_publish.sql, content = main blob cc9632f1 (verified before apply) -> {"success":true}
Statement: REVOKE EXECUTE ON FUNCTION public.publish_supplier_price_list(uuid, uuid) FROM PUBLIC, anon, authenticated;

## T008 results
| ID | Check | Observed | Result |
|---|---|---|---|
| C-01 | has_function_privilege EXECUTE | anon=false, authenticated=false, public=false (service_role=true, accepted) | PASS |
| C-02 | proacl | before {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} -> after {postgres=X/postgres,service_role=X/postgres} | PASS |
| C-03 | call attempt (forced rollback) | anon: 42501 permission denied for function publish_supplier_price_list; authenticated (admin subject as p_user_id): 42501 permission denied | PASS |
| C-04 | inventory + history | policies, functions_excl_legacy_acl, constraints, indexes, columns, table_privileges md5 all identical to T005; function count 9; legacy function still exists (def md5 061467fe unchanged); list_migrations: 0009a_revoke_legacy_publish.sql (20261107161231) right after 0009 | PASS |
| C-05 | row counts | identical to T005 snapshot (all 23 entries); re-check after C-03 probe: audit_logs 0, purchase_cost_history 4, supplier_price_lists 0 | PASS |
| C-06 | usage | audit PUBLISH_PRICE_LIST 0, cost rows from price lists 0, price lists 0 (same as snapshot) | PASS |

**Gate G2: PASS (6/6). Containment complete; impersonation entry point closed for anon/authenticated/PUBLIC.**
Not done (out of scope of this approval): 0009b, 0010, any other migration, any data change, any recovery.
