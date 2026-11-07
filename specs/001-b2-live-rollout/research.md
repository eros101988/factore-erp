# Research: B2 Live Rollout

All Technical Context unknowns are resolved below. Owner decisions DN-1 = C, DN-2 = A, and DN-3 = C (2026-11-07) are applied.

## R-1 Apply channel and history

- **Decision**: Supabase MCP `apply_migration`, once per file, passing the exact committed file content. History names follow `b2_0008_pricing_foundation`, `b2_0009_publish_rpc`, and `b2_0010_cost_integrity`.
- **Rationale**: D-3 requires the formal workflow and history entries. The Supabase skill notes that `apply_migration` writes a history entry on every call, which is exactly why a failure must never be retried blindly. It also notes that `execute_sql` creates no history entry, so it is used for read-only checks only.
- **Alternatives**: SQL editor (no history; rejected by D-3); Supabase CLI `db push` (not installed and needs the DB password; also expects timestamped filenames, which this repo doesn't use).

## R-2 Backup layers (DN-1 = C)

- **Layer 1, platform status:**
  - Daily backups and PITR are plan-dependent features.
  - Read what the MCP connection exposes (`get_project`). Otherwise the owner reads Dashboard → Database → Backups.
  - Recorded only; it does not satisfy the gate on its own.
- **Layer 2, MCP export (agent-only, required):**
  - **Data:** for every `public` table, `SELECT json_agg(t) FROM <table> t`.
  - **Schema:** a snapshot from the catalogs (`pg_get_functiondef`, `pg_get_constraintdef`, `pg_policies`, `pg_indexes`, `information_schema.columns`, `role_table_grants`).
  - Saved to `%USERPROFILE%\Backups\yuan-erp\<run>\mcp\`.
  - Verified by per-table row counts equal to the preflight baseline.
  - It is not a byte-exact dump; it serves as a cross-check and a per-table reload source.
- **Layer 3, formal `pg_dump` (required):**
  - **Tooling:** Postgres client tools (`pg_dump`, `pg_restore`) at the server's major version or newer, installed locally beforehand. `supabase db dump` needs Docker, so it is optional rather than relied on.
  - **Connection:** the Supavisor session pooler (port 5432, user `postgres.<project-ref>`, host from the project's region). The direct host may be IPv6-only.
  - **Command (sketch):** `pg_dump -Fc --no-owner --no-privileges -h <pooler-host> -p 5432 -U postgres.<ref> -d postgres -f <outside-repo>\yuan-erp-pre-b2.dump`, with **no password argument**.
  - **Password:** `pg_dump` prompts for it. The agent starts the command in an interactive local terminal tab (`run_in_terminal`) and tells the owner which tab to type it into. It is never in chat, files, `PGPASSWORD`, or history.
  - **Verification:** `pg_restore --list` succeeds, `TABLE DATA` entries exist for every `public` table, and the file size is recorded.
- **Gate:** Layer 2 and Layer 3 both verified, and Layer 1 recorded → PASS. Otherwise BLOCKED.

## R-3 Behavioral verification mechanics (DN-2 = A)

- Each check is one transaction (a `DO` block) that:
  1. creates `[TEST]` fixtures;
  2. switches identity;
  3. runs the check;
  4. collects the results into JSON;
  5. ends with `RAISE EXCEPTION 'B2_VERIFY_RESULT %', <json>`.
- The forced error guarantees a rollback, and the message carries the result. A check whose block ends any other way, for example with an unexpected error, is FAIL.
- Calls that are expected to be refused, such as publish raising `PUBLISH_BLOCKED`, run in `BEGIN … EXCEPTION` subtransactions, so the outer check observes the refusal and continues.
- Nothing is committed, so no `[TEST]` business data, audit rows, mappings, or cost rows persist, and the append-only DELETE restriction is never involved.
- After the checks: 0 test-marker rows and equal non-test counts (contracts §C).

## R-4 Identity simulation without Auth users (DN-3 = C)

- **Mechanism (transaction-local only):**
  - `SET LOCAL ROLE authenticated` or `anon`;
  - `set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role', 'authenticated')::text, true)`;
  - `auth.uid()` then returns `<uuid>`;
  - `RESET ROLE` before fixture setup steps that need the owner role.
- **No `auth.users` INSERT or DELETE, ever.**
- **Identity matrix:**

| Identity | How | Covers |
|---|---|---|
| anon | `SET LOCAL ROLE anon`, no `sub` | RLS denies anon (B-11) |
| non-member | `authenticated` + synthetic UUID with no `user_profiles` row | Fail-closed refusal of publish / `set_pricing_policy` (B-09a); RLS returns no rows |
| admin | `authenticated` + the existing test subject's UUID (`TEST_ADMIN_EMAIL`, active admin profile) | B-01..B-07, B-10 |
| staff | Same test subject, with `UPDATE user_profiles SET role='staff'` **inside** the rolled-back transaction | B-09b (staff refused), B-11 staff read OK / write refused |

- `user_profiles.id` references `auth.users(id)`, so a synthetic UUID can't be given a profile without an Auth user. That is why admin/staff use the existing test subject.
- **If the test subject is missing or inactive:** the admin/staff rows of the matrix are BLOCKED / NOT TESTED. This is reported before Stage 5 continues. Only the anon and non-member checks run.
- **Fidelity limit:** this does not exercise PostgREST or session cookies. The app smoke test (§S) covers that end to end.

## R-5 Supabase-specific risks (from the `supabase` skill checklist)

- **`SECURITY DEFINER` in `public` is callable by `PUBLIC`/`anon` by default.**
  - 0010 revokes this on its own functions; post-check A-0010 verifies it with `has_function_privilege`.
  - 0009's two-argument function has no REVOKE, which is the R1 window.
- **New tables may not be exposed to the Data API.** A-0010 checks `has_table_privilege('authenticated', …)` for SELECT/INSERT/UPDATE/DELETE.
- **RLS must be enabled on every `public` table.** A-0008 checks `relrowsecurity` on the three new tables.
- **Storage policies:** creating one on `storage.objects` may be refused depending on the platform version. That would fail 0010 atomically (R4).
- **Advisors:** take a baseline before and run again after (`get_advisors`). New security ERRORs fail the rollout.

## R-6 Transactionality of `apply_migration`

- **Assumption to verify**: each `apply_migration` call runs in a single transaction, so an error leaves no partial state.
- **Not relied on blindly**: after any error, the step's inventory is run to determine the actual state before any recovery (FR-006).

## R-7 Expected seed and row deltas

- **0008:** +3 `pricing_policies` rows (demo 25/20/15%). If a `pricing_policies` table already exists, `ON CONFLICT (tier) DO NOTHING` keeps the existing rows.
- **0010:**
  - +1 `system_settings` row (`ON CONFLICT DO NOTHING`)
  - +1 `storage.buckets` row (`ON CONFLICT DO NOTHING`)
  - an `UPDATE` of `supplier_price_lists.status`: expected 0 rows, since the table is new and empty
- Any other count change counts as unexpected → FAIL.
