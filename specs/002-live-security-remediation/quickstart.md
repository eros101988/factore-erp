# Quickstart: 002 run-sheet

Stop at the first ✗. Every Live write needs the owner's explicit approval first.

| # | Gate | Do | Pass when |
|---|---|---|---|
| 1 | G0 | Write `0009a`, `0009b`, `R-0009a.sql`, `R-0009b.sql`, and `tests/security_rls_matrix.test.ts`; run `npx vitest run` | §L all PASS |
| 2 | G1 | Live read-only snapshot: `proacl`, inventory, counts, usage check (§C-06 baseline) | Recorded; facts F1–F6 re-confirmed |
| 3 | G1 | Owner approves containment | Approval quoted in the rollout record |
| 4 | — | `apply_migration("0009a_revoke_legacy_publish.sql", <exact file>)` | No error |
| 5 | G2 | Run §C-01…06 | All PASS (else STOP → `R-0009a.sql` on approval) |
| 6 | G3 | Backup gate L1/L2/L3 (as in 001 DN-1 = C; the owner types the password in a terminal); snapshot the old policy and helper definitions into `R-0009b.sql` | L2 + L3 verified |
| 7 | G3 | Owner approves the permanent fix | Approval quoted |
| 8 | — | `apply_migration("0009b_fix_profile_rls_recursion.sql", <exact file>)` | No error |
| 9 | G4 | §M, §R, §S | All PASS → 002 PASS; NOT TESTED → INCOMPLETE |
| 10 | — | Write `rollout/handback-to-001.md` and update `.specify/memory/project-state.md` | 001 is ready to restart from T001 |
