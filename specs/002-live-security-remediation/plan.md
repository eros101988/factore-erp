# Implementation Plan: Live Security Remediation

**Branch**: `002-live-security-remediation` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/002-live-security-remediation/spec.md`. Known facts F1–F6 come from the Live diagnostic (`001-b2-live-rollout` @ `88e1ed3`).

## Summary

The work happens in two separately gated Live steps, both inserted **before** the repo's unapplied 0010. No existing file is renamed.

1. **`0009a_revoke_legacy_publish.sql` (containment).** Revoke EXECUTE on the two-argument `publish_supplier_price_list(uuid, uuid)` from `PUBLIC`, `anon`, and `authenticated`. Applied alone, verified alone, and reversible with one pre-written GRANT script.
2. **`0009b_fix_profile_rls_recursion.sql` (permanent fix).** Rewrite the `user_profiles`, B1, and B2 policies to use the existing SECURITY DEFINER helpers `is_admin()` / `is_active_user()`, and harden those helpers' `search_path`. Applied only after a local five-role matrix PASS, the backup gate, and approval.

`0010_b2_cost_integrity.sql` is unchanged and stays owned by 001. It drops the two-argument function permanently.

The canonical order is `… 0008 → 0009 → 0009a → 0009b → 0010`. Live applies only `0009a`, `0009b`, and later `0010`. A fresh replay of all files reaches the identical end state, and history order equals file order from now on. Details are in [research.md](./research.md); the matrix and gates are in [contracts/](./contracts/) and [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: SQL on Supabase Postgres 17 (Live) / PGlite 0.5 (PG 18) for local replay

**Primary Dependencies**: Supabase MCP (`execute_sql` read-only + rollback probes, `apply_migration` for the two migrations, `list_migrations`, `get_advisors`); PGlite (dev dependency, already used by `tests/b2_publish_db.test.ts`)

**Storage**: Live project `mdyldmshwapikwnhlkvs`. Evidence goes in `specs/002-live-security-remediation/rollout/`. Backups stay outside the repo.

**Testing**: A local fresh replay (0001 → 0009b, and → 0010) plus the five-role matrix, run as an automated PGlite test. On Live, a forced-rollback matrix and ACL checks.

**Target Platform**: Live Supabase project + deployed web app (role lookup smoke test)

**Project Type**: Database security remediation (no application code change)

**Constraints**:
- Containment comes first and stands alone.
- No `auth.users` writes.
- No business data changes.
- Every Live write needs owner approval.
- Stop on the first failure.
- NOT TESTED / BLOCKED / SKIPPED ≠ PASS.

**Scale/Scope**:
- 1 function ACL;
- 3 `user_profiles` policies;
- 12 B1 policies (6 tables);
- 6 B2 policies (3 tables);
- 2 helper functions (hardening only).

## Constitution Check

*GATE: before Phase 0; re-checked after Phase 1.*

| Principle | Compliance | Status |
|---|---|---|
| I. Decimal money | No money logic touched. | PASS |
| II. Fail closed | Containment removes an auth bypass. New policies deny unless `is_admin()` / `is_active_user()` return true, and both require `is_active`. anon has no `sub`, so both return false. | PASS |
| III. NOT TESTED ≠ PASS | The matrix contract has PASS / FAIL / NOT TESTED / BLOCKED with separate counts, and the verdict rules forbid merging them. | PASS |
| IV. No credentials | The `pg_dump` password is typed by the owner in a terminal only. Nothing secret is written to the repo. | PASS |
| V. Append-only cost | Untouched; no cost rows written. | PASS |
| VI. Quote snapshots | Untouched. | PASS |
| VII. Quote formula | Untouched. | PASS |
| VIII. Kingcard not authority | Untouched. | PASS |
| IX. No scope creep | Only containment, the recursion fix, and helper hardening, all of which are required by FR-006/009. 0010 stays in 001. | PASS |

**Post-design re-check: 9/9 PASS.** The helper hardening only pins `search_path` and qualifies names, with identical results (FR-009). It is the security-relevant part of FR-009's "no privilege escalation".

## Project Structure

```text
specs/002-live-security-remediation/
├── spec.md, plan.md, research.md, quickstart.md
├── contracts/
│   ├── access-model.md          # expected role x object x action matrix (FR-008)
│   └── verification-matrix.md   # check catalogue, result format, verdict rules
├── rollout/                     # created by tasks/implement: record, evidence/, sql/, recovery/
└── tasks.md                     # /speckit-tasks (not now)

