---
description: "Task list for Live Security Remediation (002-live-security-remediation)"
---

# Tasks: Live Security Remediation

**Input**: `specs/002-live-security-remediation/`. The "how" lives in plan.md (Decisions 1–6), research.md, contracts/access-model.md, contracts/verification-matrix.md (§L/§C/§M/§R/§S), and quickstart.md. Tasks state only **what** and the **acceptance**.

**Story labels**:
- US1 = containment
- US2 = recursion fix
- US3 = regression proof
- US4 = migration order
- US5 = hand-back to 001

**Results**: PASS / FAIL / NOT TESTED / BLOCKED. **NOT TESTED, BLOCKED, and SKIPPED never count as PASS.**

## Rules for every task

- **R1 Stop:** the first ERROR or FAIL stops the run. Log it, then go to Phase R. No skipping, and no retry of a failed `apply_migration`.
- **R2 Live access** is read-only except:
  - T007 (apply 0009a) and T014 (apply 0009b);
  - the forced-rollback probes in T008 and T015.
  Each write needs its **own** owner approval (T006, T013). No Live task runs in parallel.
- **R3 Order:** containment comes first. **No 0009b Live work (T011–T014) starts until T008 is PASS** (D-3).
- **R4 Scope:**
  - never edit, renumber, or apply `0010_b2_cost_integrity.sql`, or any other existing migration (FR-018);
  - no application code;
  - no business data;
  - no `auth.users` writes;
  - the DB password is typed by the owner into a terminal only;
  - backups stay outside the repo.
- **R5 001 is frozen:** `001-b2-live-rollout` stays STOPPED with T006 = FAIL. No 001 task runs here (FR-024).
- **R6 Logging:** every Live action goes into `specs/002-live-security-remediation/rollout/rollout-record.md`: time (Asia/Taipei), actor, change, outcome, evidence (FR-023). History names equal the repo filenames.

---

## Phase 1: Local baseline (no Live access)

- [X] T001 Create `rollout/` (`rollout-record.md`, `evidence/`, `sql/`, `recovery/`). Record the hashes of migrations 0001–0010; `0010_b2_cost_integrity.sql` must be unchanged. Run `npx vitest run`.
  - **Acceptance:** `evidence/00-local.txt` shows the hashes and a vitest pass.
- [X] T002 [US3] Author `tests/security_rls_matrix.test.ts`: a PGlite replay helper (fresh and Live-like), the five-role matrix driven by contracts/access-model.md, and inventory/ACL comparison helpers (research R-5).
  - **Acceptance:** on the current repo (0001 → 0009, no fix), the test runs and reproduces the known recursion cells as the documented **baseline**, recorded in `evidence/00-baseline.txt`. It is not yet expected to pass.

---

## Phase 2: Containment, local (US1)

- [X] T003 [US1] Author `supabase/migrations/0009a_revoke_legacy_publish.sql` (plan Decision 1: revoke from `PUBLIC`, `anon`, `authenticated`; nothing else) and a template for `rollout/recovery/R-0009a.sql` (a GRANT back to the grantees that T005 records).
  - **Acceptance:** 0009a contains only the revoke. The reversal template exists.
- [X] T004 [US1] Local verification of 0009a: §L-04 and §L-05. Also dry-run `R-0009a.sql` locally and time it.
  - **Acceptance:**
    - after 0009a, anon, authenticated, and PUBLIC can't execute the two-argument function, and nothing else differs from post-0009;
    - the full suite passes;
    - the reversal restores the post-0009 ACL in under 15 minutes (SC-007).

---

## Phase 3: Containment, Live (US1) — gates G1 → G2

- [X] T005 [US1] Take the Live **read-only** pre-containment snapshot (plan Decision 6, G1):
  - re-confirm facts F1–F6;
  - the two-argument function's `proacl` and per-role EXECUTE;
  - the object inventory, row counts, and the usage baseline (§C-06).
  Then finalize `R-0009a.sql` with the recorded grantees.
  - **Acceptance:** evidence is saved under `evidence/01-*`. If the usage check is non-zero or F1–F6 no longer hold → STOP and report.
