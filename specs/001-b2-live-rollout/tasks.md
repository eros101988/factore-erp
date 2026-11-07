---
description: "Task list for B2 Live Rollout (001-b2-live-rollout)"
---

# Tasks: B2 Live Rollout

**Input**: `specs/001-b2-live-rollout/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md, spec.md, `.specify/memory/constitution.md`

**Tests**: The verification checks (contracts §A/§B/§C/§S) are the acceptance tests of this feature. They are written as tasks below. No product code or unit tests are added.

**Organization**: Phases follow the mandatory execution order (owner instruction). Story labels trace each task to spec.md:
- US1 = know the Live state (preflight)
- US2 = apply 0008 → 0009 → 0010
- US3 = prove B2 behavior without real data
- US4 = recovery and backups

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task). Only local file-authoring tasks are ever [P]. **No Live task is parallel.**
- **[Story]**: US1–US4 as above.

## Global rules (apply to every task)

- **G1 — Stop on failure.** Any task that ends in ERROR or FAIL stops the run. Record it in `specs/001-b2-live-rollout/rollout/rollout-record.md`, then go to Phase R (Failure & Recovery). Never skip a task. Never retry a failed `apply_migration` automatically.
- **G2 — No silent passes.** A task result is PASS, FAIL, NOT TESTED, or BLOCKED. NOT TESTED, BLOCKED, and SKIPPED are never counted or summarized as PASS.
- **G3 — Read-only by default.** Live access is read-only (`SELECT`/catalog queries via MCP `execute_sql`, plus `list_*`/`get_*`) except:
  - T037 / T039 / T041: `apply_migration`;
  - T045–T053: forced-rollback transactions.
- **G4 — No real business data.**
  - Evidence files contain counts, IDs, object names, and check results only.
  - Data exports and dumps go only to `%USERPROFILE%\Backups\yuan-erp\<run>\`, outside the repo, and are never committed.
- **G5 — No Auth users.** Never INSERT, UPDATE, or DELETE on `auth.users`. The DB password is typed only by the owner into an interactive terminal prompt.
- **G6 — Log everything.** Every Live action appends an entry to `rollout-record.md`: `seq, at (Asia/Taipei), actor, stage, action, input_ref, outcome, evidence_ref`.

---

## Phase 1: Setup and Local Sanity Check (no Live access)

**Purpose**: Prepare the rollout workspace and prove the repo is in the expected state.

- [ ] T001 Create the folders `specs/001-b2-live-rollout/rollout/evidence/`, `specs/001-b2-live-rollout/rollout/sql/`, and `specs/001-b2-live-rollout/rollout/recovery/`. Create `specs/001-b2-live-rollout/rollout/rollout-record.md` with the sections from data-model.md:
  - Inspection Report summary
  - Backup Record
  - Step log (append-only)
  - Migration-name ↔ file map (`b2_0008_pricing_foundation` ↔ `supabase/migrations/0008_b2_pricing_foundation.sql`, and likewise for `b2_0009_publish_rpc` and `b2_0010_cost_integrity`)
  - Verification Results
  - Verdict
- [ ] T002 Confirm the working tree is clean on the rollout branch, which is up to date with `main`. Record the git blob hashes of `supabase/migrations/0008_b2_pricing_foundation.sql`, `0009_b2_publish_rpc.sql`, and `0010_b2_cost_integrity.sql` in `specs/001-b2-live-rollout/rollout/evidence/00-local.txt`. FAIL if any of these files differs from the B2 merge commit.
- [ ] T003 Run `npx vitest run` and record the result in `specs/001-b2-live-rollout/rollout/evidence/00-local.txt`. It must be 48 passed, 0 failed (this includes `tests/b2_publish_db.test.ts`, which runs migrations 0001–0010 on PGlite). Anything else → FAIL (G1).

**Checkpoint**: Local sanity PASS. Nothing on Live has been touched.

---

## Phase 2: Foundational — author queries and recovery scripts (no Live access)

**Purpose**: Every SQL statement that will touch Live is written, reviewed, and committed **before** any Live access. Nothing improvised at run time.

**⚠️ CRITICAL**: Phases 3+ cannot start until this phase is complete.

- [ ] T004 [P] Write `specs/001-b2-live-rollout/rollout/sql/preflight-inventory.sql`. These are read-only catalog queries that return ABSENT / PRESENT / PARTIAL for every object in contracts/inspection-report.md:
  - prerequisites;
  - 0008, 0009, and 0010 objects: tables, columns, constraints, indexes, functions with signatures, the trigger, policies, `relrowsecurity`, the bucket, and the setting.
- [ ] T005 [P] Write `specs/001-b2-live-rollout/rollout/sql/preflight-conflicts.sql`. Read-only checks from the inspection-report "Conflict scan":
  - duplicate `(source_type, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'), external_code)` in `product_external_mappings`;
  - `product_external_mappings.status NOT IN ('suggested','confirmed','rejected')`;
  - if the tables already exist: `pricing_policies` / `supplier_price_lists` rule violations;
  - the existing `supplier-price-lists` bucket's object count.
- [ ] T006 [P] Write `specs/001-b2-live-rollout/rollout/sql/baseline-counts.sql`. Read-only `count(*)` for every table in schema `public`, `storage.objects WHERE bucket_id = 'supplier-price-lists'`, and `count(*)` of `auth.users`. Output as a single JSON object `{table: count}`.
- [ ] T007 [P] Write `specs/001-b2-live-rollout/rollout/sql/privileges.sql`. Read-only checks for default privileges of `authenticated` in schema `public`; for each new table, `has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE')`; and `has_function_privilege` for `anon` and `authenticated` on the B2 functions.
- [ ] T008 [P] Write `specs/001-b2-live-rollout/rollout/sql/test-subject.sql`. Read-only: given an email parameter (`TEST_ADMIN_EMAIL`, substituted at run time from local `.env.local` and never written to any file or log), return only `id`, `user_profiles.role`, and `user_profiles.is_active`.
- [ ] T009 [P] Write `specs/001-b2-live-rollout/rollout/sql/postcheck-0008.sql` implementing A-0008-01…05 from contracts/verification-result.md §A. Each check returns `{id, result: PASS|FAIL, detail}`.
- [ ] T010 [P] Write `specs/001-b2-live-rollout/rollout/sql/postcheck-0009.sql` implementing A-0009-01…02 (§A).
- [ ] T011 [P] Write `specs/001-b2-live-rollout/rollout/sql/postcheck-0010.sql` implementing A-0010-01…09 (§A). This includes:
  - `publish_supplier_price_list(uuid, uuid)` is absent;
  - `has_function_privilege('anon', …, 'EXECUTE') = false` for both functions;
  - the trigger is enabled;
  - the bucket is private;
  - `authenticated` has table privileges on the new tables.
- [ ] T012 [P] Write `specs/001-b2-live-rollout/rollout/sql/verify-B01-B04.sql`: four `DO` blocks for B-01…B-04 (§B). Each one:
  - creates `[TEST]` fixtures (supplier `[TEST] B2 Rollout Supplier`, products `[TEST]-B2-001/002`, SKUs `TEST-KA-T91N`, year 2099);
  - impersonates admin via `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', json_build_object('sub', :test_subject_id, 'role', 'authenticated')::text, true)`;
  - wraps expected refusals in `BEGIN … EXCEPTION`;
  - **always** ends with `RAISE EXCEPTION 'B2_VERIFY_RESULT %', <json>`.
  - Any other termination = FAIL.
- [ ] T013 [P] Write `specs/001-b2-live-rollout/rollout/sql/verify-B05-B08.sql`: B-05…B-08 (§B), same structure as T012. Cover:
  - publishing 2099-11 (36.6 × 40) and 2099-12 (38 × 40) → `pack_cost` `1464.0000` / `1520.0000`, compared as text;
  - UPDATE refused;
  - re-publish refused;
  - effective cost at 2099-10-31 / 2099-11-15 / 2099-11-30 / 2099-12-01 → COST_NOT_FOUND / 1464 / 1464 / 1520.
- [ ] T014 [P] Write `specs/001-b2-live-rollout/rollout/sql/verify-B09-B12.sql`: B-09a, B-09b, B-10, B-11, B-12 (§B), same structure. Identities follow research R-4:
  - **non-member:** a synthetic UUID with no profile;
  - **staff:** the test subject, with `UPDATE user_profiles SET role = 'staff'` inside the same rolled-back transaction;
  - **anon:** `SET LOCAL ROLE anon`.
  - **B-12:** pre-existing B1 cost rows (`source_price_list_id IS NULL`) are never returned as an effective cost.
- [ ] T015 [P] Write `specs/001-b2-live-rollout/rollout/sql/cleanup-reconcile.sql` for C-01 and C-02 (§C). Read-only:
  - count of test-marker rows (`[TEST]`, `TEST-`, year ≥ 2099) in every B2 table and in `suppliers`, `products`, `audit_logs`, `quotes`, `quote_items`, `product_external_mappings`;
  - the test subject's `user_profiles` row;
  - every baseline count. Expected deltas are only the research R-7 seeds: +3 `pricing_policies`, +1 `system_settings`, +1 `storage.buckets`.
- [ ] T016 [P] [US4] Write the reverse script `specs/001-b2-live-rollout/rollout/recovery/R-0008.sql`. It drops, only if the tables are empty:
  - the 6 policies and the 3 new tables;
  - the columns 0008 added to `purchase_cost_history`, `quotes`, and `quote_items`;
  - the 0008 history entry.
  Each statement is guarded with `IF EXISTS`, and the whole script runs in one transaction that aborts if any new table has rows. Not executed in this phase.
- [ ] T017 [P] [US4] Write `specs/001-b2-live-rollout/rollout/recovery/R-0009.sql`: `DROP FUNCTION IF EXISTS publish_supplier_price_list(uuid, uuid)` plus the 0009 history entry, in one transaction. Not executed.
- [ ] T018 [P] [US4] Write `specs/001-b2-live-rollout/rollout/recovery/R-0010.sql`, which reverses 0010 object by object:
  - drop the trigger, trigger function, `set_pricing_policy`, `publish_supplier_price_list(uuid)`, the new indexes, check constraints, and columns, the storage policy, the empty bucket, and the setting row;
  - restore `pricing_policies_tier_key` and `product_external_mappings_source_type_external_code_key` **only if** the data allows it;
  - remove the 0010 history entry.
  One transaction; aborts if the bucket has objects or the B2 tables have rows. Not executed.
- [ ] T019 [US4] Write `specs/001-b2-live-rollout/rollout/recovery/recovery-runbook.md`. It turns the plan's "Failure & Recovery" table into step-by-step procedures, one per stop point:
  - before any migration;
  - 0008 error / post-check fail;
  - 0009 error / post-check fail;
  - 0010 error, **dropping the two-argument function first** (R1);
  - 0010 post-check fail;
  - verification fail;
  - cleanup residue;
  - restore from Layer 3 (`pg_restore`) or Layer 1.
  Each procedure has a confirmation query, and each requires owner approval before execution.
- [ ] T020 Review T004–T019 against the PGlite schema: run every read-only query and reverse script against a local PGlite database built from migrations 0001–0010 (scratch script outside `src/`, not committed). Fix syntax errors, and record "dry-run OK" per file in `specs/001-b2-live-rollout/rollout/evidence/00-local.txt`.
  - The B-check `DO` blocks must each end in `B2_VERIFY_RESULT` with all PASS on PGlite (using a PGlite stub test subject).
  - The reverse scripts must restore the pre-0008 / pre-0009 / pre-0010 inventory on PGlite.
- [ ] T021 Commit the authored files under `specs/001-b2-live-rollout/rollout/` (no Live data yet) on the feature branch.

**Checkpoint**: All SQL is written, dry-run on PGlite, and committed. Still no Live access.

---

## Phase 3: User Story 1 — Read-only Live Preflight (Priority: P1)

**Goal**: Know the exact Live state before touching it (spec US1, FR-001/002).

**Independent Test**: Run Phase 3 alone. The report gives a verdict, and the recount in T030 equals the baseline in T026, which proves nothing changed.

- [ ] T022 [US1] Identify the target project. Use MCP `list_projects` / `get_project`, select the project whose ref equals the host of `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`, and confirm its status is ACTIVE_HEALTHY. Record the ref, region, and Postgres version in `specs/001-b2-live-rollout/rollout/evidence/01-inspection.json`. No match, an ambiguous match, or MCP unavailable → BLOCKED (G1).
- [ ] T023 [US1] Run MCP `list_migrations` and save the migration history entries into `01-inspection.json` (`migration_history`).
- [ ] T024 [US1] Run `rollout/sql/preflight-inventory.sql` via MCP `execute_sql` and save the per-object states into `01-inspection.json` (`objects[]`).
- [ ] T025 [US1] Run `rollout/sql/preflight-conflicts.sql` and save the results into `01-inspection.json` (`conflicts[]`, IDs only).
- [ ] T026 [US1] Run `rollout/sql/baseline-counts.sql` and save to `specs/001-b2-live-rollout/rollout/evidence/01-baseline-counts.json`.
- [ ] T027 [US1] Run `rollout/sql/privileges.sql` (Data API default privileges) and save into `01-inspection.json` (`data_api_defaults`). If the defaults will not grant `authenticated` access to the new tables, flag risk R3 in `rollout-record.md`.
- [ ] T028 [US1] Run MCP `get_advisors` (security and performance) and save to `specs/001-b2-live-rollout/rollout/evidence/01-advisors-baseline.json`.
- [ ] T029 [US1] Run `rollout/sql/test-subject.sql` with `TEST_ADMIN_EMAIL`, without printing the email. Save `test_subject_ok`, the UUID, role, and is_active to `01-inspection.json`. If it is not an active admin, mark B-01…B-07, B-09b, B-10, and the B-11 staff part as **BLOCKED / NOT TESTED** in `rollout-record.md`, and tell the owner now. Do **not** create an Auth user.
- [ ] T030 [US1] Re-run `rollout/sql/baseline-counts.sql` and compare it with `01-baseline-counts.json`. They must be identical (read-only proven); otherwise investigate and record.
- [ ] T031 [US1] Compute the verdict per contracts/inspection-report.md:
  - READY / ALREADY APPLIED / PARTIALLY APPLIED / BLOCKED;
  - write the summary table and verdict into `rollout-record.md`.
  - Anything other than READY → STOP. Draft a state-specific recovery proposal in `rollout-record.md` for the owner and go to Phase R.

**Checkpoint**: The verdict is READY and Live is unchanged.

---

## Phase 4: User Story 4 — Backup Gate (Priority: P2, blocking)

**Goal**: A verified restore point exists before any change (spec FR-017/018; DN-1 = C).

**Independent Test**: The Backup Record in `rollout-record.md` shows Layer 1 recorded, Layer 2 and Layer 3 verified, and the gate as PASS or BLOCKED.

- [ ] T032 [US4] Layer 1:
  - read the daily backup / PITR status, retention, and latest restore point through what MCP exposes (`get_project` / Management API);
  - if it isn't visible, ask the owner to read Dashboard → Database → Backups and report it in chat;
  - record yes / no / unknown in `specs/001-b2-live-rollout/rollout/evidence/02-backup.json` (`layer1`). This is informational and does not satisfy the gate.
- [ ] T033 [US4] Layer 2 MCP export:
  - for every `public` table, export `SELECT json_agg(t) FROM <table> t` to `%USERPROFILE%\Backups\yuan-erp\<run>\mcp\<table>.json`;
  - export a schema snapshot from the catalogs (columns, constraints, indexes, `pg_get_functiondef`, triggers, `pg_policies`, `role_table_grants`) to `…\mcp\schema-snapshot.sql`;
  - verify the per-table row counts equal `01-baseline-counts.json`;
  - record `layer2` in `02-backup.json` (paths, counts, `rowcount_match`) **without any data**.
  Mismatch or failure → Layer 2 FAIL.
- [ ] T034 [US4] Layer 3 formal dump:
  - install the Postgres client tools locally if they are missing (`pg_dump`/`pg_restore` version ≥ the server major from T022; local-only step);
  - open an interactive terminal tab and start `pg_dump -Fc --no-owner --no-privileges -h <session-pooler-host> -p 5432 -U postgres.<ref> -d postgres -f "%USERPROFILE%\Backups\yuan-erp\<run>\yuan-erp-pre-b2.dump"`, with **no** password argument and no `PGPASSWORD`;
  - when the prompt appears, tell the owner which tab to type the password into, and never ask for it in chat;
  - afterwards run `pg_restore --list` on the file and confirm `TABLE DATA` entries exist for every `public` table;
  - record `layer3` (versions, host, size, `restore_list_ok`, `tables_with_data`) in `02-backup.json`.
  Install failure, connection failure, or a bad archive → Layer 3 FAIL.
- [ ] T035 [US4] Evaluate the gate: PASS **only if** Layer 2 and Layer 3 are both verified and Layer 1 is recorded. Write the gate result to `rollout-record.md`. If it isn't PASS → **BLOCKED**, 0 migrations applied, STOP.

**Checkpoint**: Backup gate PASS.

---

## Phase 5: Explicit Approval Gate (blocks Phase 6)

**Purpose**: Owner consent for this specific rollout (spec FR-003c).

- [ ] T036 [US2] Present to the owner in chat: the preflight verdict (T031), the Backup Record (T035), the R1 note (0009 → 0010 back-to-back), and the list of Phase 6–8 actions. Wait for an explicit approval message. Quote it verbatim with a timestamp in `rollout-record.md`.
  - No approval, an ambiguous reply, or approval for something else → STOP (BLOCKED). The approval covers only this run; a new run needs a new approval.

**Checkpoint**: Approval recorded. Migrations may now run.

---

## Phase 6: User Story 2 — Apply 0008 (Priority: P1)

**Goal**: Apply 0008 and verify it (spec FR-004/005/006/016).

**Independent Test**: Post-check A-0008 is all PASS and the history shows `b2_0008_pricing_foundation`.

- [ ] T037 [US2] Re-check that the hash of `supabase/migrations/0008_b2_pricing_foundation.sql` equals T002.
  - Call MCP `apply_migration(name = "b2_0008_pricing_foundation", query = <exact file content>)`.
  - Log it (G6).
  - On error → STOP immediately, do **not** retry, run `rollout/sql/preflight-inventory.sql` to get the actual state, and go to Phase R (T061).
- [ ] T038 [US2] **Post-check 0008:** run `rollout/sql/postcheck-0008.sql` and `rollout/sql/baseline-counts.sql`. Save to `specs/001-b2-live-rollout/rollout/evidence/A-0008.json`.
  - PASS requires A-0008-01…05 all PASS, and the only count change being +3 `pricing_policies`.
  - Any FAIL → STOP and go to Phase R (T062).

**Checkpoint**: 0008 VERIFIED. Go straight to Phase 7.

---

## Phase 7: User Story 2 — Apply 0009 (Priority: P1)

- [ ] T039 [US2] Re-check the hash of `supabase/migrations/0009_b2_publish_rpc.sql`.
  - `apply_migration(name = "b2_0009_publish_rpc", …)`.
  - Log it.
  - On error → STOP, no retry, inventory, go to Phase R (T063).
- [ ] T040 [US2] **Post-check 0009:** run `rollout/sql/postcheck-0009.sql` and the baseline counts, and save to `specs/001-b2-live-rollout/rollout/evidence/A-0009.json`.
  - PASS requires A-0009-01…02 and no count change.
  - Any FAIL → STOP and go to Phase R (T063).
  - On PASS, go to Phase 8 **immediately** (risk R1: the two-argument `SECURITY DEFINER` function is exposed until 0010).

**Checkpoint**: 0009 VERIFIED.

---

## Phase 8: User Story 2 — Apply 0010 (Priority: P1)

- [ ] T041 [US2] Re-check the hash of `supabase/migrations/0010_b2_cost_integrity.sql`.
  - `apply_migration(name = "b2_0010_cost_integrity", …)`.
  - Log it.
  - On error → STOP, no retry, and **first** go to Phase R (T064) to drop the two-argument function, then inventory.
- [ ] T042 [US2] **Post-check 0010:** run `rollout/sql/postcheck-0010.sql`, `rollout/sql/privileges.sql`, and the baseline counts. Save to `specs/001-b2-live-rollout/rollout/evidence/A-0010.json`.
  - PASS requires A-0010-01…09 all PASS, with the only count deltas being +1 `system_settings` and +1 `storage.buckets`.
  - Any FAIL → STOP and go to Phase R (T065).
- [ ] T043 [US2] Run MCP `list_migrations` and confirm the three entries `b2_0008_pricing_foundation`, `b2_0009_publish_rpc`, and `b2_0010_cost_integrity`, in order. Record them in `rollout-record.md`.

**Checkpoint**: All three migrations VERIFIED. The schema is ready for verification.

---

## Phase 9: User Story 3 — Live Synthetic Verification (Priority: P2)

**Goal**: Prove B2's guarantees on Live with `[TEST]` fixtures, which are never committed (spec FR-008/009/011; DN-2 = A; DN-3 = C).

**Independent Test**: `specs/001-b2-live-rollout/rollout/evidence/verification.json` lists every B and S item with a PASS / FAIL / NOT TESTED result and evidence.

- [ ] T044 [US3] Pre-verification count snapshot: run `rollout/sql/baseline-counts.sql` and save to `specs/001-b2-live-rollout/rollout/evidence/09-pre-verify-counts.json`.
- [ ] T045 [US3] Run B-01 (unmapped row blocks publish) from `rollout/sql/verify-B01-B04.sql` via `execute_sql`. Parse `B2_VERIFY_RESULT` and save to `specs/001-b2-live-rollout/rollout/evidence/B-01.json`. Any termination other than `B2_VERIFY_RESULT` = FAIL.
- [ ] T046 [US3] Run B-02 (invalid cost / error row blocks publish) and save to `evidence/B-02.json`.
- [ ] T047 [US3] Run B-03 (an ignored error row plus a valid row publishes 1 row) and save to `evidence/B-03.json`.
- [ ] T048 [US3] Run B-04 (mid-publish failure rolls back: 0 cost rows, 0 mappings, 0 audit rows, status unchanged) and save to `evidence/B-04.json`.
- [ ] T049 [US3] Run B-05…B-08 from `rollout/sql/verify-B05-B08.sql`:
  - Nov 1464 / Dec 1520 both kept;
  - UPDATE refused;
  - re-publish refused;
  - effective cost by date, with no future cost.
  Save to `evidence/B-05.json` … `B-08.json`.
- [ ] T050 [US3] Run B-09a (non-member synthetic UUID refused, fail-closed) and B-09b (staff via the transaction-local profile change refused) from `rollout/sql/verify-B09-B12.sql`. Save to `evidence/B-09a.json` and `B-09b.json`.
- [ ] T051 [US3] Run B-10 (policy change creates a new version; 1 open row per tier) and save to `evidence/B-10.json`.
- [ ] T052 [US3] Run B-11 (RLS: staff reads but can't write; anon gets nothing) and save to `evidence/B-11.json`.
- [ ] T053 [US3] Run B-12 (B1 cost rows untouched and ignored by the resolver) and save to `evidence/B-12.json`.
- [ ] T054 [US3] App smoke test S-01…S-03 (contracts §S), read-only on the deployed app:
  - an admin opens `/costs` and `/settings/pricing-policy` (three tiers at 25/20/15%);
  - the quote page for a product with no cost shows the no-cost message, and nothing is saved.
  The owner performs it, or the agent does if the owner provides a logged-in browser session. Record each item; if it can't be performed → **NOT TESTED** with the reason (never PASS).
- [ ] T055 [US3] Compile `specs/001-b2-live-rollout/rollout/evidence/verification.json` in the contracts format, from T038/T040/T042 (§A), T045–T054 (§B/§S), and any BLOCKED items from T029. Summary counts `pass`, `fail`, and `not_tested` are kept separately.

**Checkpoint**: Every B/S item has an explicit result.

---

## Phase 10: User Story 3 — Cleanup and Reconciliation (Priority: P2)

**Goal**: Prove zero test residue and unchanged non-test data (spec FR-010, SC-003/004).

- [ ] T056 [US3] Run `rollout/sql/cleanup-reconcile.sql` (C-01) and save to `specs/001-b2-live-rollout/rollout/evidence/C-01.json`.
  - It must find 0 test-marker rows in all listed tables, and the test subject's `user_profiles` row must be identical to T029.
  - Any residue → FAIL. List the residue rows by ID for the owner, and do **not** delete anything without approval (Phase R, T067).
- [ ] T057 [US3] C-02: compare the current `baseline-counts.sql` output with `01-baseline-counts.json` plus the expected R-7 seed deltas, and with `09-pre-verify-counts.json`, which must be exactly equal. Save to `evidence/C-02.json`. Any mismatch → FAIL, and investigate (it may be real user activity).
- [ ] T058 [US3] C-03: run MCP `get_advisors` again and diff it against `01-advisors-baseline.json`. Save to `evidence/C-03.json`. A new security ERROR from a B2 object → FAIL. New WARNs are recorded as advisory.

**Checkpoint**: Cleanup proven.

---

## Phase 11: Final Verdict and Rollout Record

**Purpose**: One honest verdict (spec FR-011/014, SC-001…008; data-model "Verdict rules").

- [ ] T059 Apply the verdict rules to `verification.json` plus the gate results:
  - stopped before any migration → **BLOCKED**;
  - any required FAIL, migration error, residue, or count mismatch → **FAIL**;
  - any required NOT TESTED or BLOCKED item → **INCOMPLETE (not PASS)**, with every such item listed with its reason;
  - otherwise **PASS**.
  Write the verdict and the PASS / FAIL / NOT TESTED counts, never merged, into `verification.json` and `rollout-record.md`.
- [ ] T060 Finalize `specs/001-b2-live-rollout/rollout/rollout-record.md`: complete the step log, backup locations (paths only), migration map, verdict, and follow-ups. Update `.specify/memory/project-state.md`: "Live migrations 0008–0010" becomes applied/verified, or the actual state. Commit and push the feature branch. Backups and dumps are **not** committed (G4).

**Checkpoint**: Rollout recorded; the verdict is stated.

---

## Phase R: Failure and Recovery (conditional — run only when G1 sends you here)

**Purpose**: Spec US4 / FR-012. Every action here requires **explicit owner approval** recorded in `rollout-record.md` before it runs. Afterwards, re-run the inventory to confirm.

- [ ] T061 [US4] **0008 apply error:**
  - run `preflight-inventory.sql` to get the actual 0008 state;
  - if ABSENT → record the cause and propose a fix as a separate approved change; the run ends FAIL;
  - if PARTIAL → propose `rollout/recovery/R-0008.sql` or a restore, and on approval run it;
  - confirm the inventory shows the 0008 objects ABSENT.
- [ ] T062 [US4] **0008 post-check FAIL:** propose `R-0008.sql`, or keep 0008 and fix forward in a separate change. On approval, execute it and confirm the inventory equals the pre-0008 state. The run ends FAIL.
- [ ] T063 [US4] **0009 error or post-check FAIL:** propose `R-0009.sql`, which drops the two-argument function. On approval, run it, then confirm the function is absent and A-0008 still passes. The run ends FAIL, with 0008 kept.
- [ ] T064 [US4] **0010 apply error:**
  - **first** propose and, on approval, run `R-0009.sql` to remove the exposed two-argument function (risk R1);
  - then inventory the 0010 state;
  - if PARTIAL → propose `R-0010.sql` or a restore.
  - Confirm with the inventory. The run ends FAIL.
- [ ] T065 [US4] **0010 post-check FAIL:** classify the failing items.
  - If unsafe (missing RLS, a missing REVOKE, `anon` can execute a function, the bucket is public) → propose `R-0010.sql` + `R-0009.sql`, or a restore.
  - Otherwise → keep the schema and propose a forward-fix migration as a separate approved change.
  - The run ends FAIL.
- [ ] T066 [US3] **Verification FAIL (any B or S item):** keep the schema, since the app needs it. Record the evidence and tell the owner that admins should not publish price lists until the fix ships. The forward fix is a separate spec or change. The run ends FAIL.
- [ ] T067 [US3] **Cleanup residue or count mismatch:** list the residue IDs and mismatched tables. Propose maintenance-role deletion only for confirmed test-marker rows, or an investigation for mismatches. Act only on approval, then re-run T056/T057. The run stays FAIL unless the re-run is clean **and** the owner accepts.
- [ ] T068 [US4] **Severe or unknown state:**
  - propose a restore from Layer 3 (`pg_restore` of `yuan-erp-pre-b2.dump`) or from Layer 1 PITR, if one was confirmed, warning that real activity after the restore point is lost;
  - on approval, restore;
  - re-run Phase 3 (T022–T030) and confirm the inventory and counts equal the pre-rollout record.

---

## Dependencies and Execution Order

### Phase Dependencies (strictly sequential, as the owner instructed)

```text
P1 Local sanity ─▶ P2 Author+dry-run ─▶ P3 Preflight (US1) ─▶ P4 Backup gate (US4) ─▶ P5 Approval
   ─▶ P6 0008 + post-check ─▶ P7 0009 + post-check ─▶ P8 0010 + post-check (US2)
   ─▶ P9 Synthetic verification (US3) ─▶ P10 Cleanup/reconcile (US3) ─▶ P11 Verdict/record
Any FAIL/ERROR/BLOCKED ─▶ STOP ─▶ Phase R (owner-approved) ─▶ P11 records the outcome
```

- A migration phase starts only when the previous one is VERIFIED (data-model step state machine).
- Phase 7 → Phase 8 has no pause beyond the post-check (R1).
- Phase R tasks are conditional. Unused Phase R tasks are recorded as "not triggered", which is not a result and not PASS.

### User Story Dependencies

- US1 (preflight) → US4 backup gate → US2 (apply) → US3 (verify / cleanup).
- US4 recovery tasks are written in Phase 2, but executed only from Phase R.
- This rollout is inherently sequential; stories are not independently deployable.

### Parallel Opportunities

- **Only Phase 2 authoring** (T004–T018) is parallel, since they are different files and local only.
- Every Live task runs strictly one at a time.

```text
# Parallel example (Phase 2, local only):
Task: "Write rollout/sql/postcheck-0008.sql"
Task: "Write rollout/sql/postcheck-0009.sql"
Task: "Write rollout/sql/postcheck-0010.sql"
Task: "Write rollout/recovery/R-0008.sql"
```

---

## Implementation Strategy

- **No MVP slicing.** The deliverable is a fully verified Live schema. The earliest safe stopping points are:
  - the end of Phase 3, where the verdict is known and Live is unchanged;
  - the end of Phase 4, where backups are verified.
- **Approval gates:**
  - G-A: owner approval to start (T036, mandatory);
  - G-R: owner approval before every Phase R action;
  - G-P: the owner types the DB password in the terminal (T034).
  The Phase 3 BLOCKED/NOT TESTED notice (T029) and the Layer 1 dashboard check (T032) may also need the owner.
- **Done means** T059 states a verdict, with PASS only under the rules above.

## Notes

- No product features and no application code changes. The only new repo files are under `specs/001-b2-live-rollout/rollout/`, plus the project-state update.
- Evidence holds counts, IDs, and results only. Data exports and dumps stay outside the repo.
- Constitution III: NOT TESTED / SKIPPED / BLOCKED never count as PASS anywhere in this task list.
