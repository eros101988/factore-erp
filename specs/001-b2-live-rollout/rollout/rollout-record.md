# Rollout Record: B2 Live Rollout

Format: data-model.md. Evidence holds counts, IDs, and results only. Backups live outside the repo.

## Migration map
| History name | Repo file | Blob hash |
|---|---|---|
| b2_0008_pricing_foundation | supabase/migrations/0008_b2_pricing_foundation.sql | 5316bd65 |
| b2_0009_publish_rpc | supabase/migrations/0009_b2_publish_rpc.sql | de11dcb9 |
| b2_0010_cost_integrity | supabase/migrations/0010_b2_cost_integrity.sql | 7fa1e20d |

## Inspection Report summary
_pending T007_

## Backup Record
_pending T008_

## Step log (append-only)
| seq | at (Asia/Taipei) | actor | stage | action | input_ref | outcome | evidence_ref |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-07 22:11 (Asia/Taipei) | agent | T001 | create rollout workspace | — | OK | — |
| 2 | 2026-11-07 22:11 (Asia/Taipei) | agent | T002 | local sanity (hashes, vitest) | git HEAD | PASS | evidence/00-local.txt |
| 3 | 2026-11-07 22:21 (Asia/Taipei) | agent | T003-T005 | author read-only SQL, B-check scripts, reverse scripts, runbook | rollout/sql, rollout/recovery | OK | — |
| 4 | 2026-11-07 22:21 (Asia/Taipei) | agent | T006 | PGlite dry-run of all authored SQL | rollout/* | FAIL (33 OK / 1 FAIL: B-11-staff, user_profiles RLS recursion from 0002) | evidence/00-dryrun.txt |
| 5 | 2026-11-07 22:21 (Asia/Taipei) | agent | STOP | run stopped per R1; T007+ not started; Live not accessed | — | STOPPED | — |
| 6 | 2026-11-07 (Asia/Taipei) | agent | DIAG | owner-requested read-only Live diagnostic (policies, functions, RLS probe, privileges, counts) | rollout/sql/rls-probe.sql | RECURSION CONFIRMED; 0008+0009 already applied on Live; 2-arg publish fn anon-executable; Live unchanged | evidence/01-diagnostic-rls.md |

## Verification Results
_pending_

## Verdict
_pending_