- [X] T006 [US1] **Owner approval gate (containment).** Present the snapshot, the exact 0009a content, and R-0009a. Get explicit approval in chat.
  - **Acceptance:** the approval is quoted verbatim with a timestamp in `rollout-record.md`. Missing or ambiguous approval → BLOCKED.
- [X] T007 [US1] Apply 0009a via MCP `apply_migration` (name `0009a_revoke_legacy_publish.sql`, exact file content, hash re-checked).
  - **Acceptance:** no error. An error → STOP, then Phase R (T019).
- [X] T008 [US1] **Independently verify containment**: §C-01…C-06.
  - **Acceptance:** all PASS, with evidence in `evidence/C-*.json`. This is gate **G2**; T011 and later can't start without it. Any FAIL → Phase R (T019).

---

## Phase 4: Permanent fix, local (US2, US4)

- [ ] T009 [US2] Author `supabase/migrations/0009b_fix_rls_recursion.sql` per plan Decision 3 and D-2:
  - harden the helpers (`search_path = ''`, `public.user_profiles`, `STABLE`, semantics unchanged);
  - rewrite the 3 `user_profiles` policies;
  - rewrite the 12 B1 and 6 B2 policies, keeping their names and adding an explicit `WITH CHECK` on admin ALL.
  - **Acceptance:** it touches only those objects. No S1 policy, no `auth.users`, no data.
- [ ] T010 [US3] [US4] Local fresh replay + five-role matrix: §L-01, §L-02, §L-03, §L-05.
  - **Acceptance:** all PASS, which means:
    - 0 recursion errors and every access-model cell matching;
    - 0010 leaves the 0009b policies unchanged and the two-argument function absent (FR-019);
    - the Live-like replay equals the fresh replay object by object (FR-017, SC-005 local part).

---

## Phase 5: Backup gate for 0009b (US2) — gate G3 (requires T008 PASS)

- [ ] T011 [US2] Take the Live **read-only** pre-0009b snapshot: the current `user_profiles`, B1, and B2 policy definitions, the helper definitions, the inventory, and row counts. Generate `rollout/recovery/R-0009b.sql` from it (plan Decision 6).
  - **Acceptance:** the snapshot is saved, and R-0009b restores exactly the snapshotted definitions (dry-run locally on a Live-like replay).
- [ ] T012 [US2] Three-layer backup gate (plan G3; 001 DN-1 = C):
  - L1: platform backup / PITR status recorded;
  - L2: MCP export, counts matching;
  - L3: `pg_dump -Fc`, with the owner typing the password in a terminal tab the agent opens, then `pg_restore --list` succeeding.
  - **Acceptance:** `evidence/02-backup.json` holds paths and verification only. **PASS only if L2 and L3 are verified and L1 is recorded**; otherwise BLOCKED.

---

## Phase 6: Permanent fix, Live (US2)

- [ ] T013 [US2] **Owner approval gate (0009b).** Present G2 PASS, the T010 matrix result, the T011 snapshot, the T012 backup record, the exact 0009b content, and R-0009b. Get explicit approval in chat.
  - **Acceptance:** the approval is quoted verbatim with a timestamp. Missing or ambiguous approval → BLOCKED.
- [ ] T014 [US2] Apply 0009b via MCP `apply_migration` (name `0009b_fix_rls_recursion.sql`, exact content, hash re-checked).
  - **Acceptance:** no error. An error → STOP, then Phase R (T020).

---

## Phase 7: Live regression and reconciliation (US3)

- [ ] T015 [US3] Run the Live five-role matrix §M-01…M-08 (A/S/I/N/X × profile / B1 / B2 / S1 control / helpers / two-argument publish) as forced-rollback transactions, with no Auth users.
  - **Acceptance:** every cell matches contracts/access-model.md, with 0 recursion errors and the 0009b history entry right after 0009a. A cell that can't be simulated → BLOCKED / NOT TESTED with a reason. Any FAIL → Phase R (T021).
