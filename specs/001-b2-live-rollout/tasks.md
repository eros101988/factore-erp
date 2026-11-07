---
description: "Task list for B2 Live Rollout (001-b2-live-rollout)"
---

# Tasks: B2 Live Rollout

**Input**: `specs/001-b2-live-rollout/`. How to do each step is in plan.md, research.md, quickstart.md, and contracts/. Tasks state only **what** and the **acceptance**.

**Story labels**:
- US1 = preflight
- US2 = apply migrations
- US3 = verify / cleanup
- US4 = backup / recovery

**Results**: every task ends PASS, FAIL, NOT TESTED, or BLOCKED. **NOT TESTED / BLOCKED / SKIPPED never count as PASS.**

## Rules for every task

- **R1 Stop:** any FAIL or ERROR stops the run. Log it, then go to Phase R. Never skip a task. Never retry a failed `apply_migration`.
- **R2 Live access** is read-only except T010, T012, T014 (`apply_migration`) and T015 (forced-rollback transactions). No Live task runs in parallel.
- **R3 Data and secrets:**
  - Evidence holds counts, IDs, and results only.
  - Exports and dumps stay outside the repo (`%USERPROFILE%\Backups\yuan-erp\<run>\`).
  - No `auth.users` writes.
  - The DB password is typed by the owner into a terminal prompt only.
- **R4 Logging:** every Live action is logged in `rollout/rollout-record.md` (format: data-model.md "Rollout Record").
- **R5 Scope:** no product features, no application code, no new or edited migration files, and no real supplier PDFs or business data. A defect found → STOP; the fix is a separate approved change (FR-015).

---

## Phase 1: Local sanity and preparation (no Live access)

- [ ] T001 Create `specs/001-b2-live-rollout/rollout/` (`rollout-record.md`, `evidence/`, `sql/`, `recovery/`). Record the migration-name ↔ file map (plan Stage 4).
  - **Acceptance:** the files exist, with the sections from data-model.md.
- [ ] T002 Local sanity (plan Stage 0).
  - **Acceptance:**
    - clean tree, up to date with `main`;
    - hashes of `supabase/migrations/0008_*.sql`, `0009_*.sql`, `0010_*.sql` recorded and unchanged since the B2 merge;
    - `npx vitest run` passes 48/48;
    - evidence in `rollout/evidence/00-local.txt`.
- [ ] T003 [P] Author the read-only SQL in `rollout/sql/`: preflight inventory, conflicts, baseline counts, privileges, and test-subject lookup (contracts/inspection-report.md); post-checks for 0008, 0009, and 0010 (contracts/verification-result.md §A); cleanup/reconciliation (§C).
  - **Acceptance:** every check in those sections maps to a query that returns `{id, result, detail}`.
- [ ] T004 [P] Author the B-check scripts in `rollout/sql/verify-*.sql` for every §B item. They use forced-rollback transactions (research R-3) and identity simulation (research R-4, no Auth users).
  - **Acceptance:** each script always ends in `B2_VERIFY_RESULT`, and any other ending is FAIL.
- [ ] T005 [P] [US4] Author the reverse scripts `rollout/recovery/R-0008.sql`, `R-0009.sql`, and `R-0010.sql`, plus `recovery-runbook.md`, following the plan's "Failure & Recovery" table.
  - **Acceptance:**
    - each script is guarded and transactional;
    - each aborts if B2 tables or the bucket hold data;
    - the runbook has an action and a confirmation query per stop point.
- [ ] T006 Dry-run T003–T005 on a local PGlite database built from migrations 0001–0010, then commit `rollout/`.
  - **Acceptance:**
    - all queries run;
    - the B-checks return all PASS on PGlite;
    - the reverse scripts restore the pre-step inventory;
    - the result is logged in `00-local.txt`.

---

## Phase 2: Read-only Live preflight (US1)

- [ ] T007 [US1] Run the full preflight from contracts/inspection-report.md:
  - project identity (ref equals the `NEXT_PUBLIC_SUPABASE_URL` host, ACTIVE_HEALTHY)
  - migration history
  - object inventory
  - conflicts
  - baseline counts
  - Data API privileges
  - advisors baseline
  - test subject
  **Acceptance:**
  - `rollout/evidence/01-*.json` saved;
  - a recount equals the baseline, proving it was read-only;
  - verdict written to `rollout-record.md`;
  - verdict ≠ READY → STOP, with a state-specific recovery proposal (Phase R);
  - test subject not an active admin → the dependent B-checks are marked BLOCKED/NOT TESTED and the owner is told now (no Auth user is created).

---

## Phase 3: Backup gate (US4) — plan Stage 2, research R-2

- [ ] T008 [US4] Take the three backup layers (plan Stage 2 and research R-2 give the commands, connection, and verification):
  - **L1:** record daily backup / PITR status;
  - **L2:** MCP schema snapshot + `public` data export, counts matching the baseline;
  - **L3:** `pg_dump -Fc` through the session pooler; the owner types the password in a terminal tab the agent opens; then `pg_restore --list`.
  **Acceptance:**
  - `rollout/evidence/02-backup.json` holds paths and verification results only;
  - **gate PASS only if L2 and L3 are verified and L1 is recorded**;
  - otherwise BLOCKED, with 0 migrations applied.

---

## Phase 4: Explicit owner approval

- [ ] T009 [US2] Present the preflight verdict, the Backup Record, risk R1, and the Phase 5 actions. Obtain the owner's explicit approval in chat.
  - **Acceptance:** the approval is quoted verbatim with a timestamp in `rollout-record.md`. Missing or ambiguous approval → BLOCKED. Valid for this run only.

---

## Phase 5: Apply migrations in order (US2) — plan Stage 4

- [ ] T010 [US2] Apply 0008 via MCP `apply_migration` (name `b2_0008_pricing_foundation`, exact file content, hash re-checked).
  - **Acceptance:** no error. An error → STOP, inventory the actual state, then Phase R (T020).
- [ ] T011 [US2] **Post-check 0008**: contracts §A-0008.
  - **Acceptance:** A-0008-01…05 all PASS; the only count change is +3 `pricing_policies`; evidence in `A-0008.json`. Otherwise Phase R (T020).
- [ ] T012 [US2] Apply 0009 (`b2_0009_publish_rpc`) under the same rules as T010 (hash re-check, exact content, no retry).
  - **Acceptance:** no error. An error → STOP, inventory, then Phase R (T021).
- [ ] T013 [US2] **Post-check 0009**: contracts §A-0009.
  - **Acceptance:** all PASS, no count change, `A-0009.json`. On PASS go straight to T014 (risk R1). Otherwise Phase R (T021).
- [ ] T014 [US2] Apply 0010 (`b2_0010_cost_integrity`) under the same rules as T010, then **post-check 0010**: contracts §A-0010, and `list_migrations` shows the three `b2_*` entries in order.
  - **Acceptance:** no error; A-0010-01…09 all PASS; the only count deltas are +1 `system_settings` and +1 `storage.buckets`; `A-0010.json`.
  - Apply error → Phase R (T022), which **first** removes the two-argument function.
  - Post-check FAIL → Phase R (T023).

---

## Phase 6: Synthetic verification and cleanup on Live (US3) — DN-2 = A, DN-3 = C

- [ ] T015 [US3] Run every §B check (B-01…B-12, including B-09a and B-09b) as forced-rollback transactions, with counts taken before.
  - **Acceptance:** one result per item in `rollout/evidence/B-*.json`; any non-`B2_VERIFY_RESULT` termination = FAIL; items blocked by the test subject = BLOCKED / NOT TESTED.
- [ ] T016 [US3] App smoke test §S (S-01…S-03), read-only on the deployed app, performed by the owner or by the agent with an owner-provided session.
  - **Acceptance:** each item PASS / FAIL, or NOT TESTED with a reason.
- [ ] T017 [US3] Cleanup and reconciliation, §C (C-01…C-03).
  - **Acceptance:**
    - 0 test-marker rows;
    - the test subject's profile is unchanged;
    - non-test counts equal the baseline plus the R-7 seeds, and equal the pre-verification counts exactly;
    - no new advisor security ERROR.
    - Any residue or mismatch → FAIL; list it for the owner, and delete nothing without approval (T024).

---

## Phase 7: Final verdict and rollout record

- [ ] T018 Compile `rollout/evidence/verification.json` (contracts format) and apply the data-model.md "Verdict rules": BLOCKED / FAIL / INCOMPLETE / PASS.
  - **Acceptance:** PASS only if every required item is PASS. The PASS, FAIL, and NOT TESTED counts are reported separately and never merged. Every NOT TESTED or BLOCKED item is listed with its reason.
- [ ] T019 Finalize `rollout-record.md` and update `.specify/memory/project-state.md` (Live migration status). Commit and push the feature branch.
  - **Acceptance:** the record answers "what state is Live in" without re-inspecting (SC-005); no backup or data file is committed.

---

## Phase R: Conditional failure and recovery (US4) — only when R1 sends you here

Every action needs **explicit owner approval**, recorded before it runs. Procedures are in `rollout/recovery/recovery-runbook.md` and the plan's "Failure & Recovery" table. Each ends with a confirming inventory, and the run's verdict is FAIL (or BLOCKED if before any migration). Tasks that are never triggered are recorded as "not triggered", which is not a result.

A stop **before any migration** (T002–T009) needs no recovery: record the cause (BLOCKED), and a re-run starts from T007.

- [ ] T020 [US4] **0008 error or post-check FAIL:** inventory, then propose `R-0008.sql`, a forward fix, or a restore.
  - **Acceptance:** after the approved action, the inventory shows the agreed state (pre-0008 or recorded).
- [ ] T021 [US4] **0009 error or post-check FAIL:** propose `R-0009.sql`.
  - **Acceptance:** the two-argument function is absent and A-0008 still PASS.
- [ ] T022 [US4] **0010 apply error:** **first** `R-0009.sql` (close the R1 window), then inventory, then `R-0010.sql` or a restore if PARTIAL.
  - **Acceptance:** the two-argument function is absent and the inventory is consistent.
- [ ] T023 [US4] **0010 post-check FAIL:** classify.
  - **Unsafe** (missing RLS or REVOKE, anon EXECUTE, public bucket) → `R-0010.sql` + `R-0009.sql`, or a restore.
  - **Otherwise** → keep the schema; a forward fix goes in a separate approved change.
  - **Acceptance:** the decision and the resulting state are recorded.
- [ ] T024 [US4] **Verification FAIL or cleanup residue/mismatch:**
  - keep the schema;
  - the owner is told not to publish price lists until a fix ships;
  - residue is deleted only after owner review, using the maintenance role, followed by a re-run of T017;
  - mismatches are investigated.
  - **Acceptance:** the evidence and follow-up are recorded; the run remains FAIL unless the re-run is clean and the owner accepts.
- [ ] T025 [US4] **Severe or unknown state:** restore from L3 (`pg_restore`) or a confirmed L1 PITR, after warning that real activity after the restore point is lost.
  - **Acceptance:** re-running T007 matches the pre-rollout record.

---

## Dependencies

```text
T001–T006 (local) ─▶ T007 preflight ─▶ T008 backup gate ─▶ T009 approval
 ─▶ T010 ─▶ T011 ─▶ T012 ─▶ T013 ─▶ T014 ─▶ T015 ─▶ T016 ─▶ T017 ─▶ T018 ─▶ T019
any FAIL / ERROR / BLOCKED ─▶ STOP ─▶ T020–T025 (owner-approved) ─▶ T018–T019 record outcome
```

- Only T003–T005 are parallel, since they are local authoring in different files.
- Each migration starts only after the previous post-check PASS.
- T013 → T014 has no pause (R1).
- Owner touchpoints:
  - T008 L3 password (and L1 dashboard, if MCP can't see it);
  - T009 approval;
  - T016 smoke test, if no session is provided;
  - every Phase R action.
