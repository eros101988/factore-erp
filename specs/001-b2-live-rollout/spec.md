# Feature Specification: B2 Live Rollout

**Feature Branch**: `001-b2-live-rollout`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "B2 Live Rollout: safely sync the completed B2 (monthly supplier pricing & pricing policy, merged to main, 48/48 tests, build pass) with the Live Supabase project by applying migrations 0008 -> 0009 -> 0010. Must: first inspect Live DB migration/schema state; apply 0008, 0009, 0010 strictly in order; stop on any failure, never skip; verify tables/columns/RPC/RLS; verify publish transaction, rollback, and append-only cost history; NOT TESTED / SKIPPED never counts as PASS; never import or publish real business data; include rollback/recovery considerations. Out of scope: new features, real supplier PDF processing. Do not modify Live Supabase during the specify step."

## Context

B2 (monthly supplier pricing and pricing policy) is merged to `main`; it passes 48/48 tests and builds.
Its database changes (migrations 0008, 0009, 0010) have never been verified or applied on the Live database.
Until they are, the deployed cost management, pricing policy, and quote screens cannot work against Live data.
This feature brings the Live database to the B2 state safely. It adds no new behavior.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know the Live database state before touching it (Priority: P1)

The owner gets a read-only report of the Live database before any change. The report says which earlier migrations (0001–0007) are present and whether any part of 0008–0010 already exists. It also covers what B2-related data exists, for example pricing policies, price lists, cost history rows, and supplier SKU mappings.

**Why this priority**: Migration 0008 is not re-runnable. Several of its statements fail if their objects already exist. 0010 changes uniqueness rules that existing data could violate. Applying anything blind can leave the Live database half-migrated.

**Independent Test**: Run the inspection alone and compare its report against the repository's migration files. No Live object or row may change.

**Acceptance Scenarios**:

1. **Given** the Live database in an unknown state, **When** the inspection runs, **Then** it reports, for every object 0008–0010 creates or alters, whether it is ABSENT, PRESENT, or PARTIAL. It also reports a single verdict: READY (nothing from 0008–0010 present and prerequisites present), PARTIALLY APPLIED, ALREADY APPLIED, or BLOCKED (prerequisite missing).
2. **Given** the inspection, **When** it is compared before and after, **Then** Live schema and row counts are identical (read-only proven).
3. **Given** existing Live rows that would conflict with 0010 constraints, **When** the inspection runs, **Then** each conflict is listed. Examples: more than one active pricing policy per tier, duplicate supplier SKU mappings, price list statuses outside the allowed set.

---

### User Story 2 - Apply 0008 → 0009 → 0010 with a stop on first failure (Priority: P1)

After explicit owner approval and a confirmed backup, the migrations are applied one at a time, in order. Each one is checked before the next starts. Any failure stops the rollout at that step and nothing later runs.

**Why this priority**: This is the core outcome. Without it the deployed B2 cannot run.

**Independent Test**: Apply on a non-production copy first, then on Live. Confirm each step's post-check passes before the next step.

**Acceptance Scenarios**:

1. **Given** a READY verdict, a confirmed backup, and owner approval, **When** 0008 is applied, **Then** its post-check passes before 0009 is attempted. The post-check covers the new tables, new columns, seeded demo pricing policies, and access policies.
2. **Given** 0008 succeeded, **When** 0009 is applied and then 0010, **Then** each post-check passes before moving on.
3. **Given** any step fails or its post-check fails, **When** that happens, **Then** the rollout stops. The failing step, the error, and the exact database state are recorded. Later steps are not attempted, and the overall result is FAILED, not partially passed.
4. **Given** a PARTIALLY APPLIED or BLOCKED verdict, **When** rollout is requested, **Then** no migration runs until the owner approves a written recovery plan for that specific state.

---

### User Story 3 - Prove B2 behavior on Live without real business data (Priority: P2)

After all three migrations, the owner gets evidence that the Live database enforces B2's guarantees. Publishing a price list is all-or-nothing, and a failure leaves nothing behind. Cost history cannot be edited. Only admins can publish or change policy. The evidence uses only clearly labeled synthetic test data, which is removed afterwards.

**Why this priority**: The schema can exist yet behave wrongly. These are the financial-integrity guarantees in the constitution.

**Independent Test**: Run the verification suite against Live after rollout and get a per-check result table where every check is PASS, FAIL, or NOT TESTED.

**Acceptance Scenarios**:

1. **Given** a synthetic test price list with one unmapped row, **When** publish is attempted, **Then** it is refused and no cost history row is written.
2. **Given** a synthetic test price list where a write fails mid-publish, **When** publish is attempted, **Then** no cost rows, mappings, or audit entries from that attempt remain, and the list status is unchanged.
3. **Given** a published synthetic test cost row, **When** an edit of that row is attempted, **Then** it is refused.
4. **Given** a non-admin user, **When** publishing or changing a pricing policy is attempted, **Then** it is refused.
5. **Given** two synthetic months of test cost, **When** the effective cost is looked up for dates before, inside, and after them, **Then** the results are not-found, the earlier month, and the later month respectively.
6. **Given** verification has finished, **When** cleanup runs, **Then** zero synthetic test rows remain, and the counts of all other rows equal the pre-verification counts.