- [ ] T016 [US3] Reconciliation §R-01…R-03 and app smoke §S-01…S-02, plus a Live-vs-local inventory comparison.
  - **Acceptance:**
    - non-test counts are identical before 0009a, before 0009b, and now;
    - 0 test residue; the test subject's profile is unchanged;
    - no new advisor security ERROR;
    - the Live object inventory equals the T010 fresh replay post-0009b (SC-005);
    - §S is PASS, or NOT TESTED with a reason (FR-016).
    - Residue or a mismatch → Phase R (T022).

---

## Phase 8: Verdict and hand-back

- [ ] T017 Compile `evidence/verification.json` and apply the verdict rules from contracts/verification-matrix.md (BLOCKED / FAIL / INCOMPLETE / PASS). Finalize `rollout-record.md`, and update `.specify/memory/project-state.md`.
  - **Acceptance:** PASS only if every required §L/§C/§M/§R/§S item is PASS. The four counts are reported separately, and every NOT TESTED or BLOCKED item is listed with its reason.
- [ ] T018 [US5] Write `rollout/handback-to-001.md` from plan Decision 5. It covers:
  - the new expected Live state (0001–0009, 0009a, 0009b applied; 0010 absent; preflight verdict READY-FOR-0010);
  - the inventory changes;
  - the 001 tasks to re-run (T001–T008);
  - removing 001's 0008/0009 apply steps;
  - the history naming convention;
  - 0010 being owned by 001.
  Confirm 001 is still STOPPED with T006 = FAIL. Commit and push.
  - **Acceptance:** the note exists only if T017 = PASS; otherwise it records why 001 stays frozen. No 001 file is edited by 002 beyond this note.

---

## Phase R: Conditional recovery (only when R1 sends you here)

Every action needs **explicit owner approval** recorded before it runs. Each ends with a confirming inventory and counts. The verdict stays FAIL, or BLOCKED if the stop came before 0009a. Tasks that are never triggered are recorded as "not triggered", which is not a result.

- [ ] T019 [US1] **0009a apply error, or §C FAIL:** inspect the actual ACL and history.
  - If containment is partial or wrong → propose `R-0009a.sql` or a corrected containment as a separate approved change.
  - **Acceptance:** the state is recorded; 0009b work stays blocked; the owner is told whether the exposure is still open.
- [ ] T020 [US2] **0009b apply error:** inspect. Since `apply_migration` runs in one transaction, the expected state is unchanged, which must be verified against the T011 snapshot. Propose a fix-forward in a separate change.
  - **Acceptance:** the inventory matches the T011 snapshot, or the actual state is recorded.
- [ ] T021 [US2] **§M FAIL:** classify the failure.
  - **Fail-open** (any cell grants more than the access model) → propose `R-0009b.sql`, or a restore from L3, immediately.
  - **Fail-closed or recursion remaining** → keep 0009b and propose a fix-forward migration.
  - **Acceptance:** the decision, the approval, and the resulting state are recorded, then the matrix is re-run.
- [ ] T022 [US3] **Residue, count mismatch, or severe/unknown state:**
  - list the residue (delete only after owner review, with the maintenance role);
  - investigate mismatches;
  - for a severe state, restore from L3 (`pg_restore`) or a confirmed L1 PITR, warning that later real activity is lost.
  - **Acceptance:** a re-run of T016 or T005 matches the recorded snapshot.

---

## Dependencies

```text
T001 ─▶ T002 ─▶ T003 ─▶ T004 ─▶ T005 ─▶ T006 ─▶ T007 ─▶ T008 (G2)
T008 PASS ─▶ T011 ─▶ T012 ─▶ T013 ─▶ T014 ─▶ T015 ─▶ T016 ─▶ T017 ─▶ T018
T009 ─▶ T010 (local; may run after T004, but must PASS before T013)
any FAIL / ERROR / BLOCKED ─▶ STOP ─▶ T019–T022 (owner-approved) ─▶ T017 records the outcome
```

- Parallel: only local authoring, i.e. T009–T010 alongside T005–T008. It touches different files and no Live writes.
- Owner touchpoints:
  - T006 (approve 0009a);
  - T012 (L3 password; L1 dashboard, if MCP can't see it);
  - T013 (approve 0009b);
  - T016 §S, if no logged-in session is provided;
  - every Phase R action.
