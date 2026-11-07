# Contract: Verification Matrix

Results are PASS, FAIL, NOT TESTED, or BLOCKED, each with evidence. **NOT TESTED / BLOCKED / SKIPPED never count as PASS.**

## §L Local (PGlite, `tests/security_rls_matrix.test.ts`); blocking before G3

| ID | Check |
|---|---|
| L-01 | A fresh replay 0001 → 0009b succeeds; the full access-model matrix matches, with 0 recursion errors |
| L-02 | Replay continued through 0010: the matrix still matches; the `user_profiles`, B1, and B2 policy definitions are identical to their post-0009b form; the two-argument function is absent |
| L-03 | A Live-like replay (0001 → 0009, then 0009a, then 0009b) equals the fresh replay object by object (policies, function definitions and ACLs, constraints) |
| L-04 | After 0009a alone: the two-argument function is not executable by anon, authenticated, or PUBLIC; nothing else differs from post-0009 |
| L-05 | The existing suite (`npx vitest run`) still passes |

## §C Live containment (after 0009a); must all PASS before anything else

| ID | Check |
|---|---|
| C-01 | `has_function_privilege` for `anon`, `authenticated`, and `public` on `publish_supplier_price_list(uuid,uuid)` is false |
| C-02 | `proacl` contains no `=X` (PUBLIC), `anon=X`, or `authenticated=X` entries; the remaining grantees are recorded |
| C-03 | Forced-rollback call attempts as anon and as authenticated (any `p_user_id`) → "permission denied for function" |
| C-04 | Inventory is unchanged apart from the ACL; `list_migrations` shows `0009a_revoke_legacy_publish.sql` right after 0009 |
| C-05 | Row counts are identical to the pre-containment snapshot |
| C-06 | Usage check: `PUBLISH_PRICE_LIST` audit rows = 0 and cost rows with a `source_price_list_id` = 0 (same as the snapshot). Non-zero → STOP and report |

## §M Live matrix (after 0009b); forced-rollback transactions, no Auth users

| ID | Check |
|---|---|
| M-01…M-05 | Each role A/S/I/N/X against every row of contracts/access-model.md. One result per role × object × action cell. |
| M-06 | 0 recursion errors in any cell |
| M-07 | Helper definitions show `SET search_path TO ''` and qualified table names; results match the access model |
| M-08 | `list_migrations` shows `0009b_fix_profile_rls_recursion.sql` right after 0009a |

## §R Reconciliation

| ID | Check |
|---|---|
| R-01 | Non-test row counts are identical to the pre-0009b snapshot (and to pre-0009a) |
| R-02 | 0 test-marker rows (`[TEST]`, `TEST-`, year ≥ 2099) in any table; the test subject's profile is unchanged |
| R-03 | `get_advisors` diff: no new security ERROR; new WARNs are listed as advisory |

## §S App smoke (deployed app, read-only)

| ID | Check |
|---|---|
| S-01 | An active admin signs in and the layout shows admin navigation (role lookup works) |
| S-02 | An admin opens `/costs` and `/settings/pricing-policy` with no permission or database error |

If §S can't be performed, it is NOT TESTED with a reason, and the result is INCOMPLETE.

## Verdict

- **BLOCKED**: stopped before 0009a, or at G3 before 0009b.
- **FAIL**: any FAIL, migration error, or residue/count mismatch.
- **INCOMPLETE**: no FAIL, but a required item is NOT TESTED or BLOCKED.
- **PASS**: every required item is PASS.

The summary shows the PASS, FAIL, NOT TESTED, and BLOCKED counts separately.
