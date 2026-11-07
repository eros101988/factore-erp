# Data Model: B2 Live Rollout

These are rollout records, kept as Markdown/JSON under `specs/001-b2-live-rollout/rollout/`. They are not database tables.

## Inspection Report

| Field | Description |
|---|---|
| project_ref, project_status | Must match the deployed app's Supabase URL host; status ACTIVE_HEALTHY |
| taken_at | Timestamp (Asia/Taipei) |
| migration_history | Entries from `list_migrations` |
| objects[] | `{ group: prerequisite/0008/0009/0010, kind, name, expected, state: ABSENT/PRESENT/PARTIAL, detail }` |
| conflicts[] | `{ check, rows_found, sample_ids (no business values) }` |
| baseline_counts | `{ table: count }` for all `public` tables, the bucket's object count, and the `auth.users` count |
| data_api_defaults | Default privileges for `authenticated` in `public` |
| advisors_baseline | Lint IDs and levels |
| verdict | READY / PARTIALLY APPLIED / ALREADY APPLIED / BLOCKED |

## Backup Record

| Field | Description |
|---|---|
| layer1 | `{ daily_backups: yes/no/unknown, pitr: yes/no/unknown, retention, latest_restore_point, source: mcp/dashboard-by-owner }` (recorded, informational) |
| layer2 | `{ method: mcp-export, started_at, finished_at, location (outside repo), files[], table_count, rowcount_match: true/false }` (required) |
| layer3 | `{ method: pg_dump -Fc, client_version, server_version, host (pooler, no secrets), started_at, finished_at, location (outside repo), size_bytes, restore_list_ok: true/false, tables_with_data }` (required; password entered by owner in the terminal, never recorded) |
| gate | PASS only if layer2 and layer3 are verified and layer1 is recorded; else BLOCKED, with the reason |

## Rollout Record (append-only log)

One entry per action: `{ seq, at, actor: agent/owner, stage, action, input_ref (file + git hash), outcome: OK/ERROR/STOPPED, evidence_ref }`.
Includes the owner approval quote and the migration-name ↔ file mapping.

### Step state machine (per migration)

```text
PENDING ──apply──▶ APPLIED ──post-check PASS──▶ VERIFIED ──▶ (next migration)
   │                  │
   │                  └─post-check FAIL──▶ STOPPED
   └─apply ERROR──▶ STOPPED ──inspect──▶ {NOT_APPLIED | PARTIAL | APPLIED}
                                            └─▶ recovery (owner-approved) ──▶ RECOVERED / RESTORED
```

A later migration may start only when the previous one is VERIFIED.

## Verification Result

| Field | Description |
|---|---|
| id | A-0008-xx / A-0009-xx / A-0010-xx / B-xx / C-xx (cleanup) / S-xx (smoke) |
| required | true/false. Only advisory WARN items are not required. |
| result | PASS / FAIL / NOT TESTED |
| reason | Mandatory for FAIL and NOT TESTED |
| evidence_ref | File under `rollout/evidence/` |

## Synthetic Test Data

| Entity | Marking |
|---|---|
| Supplier | name `[TEST] B2 Rollout Supplier` |
| Products | `internal_sku` `[TEST]-B2-001`, `[TEST]-B2-002`; name prefix `[TEST]` |
| Price lists | the test supplier, years 2099/2100 (far future, never overlapping real months), `source_filename` `[TEST]-fixture.pdf` |
| Price list items | supplier SKUs `TEST-KA-T91N` and similar |
| Identities | No Auth users. anon, a synthetic UUID (non-member), and the existing test subject (`TEST_ADMIN_EMAIL`) as admin, or as staff via a transaction-local profile change (DN-3 = C) |

All fixtures exist only inside rolled-back transactions (DN-2 = A); none are committed.

**Exception to the far-future rule:** effective-cost checks need past dates relative to the test quote date, so they use 2099-11 / 2099-12 together with quote dates in 2099. They never touch real months.

## Verdict rules

```text
if stopped before any migration                         → BLOCKED
elif any required item FAIL / migration ERROR / residue → FAIL
elif any required item NOT TESTED                       → INCOMPLETE (not PASS)
else                                                    → PASS
```

The summary reports the PASS, FAIL, and NOT TESTED counts separately.