supabase/migrations/             # created in implement, NOT now
├── 0009a_revoke_legacy_publish.sql
└── 0009b_fix_profile_rls_recursion.sql

tests/
└── security_rls_matrix.test.ts  # created in implement: PGlite fresh replay + five-role matrix
```

**Structure Decision**: Two new migration files, one PGlite test, and rollout evidence. No application code changes and no existing migration edited or renamed.

## Decision 1: Containment = REVOKE (not DROP)

| Criterion | REVOKE EXECUTE (chosen) | DROP FUNCTION |
|---|---|---|
| Blast radius | Changes one ACL entry. The function body, dependencies, and other objects are untouched. | Removes the object. Any unknown dependent (none expected) breaks, and the definition is gone from Live. |
| Reversibility | Exact: `GRANT EXECUTE … TO <recorded grantees>`, from the pre-change `proacl` snapshot. | Needs re-creating the function from the 0009 file, plus re-granting. More steps, and drift is possible. |
| App compatibility | The app calls only the one-argument version (`src/app/actions/pricing.ts`), which doesn't exist on Live yet, so B2 publish is unavailable either way until 0010. No app regression. | Same. |
| Rollback | One GRANT statement. | A re-create from file plus GRANTs. |
| Backup needed | No full backup (FR-021 exemption: one permission, pre-written reversal). The ACL snapshot and inventory are mandatory. | Arguably yes, since it destroys a definition. |
| Fresh-replay convergence | 0010 later drops the function on both Live and fresh replay, so the end state is identical. | Also converges, but 0010's `DROP … IF EXISTS` becomes a no-op on Live only. Harmless but asymmetric. |

**Grantees to revoke:** Supabase grants functions in `public` to `anon`, `authenticated`, and `service_role` explicitly via default privileges, on top of `PUBLIC`'s implicit EXECUTE. Revoking only from `PUBLIC` would leave anon able to execute. `0009a` therefore runs `REVOKE EXECUTE ON FUNCTION public.publish_supplier_price_list(uuid, uuid) FROM PUBLIC, anon, authenticated;`.
- `service_role` and the owner keep EXECUTE. They are server-only and can't be impersonated from the browser. This is recorded as accepted.

**Proof (contracts §C):**
- `has_function_privilege` is false for `anon`, `authenticated`, and `public`.
- The `proacl` no longer lists `=X` (PUBLIC), `anon=X`, or `authenticated=X`.
- A forced-rollback call attempt as `anon` and as `authenticated` (with a synthetic admin-like `p_user_id`) returns "permission denied for function".
- Inventory and row counts are unchanged.
- Usage check: 0 `PUBLISH_PRICE_LIST` audit rows and 0 cost rows with `source_price_list_id`, both before and after.

**Containment is applied as a migration (`0009a`) through MCP `apply_migration`, not as ad-hoc SQL.** That puts it in Live history at the right position, so the containment is itself the start of the canonical sequence (research R-2).

## Decision 2: Canonical migration sequence

```text
0001 … 0007   (Live: applied)
0008_b2_pricing_foundation.sql        (Live: applied)
0009_b2_publish_rpc.sql               (Live: applied)
0009a_revoke_legacy_publish.sql       (002 step 1: containment)
0009b_fix_profile_rls_recursion.sql   (002 step 2: permanent RLS fix + helper hardening)
0010_b2_cost_integrity.sql            (001: B2 rollout, unchanged file)
```

The chosen option is **C1: lexical insertion with suffix-lettered files.** It's compared against the other options in research R-2:

| Option | Live applies | Fresh replay = Live? | History order = file order? | Touches existing files? | Verdict |
|---|---|---|---|---|---|
| A: operational REVOKE (no history) + later permanent migration | ad-hoc REVOKE, then 0010, then 0011 | End state yes, but the containment isn't in history | **No**: the RLS fix must land before 0010, but its file would sort after it | No | Rejected |
| B: renumber unapplied 0010 → 0012, insert security as 0010/0011 | 0010-sec, 0011-sec, 0012 | Yes | Yes | **Yes**: renames 0010 and breaks references in 001's spec/plan/tasks/rollout SQL, the hash map, `B2_MONTHLY_COST_REPORT.md`, and test fixtures | Viable, but more churn |
| C1: `0009a` / `0009b` sort between 0009 and 0010 (chosen) | 0009a, 0009b, then 0010 | Yes | Yes | **No** | **Chosen** |
| C2: fold the security fix into the unapplied 0010 | 0010 (combined) | Yes | Yes | Edits 0010 | Rejected: it couples urgent security with B2 schema, so containment couldn't go first alone, and it violates FR-001 |

**Why C1 is replay-safe:**
- Filenames sort lexically: `"0009_…" < "0009a_…" < "0009b_…" < "0010_…"`, because `_` (0x5F) sorts before `a` (0x61), and `9` before `1` at position 3 decides 0009x before 0010.
- The existing PGlite tests and harnesses load migrations via a sorted filename list, so they pick up the new order without code changes. This is verified by the local replay test.
- Live history versions are apply timestamps, so applying 0009a, then 0009b, then 0010 (via 001) yields history order = file order.
- **History naming convention:** Live already records names as repo filenames (e.g. `0008_b2_pricing_foundation.sql`). 002 and the resumed 001 use the exact filename as the `apply_migration` name. This supersedes 001's earlier `b2_000x_*` naming.

**0010 must not undo 002 (FR-019).** I checked the current 0010 file:
- It drops the two-argument function. That's consistent with containment.
- It creates the one-argument publish and `set_pricing_policy` with an internal `auth.uid()` admin check and `REVOKE … FROM PUBLIC, anon`.
- It adds the storage policy using `is_admin()`.
- It does **not** recreate any `user_profiles`, B1, or B2 table policy, so it can't reintroduce the recursion.
- The replay test asserts this: the policy definitions after 0010 equal those after 0009b.

## Decision 3: Permanent RLS fix (`0009b`)

**Helpers, hardened with identical results:**
- `CREATE OR REPLACE` `is_admin()` and `is_active_user()` with `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''` and the fully qualified `public.user_profiles`.
- `CREATE OR REPLACE` keeps the OID and existing grants, and the S1 policies keep working.
- Why: with `search_path = public`, `pg_temp` is still searched first for relations, which allows a temp-table shadowing attack on a SECURITY DEFINER function. An empty `search_path` plus qualified names removes that.
- The `STABLE` marker lets policies cache the result within a statement.

**`user_profiles`:**

| Policy | Cmd | To | Rule |
|---|---|---|---|
| Users can read own profile | SELECT | authenticated | `id = (select auth.uid())` |
| Admins can read all profiles | SELECT | authenticated | `(select public.is_admin())` |
| Admins can update all profiles | UPDATE | authenticated | USING and WITH CHECK `(select public.is_admin())` |

Staff can't update any profile, including their own (no self-promotion), which is the same as today. Inactive admins fail `is_admin()`.

**B1 and B2 tables:**
- B1: `import_batches`, `customers`, `historical_sales`, `historical_purchases`, `product_external_mappings`, `import_staging_rows`.
- B2: `pricing_policies`, `supplier_price_lists`, `supplier_price_list_items`.
- Each table's two policies are dropped and re-created under the **same names**:
  - "Admin can do all on X": `FOR ALL TO authenticated USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()))`;
  - "Staff can view X": `FOR SELECT TO authenticated USING ((select public.is_active_user()))`.
- **Equivalence:** `role` is constrained to `admin` | `staff`, so an "active user" is an active admin or an active staff member. Admins already had ALL, so read access is the same set of users as before. Write access is admin-only, as before. The explicit `WITH CHECK` closes a gap: the old ALL policies had only `USING`.

**Fail-closed properties (contracts/access-model.md):**
- anon has no `sub`, so `auth.uid()` is NULL and both helpers return false.
- A non-member or inactive user has no active profile row, so both helpers return false.
- Every policy is `TO authenticated`, so anon never matches.
- No policy references `user_profiles` directly except the own-row rule, which is non-recursive.

**Atomicity:** `0009b` runs as one `apply_migration` transaction. Concurrent requests see either the old policies (recursion error) or the new ones, never a gap.

**Not touched:**
- the S1 table policies (they already use the helpers);
- the storage policy (0010);
- `auth.users`.

## Decision 4: Verification

See [contracts/verification-matrix.md](./contracts/verification-matrix.md).
- **Local (blocking for Live).** `tests/security_rls_matrix.test.ts`:
  - fresh replay of 0001 → 0009b, running the full five-role matrix;
  - replay continued through 0010: matrix re-run, plus policy definitions unchanged by 0010;
  - a "Live-like" replay (0001 → 0009, then 0009a, then 0009b) compared object by object with the fresh replay;
  - must PASS before any Live step 2.
- **Live containment (§C).** ACL, a call attempt, inventory, counts, and the usage check.
- **Live matrix (§M).** After 0009b, the same five-role matrix as forced-rollback transactions:
  - transaction-local identities from the existing test subject, a role flip to `staff`, an `is_active` flip to false, a synthetic non-member UUID, and `anon`;
  - no Auth users;
  - `[TEST]` fixtures only inside the rollback.
- **Reconciliation (§R).** Non-test counts identical, 0 test residue, advisors diff with no new security ERROR.
- **App smoke (§S).** An active admin opens `/costs` and `/settings/pricing-policy` without a permission or database error. Otherwise NOT TESTED with a reason.

## Decision 5: Interaction with 001

- **During 002:** 001 stays **STOPPED** and its T006 stays **FAIL**. No 001 task runs.
- **After 002 PASS**, 001 is updated (spec/plan/tasks/contracts) and then restarts:
  - **Expected Live state**: 0001–0009, 0009a, and 0009b applied; 0010 absent. The new preflight verdict **READY-FOR-0010** replaces READY.
  - **Inventory changes**:
    - the 0008 and 0009 objects become "must be PRESENT";
    - the two-argument function becomes "PRESENT but not executable by anon / authenticated / PUBLIC";
    - the 0009b policy definitions become a prerequisite.
  - **Re-run** T001 (workspace refresh), T002 (hashes now include 0009a/0009b; vitest), T003–T005 (update the SQL for the new expected state; drop R-0008/R-0009 as 001 recovery since 001 no longer applies them), T006 (PGlite dry-run must now PASS, including B-11-staff), then T007 (fresh Live preflight) and T008 (fresh backup gate).
  - **Remove** the 001 apply steps for 0008/0009 (T010–T013). They become a read-only confirmation within preflight.
  - **0010 is applied only by 001** (its T014 equivalent), with post-check A-0010, then 001's B-checks and cleanup.
- 002 writes a hand-back note, `rollout/handback-to-001.md`, listing exactly these changes.

## Decision 6: Safety gates

| Gate | Before | Requires |
|---|---|---|
| G0 | Any Live access | Local replay test PASS (for step 2); clean tree; migration file hashes recorded |
| G1, containment | `0009a` apply | **Read-only snapshot**: `proacl`, inventory, row counts, usage check. **Pre-written reversal** (`rollout/recovery/R-0009a.sql`, a GRANT to the recorded grantees). **Owner explicit approval** for 0009a. No full backup (FR-021). |
| G2, verify containment | Anything after 0009a | §C all PASS; otherwise STOP → recovery (owner-approved) |
| G3, permanent fix | `0009b` apply | Local matrix PASS. **Backup gate** (same as 001 DN-1 = C): L1 recorded, L2 MCP export, and L3 `pg_dump -Fc` verified with `pg_restore --list`, with the owner typing the password in a terminal; else BLOCKED. Pre-written reverse `R-0009b.sql` (restores the snapshotted old policy and helper definitions). Read-only snapshot. **Owner explicit approval** for 0009b. |
| G4, verify fix | 002 PASS | §M + §R all PASS, §S PASS or NOT TESTED with a reason (NOT TESTED → INCOMPLETE, not PASS) |

All gates:
- Every Live write is preceded by an owner approval quoted in the rollout record.
- On the first error or FAIL: STOP, no retry, inspect, record, propose recovery, act only on owner approval.
- NOT TESTED / BLOCKED / SKIPPED never count as PASS.

**Verdict:**
- **PASS**: G1–G4 all PASS.
- **FAIL**: any FAIL.
- **BLOCKED**: stopped before 0009a, or before 0009b at G3.
- **INCOMPLETE**: no FAIL, but some required item is NOT TESTED or BLOCKED.

## Risks

- **R1:** Supabase's explicit grants to `anon`/`authenticated` mean a PUBLIC-only revoke would be ineffective. Mitigated by revoking all three and verifying each role plus `proacl`.
- **R2:** The `0009a`/`0009b` naming isn't Supabase CLI's timestamp format. Fine for this repo, which applies through MCP and sorts lexically. A future CLI adoption needs a one-time mapping.
- **R3:** Reversing 0009b restores the recursive policies, which are known broken. Prefer fix-forward. Use R-0009b only if 0009b itself is unsafe.
- **R4:** Helper hardening (`search_path = ''`) changes the definitions of functions that S1 policies depend on. The matrix includes S1 control checks, and FR-010 requires identical behavior.
- **R5:** The L3 backup still needs Postgres client tools and the owner's DB password, which is the same blocker as 001. Containment (G1) doesn't depend on it.
- **R6:** Usage of the exposed function between diagnosis and containment is checked with the audit and cost-row counts. A non-zero result → STOP and report before any further change.
- **R7:** Live history lists 0002 twice. That's informational; 002 doesn't touch it.

## Complexity Tracking

None.