---

### User Story 4 - Be able to recover (Priority: P2)

If the rollout fails or produces a bad state, the owner has a documented way back. The two paths are restore from the pre-rollout backup, or a forward fix, chosen per failure point. The owner also knows exactly what state the database is in.

**Why this priority**: The rollout changes the production schema and cannot be undone by re-running code.

**Independent Test**: Review the recovery plan against each possible stop point (after 0008, after 0009, during 0010, during verification). Each stop point has a named recovery action and a way to confirm it worked.

**Acceptance Scenarios**:

1. **Given** the rollout stops at any step, **When** the recovery plan is consulted, **Then** it names the action for that step and the check that confirms recovery.
2. **Given** a restore is chosen, **When** it completes, **Then** the inspection from User Story 1 reports the same state as before the rollout.

### Edge Cases

- Earlier migrations 0001–0007 were applied by hand, so the migration history may not list them even though their objects exist. In that case state is judged from the actual objects, not from history alone.
- Part of 0008 already exists, for example the tables but not the access policies. Re-running 0008 as-is would fail, so this needs an owner-approved recovery plan first.
- Live already has pricing policy rows that differ from the demo values 25% / 20% / 15%. They must not be overwritten or duplicated.
- Live already has cost history rows from B1 imports (product master or historical purchases). They must remain untouched, and quotes must still ignore them.
- 0010 creates a storage bucket. If a bucket with that name already exists, its existing files must be preserved.
- Network loss or a timeout in the middle of a step. The step's outcome must be determined by inspection before deciding to retry.
- Cleanup of synthetic rows. Normal app users cannot delete cost history (by design), so cleanup must use a maintenance role, and that use must be logged.
- The deployed web app may call B2 features between steps. The owner decides whether to accept that window or pause usage.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Before any change, the rollout MUST produce a read-only inspection report of the Live database covering migrations 0001–0010 objects, B2-related row counts, and constraint conflicts, with a single verdict (READY / PARTIALLY APPLIED / ALREADY APPLIED / BLOCKED).
- **FR-002**: The inspection MUST NOT create, alter, or delete any Live object or row.
- **FR-003**: No migration MUST run on Live until all of the following hold:
  - (a) the verdict is READY, or the owner approved a recovery plan for the reported state;
  - (b) the backup gate in FR-017 is satisfied;
  - (c) the owner gives explicit approval in the conversation for that rollout.
- **FR-004**: Migrations MUST be applied in the order 0008, 0009, 0010, one at a time, using the exact files committed on `main` with no edits during rollout.
- **FR-005**: After each migration, a post-check MUST verify the objects that step was meant to create or change. The next step MUST NOT start unless the post-check passes.
- **FR-006**: On any error or failed post-check the rollout MUST stop immediately, skip nothing, retry nothing automatically, and record the failing step, the error text, and the inspected state.
- **FR-007**: After 0010, verification MUST confirm:
  - the three new tables and every column added to existing tables
  - the publish function in its final single-argument form, with the old two-argument form gone
  - the pricing-policy change function
  - the append-only protection on cost history
  - row-level access rules on the new tables (admin full access, staff read-only, anonymous none)
  - the private storage bucket and its admin-only access rule
  - the cost-change warning threshold setting
- **FR-008**: Behavioral verification MUST cover:
  - publish refused for unmapped, invalid-cost, and error rows
  - publish all-or-nothing, with rollback on a mid-publish failure
  - cost history edit refused
  - non-admin publish and policy change refused
  - effective-cost lookup by date, with no future cost used
  - pricing-policy change creates a new version
- **FR-009**: Behavioral verification MUST use only synthetic records clearly marked as test data (for example a `[TEST]` prefix and a dedicated test supplier and products). It MUST NOT import, upload, map, or publish any real supplier price list or real business cost.
- **FR-010**: Every synthetic record created during verification MUST be removed afterwards. Removal MUST be confirmed by counts, and the counts of all non-test rows MUST equal their pre-verification values.
  - Behavioral verification runs on Live (D-2).
  - Non-test row counts for every table B2 touches are recorded before rollout and after cleanup.
  - If cleanup cannot be completed safely, the overall result is FAIL/BLOCKED, never PASS. The remaining test rows are listed for the owner.
