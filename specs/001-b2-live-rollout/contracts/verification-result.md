# Contract: Verification Results

Every item reports `PASS | FAIL | NOT TESTED`, with evidence. All items are required unless marked *(advisory)*.

## §A Post-checks (read-only, after each migration)

### A-0008
| ID | Check |
|---|---|
| A-0008-01 | 3 new tables exist, with the expected columns and types |
| A-0008-02 | New columns exist on `purchase_cost_history`, `quotes`, and `quote_items` |
| A-0008-03 | `pricing_policies` holds exactly the 3 seeded tiers (or the pre-existing rows unchanged) |
| A-0008-04 | `relrowsecurity = true` on all 3 new tables; 6 named policies present |
| A-0008-05 | Non-B2 baseline counts unchanged; `list_migrations` has the `b2_0008_*` entry |

### A-0009
| ID | Check |
|---|---|
| A-0009-01 | `publish_supplier_price_list(uuid, uuid)` exists |
| A-0009-02 | Counts unchanged; `b2_0009_*` history entry present |

### A-0010
| ID | Check |
|---|---|
| A-0010-01 | `publish_supplier_price_list(uuid, uuid)` absent; `(uuid)` present, returns integer |
| A-0010-02 | `has_function_privilege('anon', …, 'EXECUTE') = false` for both new functions; `authenticated` = true |
| A-0010-03 | Trigger `trg_purchase_cost_history_append_only` present and enabled |
| A-0010-04 | All 0010 constraints and indexes present; the old unique constraints dropped |
| A-0010-05 | `quote_items` snapshot columns present |
| A-0010-06 | Setting `cost_change_warning_threshold` = 0.30 |
| A-0010-07 | Bucket `supplier-price-lists` exists and is private; storage policy present; pre-existing objects count unchanged |
| A-0010-08 | `has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE')` true for the 3 new tables; `anon` returns no rows under RLS |
| A-0010-09 | Counts reconcile (only the expected seed deltas); `b2_0010_*` history entry present |

## §B Behavioral checks (Live, `[TEST]` data, one rolled-back transaction each)

Identities follow research R-4:
- **admin** = the existing test subject;
- **staff** = the same subject, with its role changed transaction-locally;
- **non-member** = a synthetic UUID;
- **anon** = role `anon`.

No Auth user is created. If the test subject is unavailable, the admin/staff rows below are **BLOCKED / NOT TESTED**.

| ID | Scenario | Expected |
|---|---|---|
| B-01 | `[TEST]` list with 1 unmapped row, publish as `[TEST]` admin | Refused (`PUBLISH_BLOCKED … unmapped`); 0 cost rows written |
| B-02 | List with an invalid-cost / error row | Refused; 0 cost rows |
| B-03 | List with an explicitly ignored error row plus 1 valid row | Publishes 1 row |
| B-04 | Pre-existing history row on item 2 forces a mid-publish unique violation | Refused; 0 cost rows, 0 mappings, 0 audit rows from the attempt; list status unchanged |
| B-05 | Publish 2099-11 (36.6 × 40) then 2099-12 (38 × 40) | `pack_cost` 1464.0000 and 1520.0000; both rows kept; mapping remembered |
| B-06 | UPDATE a published `[TEST]` cost row (as admin and as postgres) | Refused (append-only) |
| B-07 | Re-publish an already published list | Refused |
| B-08 | Effective cost at 2099-10-31 / 2099-11-15 / 2099-11-30 / 2099-12-01 | COST_NOT_FOUND / 1464 / 1464 / 1520 (no future cost) |
| B-09a | Non-member (synthetic UUID, no profile) calls publish and `set_pricing_policy` | Both refused (fail closed) |
| B-09b | Staff (test subject with its role set to `staff` transaction-locally) calls publish and `set_pricing_policy` | Both refused |
| B-10 | `[TEST]` admin `set_pricing_policy('medium', …)` | New active version; old one closed; exactly 1 open row per tier |
| B-11 | RLS: staff selects from the new tables (OK) and inserts (refused); anon selects (0 rows/denied) | As stated |
| B-12 | Pre-existing B1 `purchase_cost_history` rows (no `source_price_list_id`) | Count unchanged; never returned as an effective cost |

## §C Cleanup & reconciliation

| ID | Check |
|---|---|
| C-01 | 0 rows matching `[TEST]` / `TEST-` / year ≥ 2099 test markers in every B2 table and in `suppliers`, `products`, `audit_logs`, `quotes`, `quote_items`, `product_external_mappings`. The test subject's `user_profiles` row is unchanged (role/is_active as in preflight). The `auth.users` count is unchanged. |
| C-02 | Every non-test count equals the baseline plus the expected seed deltas (research R-7) |
| C-03 | `get_advisors`: no new security ERROR attributable to B2 objects (new WARN = *(advisory)*) |

## §S App smoke (deployed app, read-only)

| ID | Check |
|---|---|
| S-01 | Admin opens `/costs`: no database error |
| S-02 | Admin opens `/settings/pricing-policy`: three tiers shown at 25/20/15% |
| S-03 | Quote page, product with no cost: shows 「此商品尚無有效成本，請先建立本月供應商成本。」, and no price is computed |

If nobody can perform §S, it is reported NOT TESTED, which makes the overall result INCOMPLETE, never PASS.

## Result file format (`rollout/evidence/verification.json`)

```json
{ "items": [ { "id": "B-05", "required": true, "result": "PASS", "reason": null, "evidence_ref": "evidence/B-05.txt" } ],
  "summary": { "pass": 0, "fail": 0, "not_tested": 0 },
  "verdict": "PASS | FAIL | BLOCKED | INCOMPLETE" }
```
