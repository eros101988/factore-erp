# Quickstart: B2 Live Rollout run-sheet

The validation guide for the implement phase. Each line maps to a stage in [plan.md](./plan.md).
Stop at the first ✗; never skip.

## Prerequisites
- Latest `main`, clean tree. `npx vitest run` → 48/48.
- Supabase MCP connected to the Live project; ref matches `NEXT_PUBLIC_SUPABASE_URL`.
- Owner available for:
  - the approval (Stage 3);
  - typing the DB password into the interactive `pg_dump` terminal prompt when told which tab (never in chat);
  - reading the dashboard backup status, if MCP can't see it.
- Postgres client tools (`pg_dump`, `pg_restore`) at the server's major version or newer, installed locally (agent installs; local-only step).
- Existing test subject (`TEST_ADMIN_EMAIL`) with an active admin profile on Live. Without it, admin/staff checks become BLOCKED / NOT TESTED.
- Decisions applied: DN-1 = C, DN-2 = A, DN-3 = C.

## Run
| # | Stage | Do | Pass when |
|---|---|---|---|
| 0 | Local sanity | git hash of 0008–0010; run the tests | Hash recorded; 48/48 |
| 1 | Preflight | [inspection-report](./contracts/inspection-report.md) | Verdict READY; recount equals baseline (read-only proven) |
| 2 | Backup gate | L1 platform status recorded; L2 MCP export (counts match); L3 `pg_dump -Fc` (owner types the password in the terminal tab; `pg_restore --list` OK) | L2 and L3 verified → PASS, else BLOCKED |
| 3 | Approval | Show verdict, backup record, plan | Owner writes explicit approval |
| 4a | Apply 0008 | `apply_migration` | A-0008-* all PASS |
| 4b | Apply 0009 | `apply_migration` | A-0009-* all PASS → go straight to 4c |
| 4c | Apply 0010 | `apply_migration` | A-0010-* all PASS |
| 5 | Verify | B-01…B-12 (each a forced-rollback transaction; identities per research R-4, no Auth users); S-01…S-03 | All PASS (unavailable test subject → BLOCKED / NOT TESTED, reported) |
| 6 | Cleanup | C-01…C-03 | 0 residue; counts reconcile |
| 7 | Verdict | Write `rollout-record.md` and `verification.json` | Verdict stated with separate PASS/FAIL/NOT TESTED counts |

## On ✗
Follow the plan's Failure & Recovery table: STOP → inspect → record → propose → owner approves → act → re-inspect.