- **FR-011**: Each verification item MUST be reported as PASS, FAIL, or NOT TESTED with evidence. NOT TESTED and SKIPPED MUST never be counted or summarized as PASS, and the overall result is PASS only if every required item is PASS.
- **FR-012**: The rollout MUST include a written recovery plan covering each stop point, with the recovery action and the check that confirms it.
- **FR-013**: Rows that existed before the rollout MUST be preserved: pricing policies, B1 cost history, supplier SKU mappings, and storage files.
- **FR-014**: Each Live change (each migration, verification run, and cleanup) MUST be logged with time, actor, and outcome in a rollout record kept in the repository.
- **FR-015**: The rollout MUST NOT add features, change application code, or process real supplier PDFs. A defect found in a migration is reported and stops the rollout. It is fixed in a separate, approved change.
- **FR-016**: Migrations MUST be applied through the connected Supabase MCP formal migration workflow (D-3), so each of 0008, 0009, 0010 is recorded in the Live migration history. A failed migration MUST NOT be retried automatically. The history after rollout MUST let future migrations apply cleanly.
- **FR-017**: Before rollout, the agent MUST record whether the Live project has daily backups or point-in-time recovery (Layer 1, checked read-only). It MUST also take a manual logical backup of schema and data (Layer 2), record where it is stored, and confirm the file is complete and readable. The rollout is BLOCKED if neither a restorable automatic backup is confirmed nor the manual backup is completed. The manual backup MUST be stored outside the repository and never committed, because it contains business data.
- **FR-018**: The agent performs backup steps itself. It asks the owner only for actions that require the owner's own account login or personal authorization.

### Key Entities

- **Inspection Report**: Live state snapshot before the change. It holds per-object presence (ABSENT / PRESENT / PARTIAL), B2 row counts, constraint conflicts, and the verdict.
- **Rollout Record**: The ordered log of each step, with approval, backup reference, start/end time, outcome, and post-check result.
- **Verification Result**: Per-check outcome (PASS / FAIL / NOT TESTED) with evidence and an overall result.
- **Synthetic Test Data**: The test supplier, products, price lists, cost rows, and quote created only for verification and removed afterwards.
- **Backup Record**: Layer 1 finding (daily backup / PITR available, with retention, or not confirmed) and the Layer 2 manual backup's time, storage location (outside the repo), size, and completeness check.
- **Recovery Plan**: The stop point → action → confirmation check mapping, and the backup reference it depends on.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the objects listed in FR-007 are verified present on Live after rollout, with no unexpected extra or missing objects.
- **SC-002**: 100% of the behavioral checks in FR-008 report PASS. Any FAIL or NOT TESTED makes the overall result not-passed.
- **SC-003**: 0 real business records are created, modified, or published during rollout and verification. Pre-existing row counts outside B2 test data are identical before and after.
- **SC-004**: 0 synthetic test records remain on Live after cleanup.
- **SC-005**: The owner can tell the database state at any moment of the rollout from the rollout record alone, without re-inspecting.
- **SC-006**: Every possible stop point has a documented recovery action whose confirmation check can be run in under 15 minutes.
- **SC-007**: After rollout, an admin can open the cost management and pricing policy screens on the deployed app without database errors. A quote for a product with no cost shows the no-cost message instead of a price.
- **SC-008**: Before the first migration, the rollout record shows the Layer 1 backup finding and a completed Layer 2 manual backup. If both are missing, the rollout is recorded as BLOCKED with 0 migrations applied.

## Assumptions

- `main` contains the final migration files 0008–0010. They are applied exactly as committed.
- The Live project is the one configured in the deployed app. The connected Supabase MCP has rights to inspect, read backup status, and, after approval, apply migrations. If it lacks a needed right, that step is BLOCKED until the owner grants it.
- Migrations 0001–0007 are already applied on Live (S1.6 and B1 went live), possibly by hand without migration-history entries. The inspection confirms this.
- No real supplier price list has been uploaded to Live yet, so B2 tables are expected to be absent or empty.
- Demo pricing-policy margins (25% / 20% / 15%) are acceptable initial values on Live. The owner can change them later in the app.
- A short window where the deployed app's B2 screens fail before rollout completes is acceptable, unless the owner decides otherwise.

## Clarifications

### Session 2026-11-07

- **D-1 Backup (two layers)**: Q: How is the pre-rollout restore point guaranteed? → A:
  - **Layer 1:** use the available read-only/management access to confirm whether the Live project has daily backups or point-in-time recovery, and record what was found.
  - **Layer 2:** regardless of Layer 1, take a manual logical backup (schema + data) before rollout. The agent does this itself, and asks the owner only when an account login or the owner's personal authorization is required.
  - **Gate:** if no restorable automatic backup can be confirmed AND the manual backup cannot be completed, the rollout is BLOCKED.
- **D-2 Verification location**: Q: Where do publish/rollback/append-only checks run? → A: Option A, directly on Live with synthetic `[TEST]` data. Non-test row counts are recorded before and after, and test data is cleaned up afterwards. If cleanup cannot be completed safely, the result is FAIL/BLOCKED, never PASS.
- **D-3 Apply channel**: Q: How are migrations applied and recorded? → A: through the connected Supabase MCP, using the formal migration workflow so each step is recorded in migration history. The order is 0008 → 0009 → 0010, each verified before the next, with no skipping and no automatic retry of a failed migration.
