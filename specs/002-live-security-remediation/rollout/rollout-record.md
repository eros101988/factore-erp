# Rollout Record: 002 Live Security Remediation

Evidence holds catalog facts, counts and fingerprints only. Backups (later, G3) stay outside the repo.

## Migration map (history names = repo filenames)
| File | Blob | Live status |
|---|---|---|
| 0009a_revoke_legacy_publish.sql | cc9632f1 | APPLIED 2026-11-08 00:13 (Asia/Taipei) (history version 20261107161231); G2 PASS |
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
| 7 | 2026-11-08 00:12 (Asia/Taipei) | owner | T006 | explicit approval for 0009a (quoted below) | APPROVED | rollout-record.md |
| 8 | 2026-11-08 00:13 (Asia/Taipei) | agent | T007 | apply_migration 0009a_revoke_legacy_publish.sql (pre-checks: blob, project, usage, snapshot unchanged) | OK | evidence/C-containment.md |
| 9 | 2026-11-08 00:13 (Asia/Taipei) | agent | T008 | containment verification C-01..C-06 | PASS 6/6 (G2 PASS) | evidence/C-containment.md |
| 10 | 2026-11-08 00:13 (Asia/Taipei) | agent | STOP | stopped after T008 per owner instruction; 0009b/0010 not started | STOPPED | - |

## Verdict
_pending (T017)_

## T006 Owner approval (containment)
Recorded 2026-11-08 00:12 (Asia/Taipei). Quoted verbatim from the owner:
> 我明確批准 T006。本次只授權執行：T007：將已合併至 main 的 `0009a_revoke_legacy_publish.sql` 套用到目前確認的 Live Supabase project。T008：完成 containment 的獨立驗證。本次批准僅限 0009a containment。不授權：0009b、0010、任何其他 migration、任何 business data 修改、任何 recovery action。
Scope: 0009a apply + T008 verification only. Valid for this run only.
Pre-apply re-checks (2026-11-08 00:12 (Asia/Taipei)): main blob cc9632f1 == verified; project mdyldmshwapikwnhlkvs ACTIVE_HEALTHY; usage 0/0/0; ACL, counts and all catalog md5 identical to T005.
