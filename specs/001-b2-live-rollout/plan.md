# Implementation Plan: B2 Live Rollout

**Branch**: `001-b2-live-rollout` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-b2-live-rollout/spec.md`

## Summary

Bring the Live Supabase database to the B2 state by applying the committed migrations `0008 → 0009 → 0010`, with gates at every point.
The work is purely operational: no application code, no new features, no real business data.

The order is:
1. read-only preflight
2. three-layer backup gate (platform status, MCP export, formal `pg_dump`)
3. owner approval
4. one migration at a time through the Supabase MCP `apply_migration`, each followed by a read-only post-check
5. behavioral verification on Live with `[TEST]` synthetic data
6. cleanup and count reconciliation
7. a single verdict

Every step writes to a rollout record, and any failure stops the run. Design decisions are in [research.md](./research.md), record formats in [data-model.md](./data-model.md) and [contracts/](./contracts/), and the operator run-sheet in [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: SQL (PostgreSQL 15+/17 on Supabase); migration files as committed on `main`

**Primary Dependencies**: Supabase MCP server (account-level connection already present: `list_projects`, `get_project`, `list_migrations`, `list_tables`, `execute_sql`, `apply_migration`, `get_advisors`)

**Storage**: Live Supabase Postgres (`public`, `storage`, `auth`, `supabase_migrations` schemas). Rollout record and evidence go in `specs/001-b2-live-rollout/rollout/`. The manual backup is stored outside the repo.

**Testing**: Read-only SQL post-checks; behavioral checks as SQL run through MCP `execute_sql`, impersonating roles inside a transaction. Repo test suite (`npx vitest run`, 48 tests incl. PGlite migration tests) as a pre-flight sanity gate.

**Target Platform**: The Live Supabase project used by the deployed app (project ref must equal the host in `NEXT_PUBLIC_SUPABASE_URL`)

**Project Type**: Database rollout / operations (web app unchanged)

**Performance Goals**: Each migration completes in seconds (empty B2 tables). The whole rollout fits in one session (≈ 1–2 h including approvals).

**Constraints**:
- No Live access during planning.
- No migration without both gates plus explicit approval.
- No automatic retry.
- No real business data written.
- `NOT TESTED` ≠ PASS.

**Scale/Scope**: 3 migrations; 3 new tables, ~20 altered columns, 3 functions, 1 trigger, ~8 policies, 1 bucket, 1 setting.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | How this plan complies | Status |
|---|---|---|
| I. Money uses Decimal | No calculation code changes; verification compares DECIMAL values as text (e.g. `1464.0000`) and never via float. | PASS |
| II. Authorization fails closed | Post-checks confirm admin-only publish and policy change, `REVOKE ... FROM PUBLIC, anon` on the new `SECURITY DEFINER` functions, and RLS enabled with staff read-only and anon none. A missing check counts as FAIL. | PASS |
| III. SKIPPED / NOT TESTED ≠ PASS | The verdict rules (below) make any required `NOT TESTED` an incomplete result, never PASS. | PASS |
| IV. No hard-coded credentials | No keys or passwords are written to the repo. The DB password for `pg_dump` is typed by the owner into the interactive terminal prompt only. It is never in chat, files, environment files, or logs. Backup files stay outside the repo. | PASS |
| V. Cost history append-only | Verified on Live: UPDATE on `purchase_cost_history` is refused. Existing B1 rows are counted before and after and must be equal. | PASS |
| VI. Quotes preserve snapshots | The verification creates no committed quotes. Existing quotes are counted before and after and must be equal. | PASS |
| VII. Quote = effective cost + fees + margin | Verified: effective-cost lookup by date, no future cost, COST_NOT_FOUND when absent. | PASS |
| VIII. Kingcard history ≠ pricing authority | Verified: existing B1 cost rows (no `source_price_list_id`) stay untouched and are ignored by the resolver. | PASS |
| IX. No scope expansion | No app code, no new migrations, no PDF processing. A defect found → STOP and a separate change. | PASS |

No violations, so Complexity Tracking is empty.

**Post-design re-check (after DN-1 = C, DN-2 = A, DN-3 = C):** 9/9 PASS.
- **II:** fail-closed is now tested explicitly via a synthetic non-member UUID (B-09a).
- **III:** an unavailable test subject yields BLOCKED / NOT TESTED, never PASS.
- **IV:** the DB password only ever goes into the owner's terminal prompt.
- **V and VI:** rolled-back tests guarantee that no cost or quote rows are added.

## Project Structure

### Documentation (this feature)

```text
specs/001-b2-live-rollout/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 decisions
├── data-model.md        # rollout entities, states, verdict rules
├── quickstart.md        # operator run-sheet (validation guide)
├── contracts/
│   ├── inspection-report.md    # preflight output format + object inventory
│   └── verification-result.md  # post-check + behavioral check catalogue and result format
├── rollout/             # created at execution time (tasks/implement), committed
│   ├── rollout-record.md
│   └── evidence/        # query outputs per step (no business data, counts only)
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
supabase/migrations/
├── 0008_b2_pricing_foundation.sql   # applied as-is, not edited
├── 0009_b2_publish_rpc.sql          # applied as-is, not edited
└── 0010_b2_cost_integrity.sql       # applied as-is, not edited
```

**Structure Decision**: No source changes. The only new repository content is documentation and evidence under `specs/001-b2-live-rollout/`.

## Execution Plan

### Stage 0: Local sanity (no Live access)
- `main` is clean. The three migration files are unchanged since the B2 merge (verified by git hash).
- `npx vitest run` passes 48/48, including the PGlite run of migrations 0001–0010.
- **Fail** → STOP (BLOCKED). The repo isn't in the expected state.

### Stage 1: Read-only preflight ([contracts/inspection-report.md](./contracts/inspection-report.md))
1. Identify the project: confirm that MCP `list_projects`/`get_project` returns the ref matching the deployed `NEXT_PUBLIC_SUPABASE_URL`, and that it is ACTIVE_HEALTHY. A mismatch or an ambiguous match → BLOCKED.
2. `list_migrations`: record the migration history. It is likely empty or incomplete because 0001–0007 were applied by hand.
3. Object inventory via `execute_sql` (catalog `SELECT`s only):
   - **Prerequisites:** the 0001–0007 objects, plus `is_admin()`/`is_active_user()` and the `user_profiles`, `audit_logs`, and `system_settings` tables.
   - **Each object 0008–0010 creates or alters:** tables, columns, constraints, indexes, functions with their signatures, the trigger, policies, the bucket, and the setting. Each is marked ABSENT, PRESENT, or PARTIAL.
4. **Conflict scan:**
   - duplicate `(source_type, supplier_id, external_code)` in `product_external_mappings`
   - `product_external_mappings.status` values outside the allowed set
   - existing `pricing_policies` rows, if the table already exists
   - `supplier_price_lists.status` values outside the allowed set
   - an existing `supplier-price-lists` bucket and how many files it holds
5. **Baseline counts:** row counts for every `public` table, `storage.objects` in that bucket, and `auth.users` (count only).
6. **Data API exposure:** default privileges for `authenticated` in schema `public`. This predicts whether the new tables will be reachable by the app.
7. **Advisors baseline:** `get_advisors` (security + performance), stored so new findings can be told apart from existing ones.
8. **Test subject lookup (DN-3):** read-only, find the `user_profiles` row whose `auth.users.email` equals `TEST_ADMIN_EMAIL` (from local `.env.local`, never printed). Record only its UUID, `role`, and `is_active`. If it is missing or not an active admin, the admin/staff behavior checks are flagged BLOCKED / NOT TESTED in the report (risk R10).
9. **Verdict:** READY / PARTIALLY APPLIED / ALREADY APPLIED / BLOCKED.
   - Anything other than READY → STOP. Write a state-specific recovery proposal for owner approval.
   - The inspection is proven read-only by comparing the baseline counts with a second count taken at the end of Stage 1.

### Stage 2: Backup gate (D-1, DN-1 = C: all layers)
All backup files are stored outside the repository, in `%USERPROFILE%\Backups\yuan-erp\<YYYYMMDD-HHmm>\`, and are never committed.

- **Layer 1, platform backup status (agent, read-only):** whether the project has daily backups and/or PITR, with retention and the latest restore point.
  - Source: MCP `get_project` / Management API data visible to the connection.
  - If the connection can't see it, the owner confirms from the dashboard (Database → Backups).
  - Recorded as yes / no / unknown. Informational: it does **not** replace Layer 3.
- **Layer 2, MCP export (agent-only):**
  - per-table JSON of all `public` data
  - a schema snapshot (tables, columns, constraints, indexes, functions, triggers, policies, grants) taken from the catalogs
  - Verified when per-table row counts equal the Stage 1 baseline. **Required.**
- **Layer 3, formal logical backup (`pg_dump`):**
  - `pg_dump -Fc` of the Live database, run through the Supavisor session pooler. The host and user come from MCP `get_project` (ref and region); no secrets are stored.
  - **Password:** the agent opens an interactive terminal tab and starts `pg_dump`, which prompts for the password. When the prompt appears, the agent tells the owner which tab to type it into. The password is never pasted in chat, written to a file, put in an environment file, or logged.
  - Tooling: Postgres client tools at the server's major version or newer, installed on this PC when needed (installation is a local, non-Live step). `supabase db dump` is used only if Docker is available; it is not required.
  - **Verification:** `pg_restore --list` reads the archive, `TABLE DATA` entries exist for every `public` table, and the archive size is non-trivial. **Required.**
- **Gate:** PASS only if Layer 2 **and** Layer 3 are both complete and verified, and Layer 1 is recorded. Otherwise → **BLOCKED**, with 0 migrations applied.

### Stage 3: Owner approval
- The agent presents the preflight verdict, the backup record, and this stage list.
- Migrations may proceed only after the owner's explicit "approve rollout" in the conversation.

### Stage 4: Apply 0008 → 0009 → 0010 ([contracts/verification-result.md](./contracts/verification-result.md) §A)
For each migration N in order:
1. Re-confirm the file hash equals the Stage 0 hash.
2. MCP `apply_migration(name = "b2_<n>_<slug>", query = <exact file content>)`. The name maps to the repo file in the rollout record.
3. **On error:** STOP.
   - Do not retry.
   - Immediately run the post-check inventory for step N to determine the actual state: applied, not applied, or partial.
   - Go to Failure & Recovery.
4. **Post-check N** (read-only):
   - All expected objects for N are PRESENT.
   - No unexpected change to other objects; Stage 1 inventory diff.
   - Baseline row counts are unchanged except the expected seed (+3 `pricing_policies` in 0008, +1 `system_settings` and +1 bucket in 0010).
   - `list_migrations` shows the new entry.
5. **Post-check FAIL** → STOP and go to Failure & Recovery. PASS → record it, then go to the next N.

The per-step post-checks are listed in contracts §A:
- **A-0008:** three new tables, the `purchase_cost_history` / `quotes` / `quote_items` columns, the three demo policies (25/20/15%), RLS enabled on the three new tables, and six policies.
- **A-0009:** the two-argument `publish_supplier_price_list` exists.
  - This is a transient state: it trusts a caller-supplied ID. See risk R1. 0010 should follow without delay once the A-0009 checks pass.
- **A-0010:**
  - the two-argument function is gone; the one-argument function exists and `anon`/`PUBLIC` can't execute it
  - `set_pricing_policy` exists
  - the append-only trigger, check constraints, and new unique indexes
  - the old unique constraints are dropped
  - the bucket is private, and its storage policy exists
  - the `cost_change_warning_threshold` setting
  - the quote snapshot columns
  - `authenticated` has table privileges on the three new tables

### Stage 5: Synthetic `[TEST]` behavioral verification (D-2; contracts §B)
- Runs on Live. Fixtures are `[TEST]`-labelled: a test supplier `[TEST] B2 Rollout Supplier`, test products `[TEST]-B2-*`, and test price lists in 2099/2100.
- **Method (DN-2 = A):** every behavioral check runs inside one transaction that **always** ends in a forced rollback.
  - Results are returned through the error message.
  - No `[TEST]` business data is ever committed.
- **Identities (DN-3 = C, research R-4):** transaction-local simulation only, using `SET LOCAL ROLE anon|authenticated` and `set_config('request.jwt.claims', …, true)`.
  - **No INSERT or DELETE on `auth.users`.** No Auth user is created.
  - **Anonymous / non-admin:** role `anon`, or `authenticated` with a synthetic UUID that has no profile. This tests fail-closed refusal.
  - **Admin:** the existing test subject's UUID (the account named by `TEST_ADMIN_EMAIL`), looked up read-only in Stage 1. Its `user_profiles` row is used as-is.
  - **Staff:** the same test subject, with its `user_profiles.role` set to `staff` **inside** the rolled-back transaction (transaction-local profile state).
  - **If no usable test subject exists on Live:** checks that need an admin or staff profile (B-01..B-07, B-10, and the staff part of B-11) are reported **BLOCKED / NOT TESTED** to the owner before going further. No Auth user is created to work around this.
- The checks are B-01 … B-12 in contracts §B. They cover:
  - publish blocked when rows are unmapped, have an invalid cost, or are error rows
  - all-or-nothing rollback when a publish fails midway
  - successful publish, with Nov 1464 and Dec 1520
  - UPDATE on cost history refused
  - effective cost by date, no future cost used, and COST_NOT_FOUND
  - non-admin publish refused, and policy change by staff refused
  - a policy change creates a new version
  - RLS: staff can read but not write the new tables, and anon sees nothing
  - pre-existing B1 cost rows are ignored by the resolver
- **App smoke test (SC-007):** an admin opens `/costs` and `/settings/pricing-policy` on the deployed app without errors. The quote page shows the no-cost message for a product that has no cost.
  - Read-only, no saving.
  - The owner performs it, or the agent does if the owner provides a logged-in browser session. Otherwise it is NOT TESTED.

### Stage 6: Cleanup & reconciliation
- Nothing is deleted, because everything was rolled back. This is confirmed by counts:
  - 0 rows matching the `[TEST]` / `TEST-` / year ≥ 2099 markers in every B2 table and in `suppliers`, `products`, `audit_logs`, `quotes`, `quote_items`, `product_external_mappings`;
  - the test subject's `user_profiles` row is unchanged (role still admin);
  - every non-test count equals the Stage 1 baseline plus the expected migration seeds.
- Any residue or mismatch → **FAIL**. The residue is listed for the owner; nothing is deleted without approval.
- Run `get_advisors` again. Any new security ERROR caused by B2 objects makes the result FAIL. New WARN-level findings are recorded and reported, and don't block.

### Stage 7: Verdict ([data-model.md](./data-model.md) §Verdict)

| Result | Condition |
|---|---|
| **PASS** | Stages 0–6 have every required item PASS, cleanup is verified, the counts reconcile, and no new security ERROR. |
| **FAIL** | Any required item FAIL, any migration error, a post-check failure, `[TEST]` residue, or a count mismatch. |
| **BLOCKED** | Stopped before any migration because the preflight verdict wasn't READY, the backup gate failed, approval was withheld, or a needed right was missing. 0 migrations applied. |
| **INCOMPLETE (not PASS)** | No FAIL, but at least one required item is NOT TESTED. Each one is listed with its reason. |

The final report lists every item with PASS / FAIL / NOT TESTED and its evidence reference. The summary counts the three categories separately and never adds NOT TESTED into PASS.

## Failure & Recovery Procedure

General rule: **STOP → inspect → record → propose → owner approves → act → re-inspect.** No automatic retry, and no improvised SQL on Live without approval.

| Stop point | Likely state | Recovery action (owner-approved) | Confirmation |
|---|---|---|---|
| Stage 0–3 (before any migration) | Unchanged | None. Fix the cause and restart from Stage 1. | Stage 1 counts equal the baseline |
| 0008 errors | Applied in a single transaction, so the expected state is not applied. Verify via the inventory. | If ABSENT: fix the cause (e.g. a missing prerequisite) in a separate approved change, then resume at 0008. If PARTIAL (non-transactional application): run the pre-reviewed reverse script R-0008, or restore. | The inventory shows 0008 objects ABSENT |
| 0008 OK, post-check FAIL | 0008 applied | Reverse R-0008: drop the three new tables (empty), the added columns, and the seeded policies, then remove the history entry. Or restore. | The inventory matches the baseline |
| 0009 errors / post-check FAIL | 0008 applied, 0009 not or partial | Drop the two-argument function if present (R-0009). The 0008 state is consistent and harmless. Resume after the fix. | The function is absent; A-0008 still PASS |
| 0010 errors | 0008 and 0009 applied, with the two-argument function still exposed | **Priority:** drop the two-argument function at once (R-0009) to close the R1 window. Then the inventory decides between resume and reverse R-0010. | The two-argument function is absent |
| 0010 OK, post-check FAIL | Schema present but defective | Report it. A forward fix goes in a new migration in a separate approved change. Reverse R-0010 or a restore only if the defect is unsafe, e.g. a missing RLS policy or a missing REVOKE. | Re-run contracts §A |
| Stage 5 check FAIL | Schema applied, behavior wrong | Keep the schema; the app needs it. Report FAIL with evidence. Admins avoid publishing until a fix ships. | — |
| Stage 6 residue / mismatch | `[TEST]` rows remain (should be impossible with rollback) or counts differ | FAIL. Investigate: a mismatch may be real user activity during the window. Any deletion of residue happens only with owner approval, using the maintenance role. | Recount |
| Severe / unknown state | — | Restore from Layer 3 (`pg_restore` of the formal dump, owner-approved), or from Layer 1 (PITR/daily) if confirmed available. Layer 2 serves as a cross-check and as a source for per-table reloads. Note that a restore also discards any real activity after the restore point. | Stage 1 inventory equals the pre-rollout record |

The reverse scripts R-0008, R-0009, and R-0010 are written and reviewed during `/speckit-tasks`/implement **before** Stage 4. They are stored in `rollout/`, not in `supabase/migrations/`, and run only on owner approval.

## Risks

- **R1 (0009 window):** 0009 creates a `SECURITY DEFINER` publish function that trusts a caller-supplied user ID. By default every role can execute it, per the Supabase skill security checklist. It exists until 0010 replaces it.
  - Mitigation: apply 0010 immediately after A-0009 passes. B2 tables are empty, so there's nothing to publish in the window. Recovery drops the function first.
- **R2 (0008 not re-runnable):** 0008 has `CREATE POLICY` without `IF NOT EXISTS`, so a PARTIAL state can't simply be re-run. The preflight verdict gates this.
- **R3 (Data API grants):** new tables may lack grants for `authenticated`, depending on the project's Data API settings. The app would then fail even though the schema is right. This is predicted in preflight and checked in A-0010. If grants are missing → FAIL, and the fix is a separate approved migration.
- **R4 (storage policy ownership):** creating a policy on `storage.objects` may be refused on newer Supabase platform versions. In that case 0010 fails as a whole and goes to recovery. If that happens the fix is a separate change, for example a bucket policy set via the dashboard.
- **R5 (migration history mismatch):** history names won't match repo filenames, and 0001–0007 may have no history entries. The mapping is recorded; backfilling the history is out of scope.
- **R6 (restore side effects):** a restore discards real activity after the restore point. Prefer the reverse scripts for empty-table states.
- **R7 (impersonation fidelity):** transaction-local role/JWT impersonation approximates real sessions. The app smoke test (SC-007) is the end-to-end confirmation; if it can't be done it is reported NOT TESTED.
- **R8 (tooling):** `pg_dump`/`pg_restore` are not installed locally. Layer 3 needs Postgres client tools at least as new as the server's major version, installed before Stage 2. A failed install blocks Layer 3 → BLOCKED.
- **R9 (pooler connectivity):** the direct DB host may be IPv6-only. Layer 3 uses the session pooler. If neither connects from this PC → BLOCKED.
- **R10 (test subject):** admin/staff behavior checks depend on an existing test subject (`TEST_ADMIN_EMAIL`) with an active admin profile on Live. If it is missing or inactive, those checks are BLOCKED / NOT TESTED and reported. No Auth user is created.

## Decisions (resolved 2026-11-07)

- **DN-1 = C (all layers):**
  - Layer 1: platform backup/PITR status, recorded.
  - Layer 2: MCP schema snapshot + `public` data export, required.
  - Layer 3: formal `pg_dump -Fc`, required. The password is typed only by the owner into an interactive local terminal and never shared in chat.
  - No verified formal backup → BLOCKED.
- **DN-2 = A:** all feasible behavioral DB tests run inside a transaction with a forced rollback; no `[TEST]` business data is committed. Afterwards, 0 test rows and equal non-test counts are confirmed.
- **DN-3 = C:**
  - transaction-local identity simulation only: `SET LOCAL ROLE`, `request.jwt.claims`, synthetic UUIDs;
  - admin/staff via the existing test subject, plus a transaction-local profile change;
  - no INSERT or DELETE on `auth.users`, and no Auth user creation;
  - anything that can't be verified this way → BLOCKED / NOT TESTED, reported first.
