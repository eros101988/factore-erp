# Rollout Record: 002 Live Security Remediation

Evidence holds catalog facts, counts and fingerprints only. Backups (later, G3) stay outside the repo.

## Migration map (history names = repo filenames)
| File | Blob | Live status |
|---|---|---|
| 0009a_revoke_legacy_publish.sql | cc9632f1 | NOT applied (awaiting T006 approval) |
| 0009b_fix_rls_recursion.sql | - | not authored yet (T009) |
| 0010_b2_cost_integrity.sql | 7fa1e20d | not applied; owned by 001 |

## Step log (append-only)
| seq | at | actor | task | action | outcome | evidence |
|---|---|---|---|---|---|---|
| 1 | 2026-11-07 23:51 (Asia/Taipei) | agent | T001 | local baseline (hashes, vitest 48/48) | PASS | evidence/00-local.txt |
| 2 | 2026-11-07 23:51 (Asia/Taipei) | agent | T002 | security matrix test + baseline | PASS (baseline reproduces F2/F4/F5) | evidence/00-baseline.txt |
| 3 | 2026-11-07 23:51 (Asia/Taipei) | agent | T003 | author 0009a + R-0009a template | PASS | evidence/00-local.txt |
| 4 | 2026-11-07 23:51 (Asia/Taipei) | agent | T004 | local L-04/L-05 + reversal (vitest 51/51) | PASS | evidence/00-local.txt |
| 5 | 2026-11-07 23:51 (Asia/Taipei) | agent | T005 | Live read-only snapshot; R-0009a finalized | PASS; usage NO; Live unchanged | evidence/01-containment-snapshot.md |
| 6 | 2026-11-07 23:51 (Asia/Taipei) | agent | STOP | stopped after T005 per owner instruction; T006 not started | STOPPED | - |

## Verdict
_pending (T017)_
