# Feature Specification: Live Security Remediation

**Feature Branch**: `002-live-security-remediation`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "002-live-security-remediation: (1) R1 immediate containment of Live publish_supplier_price_list(uuid,uuid) SECURITY DEFINER, anon/PUBLIC executable, trusts caller p_user_id — close first, minimal, verifiable, reversible; (2) fix user_profiles RLS recursion from repo 0002 (identical on Live) affecting B1/B2 policies that look up user_profiles, without weakening fail-closed authorization; (3) regression verification (admin, staff, non-member/anon, B1/B2 no recursion, helper functions, old publish fn not exposed, no real business data changed, NOT TESTED/BLOCKED/SKIPPED never PASS); (4) plan must decide a clean replayable migration sequence given Live has 0008+0009 applied and repo 0010 not applied — no renumbering now; (5) 001 stays STOPPED, T006 stays FAIL, 001 restarts from local validation/preflight after 002 PASS, never assuming 0008/0009 unapplied. Known facts source: Live diagnostic evidence specs/001-b2-live-rollout/rollout/evidence/01-diagnostic-rls.md (branch 001-b2-live-rollout, commit 88e1ed3). Spec only; do not touch Live."

## Known Facts (do not re-discover)

Source: the read-only Live diagnostic, `specs/001-b2-live-rollout/rollout/evidence/01-diagnostic-rls.md` (branch `001-b2-live-rollout`, commit `88e1ed3`). It was taken on 2026-11-07 against project `factory erp` (`mdyldmshwapikwnhlkvs`). Live was not changed.

- **F1:** Live migration history shows 0001–0007, then 0008 and 0009 applied (0002 is listed twice). The repo's 0010 is **not** applied. 0008 and 0009 were applied outside the 001 rollout.
- **F2:** The publish function with two parameters (price list, user) exists on Live. It runs with its owner's privileges, and **anonymous and authenticated callers can execute it**. It decides whether the caller is an admin from the user id the caller passes in, so anyone who knows an active admin's id can act as that admin. The B2 price-list tables are currently empty.
- **F3:** The profile table's access rules on Live are identical to repo migration 0002. The "admins can read/update all profiles" rules look up the profile table from inside the profile table's own rule.
- **F4:** As a signed-in active admin, reading these fails with "infinite recursion detected":
  - the profile table;
  - the B1 tables `product_external_mappings` and `import_batches` (all B1 tables share the same rule pattern);
  - the B2 table `pricing_policies`.
- **F5:** S1 tables whose rules use the existing helper checks ("is admin", "is active user") work normally (e.g. `products`). The helper checks themselves return correct results.
- **F6:** The repo's PGlite dry-run (001 T006) reproduces F3/F4 exactly. Local replays of the repo migrations behave like Live.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Close the impersonation entry point now (Priority: P1)

The owner closes the publish entry point that anonymous callers can execute and that trusts a caller-supplied user id. This happens before any other change. The fix is the smallest possible change that can be verified and undone.

**Why this priority**: It is an open authorization bypass on the production database (F2). Everything else can wait; this cannot.

**Independent Test**: After containment, an anonymous caller and an authenticated non-admin caller can no longer run the two-parameter publish entry point. Nothing else on Live changed: same objects apart from the one permission or entry point, and same row counts.

**Acceptance Scenarios**:

1. **Given** the two-parameter publish entry point is executable by anonymous callers, **When** containment is applied, **Then** anonymous callers and the general public role can no longer execute it.
2. **Given** containment is applied, **When** any caller tries to use it with any user id, **Then** the attempt is refused before any data is read or written.
3. **Given** containment is applied, **When** Live is compared with the pre-containment snapshot, **Then** the only difference is the containment itself. Row counts are identical, and no profile, policy, or helper check changed.
4. **Given** containment must be undone, **When** the recorded reversal is applied, **Then** the pre-containment state is restored exactly, and the reversal is documented in advance.

---

### User Story 2 - Signed-in users can use role-protected data again (Priority: P1)

Admins and staff can read their profile and the B1/B2 data their role allows, without recursion errors. Authorization stays fail-closed: no one gains access they did not have by design.

**Why this priority**: Today every role-protected B1/B2 table, and the app's own role lookup, fails for signed-in users (F4). B2 cannot go live, and B1 admin screens are broken.

**Independent Test**: Run the role matrix (User Story 3) against a database replayed from the repo migrations including the fix. Every read and write outcome matches the intended access model, with zero recursion errors.

**Acceptance Scenarios**:

1. **Given** an active admin, **When** they read their profile, all profiles, and B1/B2 tables, **Then** each read succeeds, with no recursion error.
2. **Given** an active staff member, **When** they read their own profile and the B1/B2 tables staff may view, **Then** the reads succeed. **When** they try admin writes on those tables or on other users' profiles, **Then** the writes are refused.
3. **Given** an authenticated user with no profile, or an inactive profile, **When** they read or write any role-protected table, **Then** they see no rows and every write is refused (fail closed).
4. **Given** an anonymous caller, **When** they read or write any role-protected table, **Then** they see no rows or are denied.
5. **Given** the S1 tables that already work (F5), **When** the fix is applied, **Then** their behavior for every role is unchanged.

---

### User Story 3 - Prove it with a regression matrix (Priority: P1)

The owner gets a per-check result table proving the containment and the fix. Each check is PASS, FAIL, NOT TESTED, or BLOCKED, with evidence. It is produced without touching real business data.

**Why this priority**: These are security changes on production. An unproven fix is not done (constitution II and III).

**Independent Test**: The matrix can be run against a local replay and against Live. Its summary counts PASS, FAIL, NOT TESTED, and BLOCKED separately.

**Acceptance Scenarios**:

1. **Given** the fix is in place, **When** the matrix runs, **Then** it covers:
   - each role (active admin, active staff, authenticated non-member, inactive member, anonymous);
   - each protected area: the profile table, every B1 table, every B2 table, and at least one S1 table as a control;
   - read and write for each;
   - both helper checks;
   - the two-parameter publish entry point.
2. **Given** any check cannot be run, **When** the summary is produced, **Then** that check is NOT TESTED or BLOCKED with a reason, and the overall result is not PASS.
3. **Given** the matrix ran on Live, **When** it finishes, **Then** zero real business rows were created, changed, or deleted. This is proven by before and after row counts and by zero test-marker residue.

---

### User Story 4 - One migration order for Live and fresh databases (Priority: P2)

The plan decides a single migration sequence that a fresh database can replay to the same end state Live reaches. That holds even though Live already has 0008 and 0009 and does not have 0010.

**Why this priority**: If Live's order and a fresh replay's order diverge permanently, future migrations, local tests, and disaster recovery become unreliable.

**Independent Test**: Replay the chosen sequence on an empty local database. Then replay it on a copy that simulates Live's current history (0001–0009 applied). Compare the two end states object by object: they are identical.

**Acceptance Scenarios**:

1. **Given** the chosen sequence, **When** it is replayed from empty, **Then** the end state equals the end state reached by applying only the not-yet-applied steps to a Live-like database.
2. **Given** existing migration files, **When** this feature is specified and planned, **Then** no existing migration file is renumbered or edited without an explicit decision recorded in the plan.

---

### User Story 5 - Clean hand-back to the B2 rollout (Priority: P2)

When 002 is verified, the B2 rollout (001) restarts from its beginning: local validation, then preflight. It uses the new facts and never assumes 0008/0009 are unapplied.

**Why this priority**: 001 stopped on a real defect. Resuming mid-way on stale assumptions would be unsafe.

**Independent Test**: The 001 records still show STOPPED and T006 FAIL until 002 passes. The hand-back note lists exactly what 001 must re-validate.

**Acceptance Scenarios**:

1. **Given** 002 is in progress, **When** anyone checks 001, **Then** 001 is STOPPED and T006 is FAIL, unchanged.
2. **Given** 002 passes, **When** 001 resumes, **Then** it starts from local validation and preflight. Its preflight expects 0008/0009 present and treats their state as a fact to verify, not to assume.

### Edge Cases

- The app or a person calls the two-parameter publish entry point between diagnosis and containment. Since the B2 tables are empty, impact is limited. The containment record must still note whether any call happened, by checking for publish audit entries and cost rows tied to price lists.
- Containment might break something legitimate that uses the two-parameter entry point. The app's current code does not use it (it was superseded by the one-parameter design that 0010 introduces); the plan confirms this before containment.
- A user is demoted (admin → staff) or deactivated. Their access must follow the profile immediately, with no cached admin rights.
- A user has no profile row at all. They must be treated as non-member (fail closed), not as an error that leaks data.
- The fix touches only access rules, with zero rows to migrate, so a failed step must leave the previous rules intact. A partial set of rules must not remain.
- Applying the fix while a user is mid-session: requests either see the old rules (recursion error) or the new rules, never a state with less protection.
- The repo's 0010, applied later, recreates B2 rules. It must not reintroduce the recursion pattern (handled in the migration-order decision).

## Requirements *(mandatory)*

### Functional Requirements

**Containment (first)**

- **FR-001**: Containment of the two-parameter publish entry point MUST be applied before any other change in this feature. No other 002 change may be applied to Live until containment is verified.
- **FR-002**: Containment MUST remove the ability of anonymous callers, the general public role, and authenticated callers to execute the two-parameter publish entry point. The B2 rollout later provides the replacement publish path (0010).
- **FR-003**: Containment MUST be the smallest change that achieves FR-002. It changes nothing else: no data, no profile rules, no helper checks, no other function.
- **FR-004**: Containment MUST be reversible by a reversal written and reviewed before it is applied, plus a recorded snapshot of the exact pre-containment permissions.
- **FR-005**: Containment MUST be verified on Live:
  - execute permission is absent for anonymous, public, and authenticated callers;
  - every other inventoried object is unchanged;
  - row counts are identical before and after.

**Recursion fix**

- **FR-006**: Profile-table access rules MUST no longer reference the profile table from within its own rules in a way that recurses.
- **FR-007**: Every B1 and B2 access rule that decides a role by looking up the profile table MUST evaluate without recursion for every role.
- **FR-008**: The access model MUST stay at least as strict as designed:
  - admins: full access to B1/B2 tables, read all profiles, update profiles;
  - active staff: read the B1/B2 tables designated for staff, read their own profile, no writes on admin-only tables, no access to other profiles;
  - inactive users and users without a profile: nothing;
  - anonymous: nothing.
  Any check whose outcome is uncertain MUST deny.
- **FR-009**: The two existing helper checks ("is admin", "is active user") MUST keep their current results for every role. Rules MAY reuse them, but not in a way that bypasses the active-flag check.
- **FR-010**: Behavior on S1 tables (F5) MUST be unchanged for every role.
- **FR-011**: The fix MUST NOT modify, add, or delete any business row.

**Verification**

- **FR-012**: A regression matrix MUST cover:
  - roles: active admin, active staff, authenticated non-member, inactive member, anonymous;
  - objects: the profile table, all B1 tables, all B2 tables, at least one S1 control table, both helper checks, and the two-parameter publish entry point;
  - read and write where applicable.
- **FR-013**: The matrix MUST run first on a local replay of the repo migrations plus the fix, and then on Live after the fix is applied.
- **FR-014**: Live verification MUST NOT create Auth users. It MUST use only transaction-local identity simulation and synthetic `[TEST]` data inside rolled-back transactions (same rules as 001's DN-2/DN-3).
  - Non-test row counts MUST be identical before and after.
  - Zero test-marker rows MUST remain.
  - If a role can't be simulated without an Auth user, that check is BLOCKED / NOT TESTED and reported.
- **FR-015**: Each check MUST report PASS, FAIL, NOT TESTED, or BLOCKED with evidence. NOT TESTED, BLOCKED, and SKIPPED MUST never count as PASS, and the overall result is PASS only if every required check is PASS.
- **FR-016**: The deployed app's role lookup (an active admin opening an admin page) MUST be confirmed working after the fix, or reported NOT TESTED with a reason.

**Migration order**

- **FR-017**: The plan MUST choose and justify one migration sequence covering 0008, 0009, the 002 changes (containment and recursion fix), and the repo's 0010, such that:
  - (a) Live reaches the target state by applying only not-yet-applied steps, in order;
  - (b) a fresh database replaying the full sequence reaches the identical end state;
  - (c) the order of entries in Live's migration history matches the repo's file order from this point forward.
- **FR-018**: No existing migration file may be renumbered, edited, or deleted during specify. Any such change proposed by the plan MUST be justified explicitly and re-verified by a fresh-replay test.
- **FR-019**: The chosen sequence MUST ensure that applying the repo's 0010 later does not reintroduce the recursion pattern or re-expose the two-parameter publish entry point.

**Safety and process**

- **FR-020**: Every Live change MUST require the owner's explicit approval in the conversation, given for that specific change, with a recorded pre-change snapshot (inventory and counts).
- **FR-021**: Before the recursion fix is applied to Live, a verified restorable backup MUST exist, using the same three-layer standard as 001 (DN-1 = C). Containment (FR-001…005) is exempt from the full backup because it changes only one permission and has a pre-written reversal. Its pre-change snapshot is still mandatory.
- **FR-022**: Each Live change MUST stop on the first error, with no automatic retry. The actual state is inspected and recorded before any recovery, and recovery runs only with owner approval.
- **FR-023**: A rollout record MUST log every Live action: time, actor, change, outcome, and evidence.

**Interaction with 001**

- **FR-024**: `001-b2-live-rollout` MUST remain STOPPED, and its T006 MUST remain FAIL, until 002 is verified PASS. No 001 task is executed as part of 002.
- **FR-025**: After 002 PASS, 001 MUST restart from local validation (T001–T006) and Live preflight (T007), with its plan and tasks updated for:
  - 0008/0009 already applied on Live;
  - containment in place;
  - the new migration sequence;
  - the recursion fix.
  001 MUST NOT assume 0008/0009 are unapplied.

### Key Entities

- **Containment Record**: the pre-containment permission snapshot, the containment change, the pre-written reversal, the approval, the verification result, and whether any use of the entry point was found.
- **Access Model**: the intended role × object × action matrix (admin, staff, non-member, inactive, anonymous × profile / B1 / B2 / S1 × read/write). This is the expected values for the regression matrix.
- **Regression Matrix Result**: per check PASS / FAIL / NOT TESTED / BLOCKED, with evidence and separate summary counts.
- **Migration Sequence Decision**: the ordered list of migrations from 0008 onward; Live's applied set; the not-yet-applied steps; the fresh-replay equivalence proof.
- **Hand-back Note**: what 001 must re-validate and which facts changed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After containment, 0 of 3 caller classes (anonymous, public, authenticated) can execute the two-parameter publish entry point. Live row counts are 100% identical before and after.
- **SC-002**: After the fix, 0 recursion errors occur across the full regression matrix, both locally and on Live.
- **SC-003**: 100% of regression-matrix checks match the access model. Any FAIL, NOT TESTED, or BLOCKED makes the result not PASS.
- **SC-004**: 0 real business rows are created, changed, or deleted by 002, as shown by identical non-test row counts and 0 test residue.
- **SC-005**: A fresh replay of the chosen migration sequence and the Live end state match on 100% of inventoried objects.
- **SC-006**: An active admin can open the deployed app's admin pages (cost management, pricing policy) without a permission or database error. Otherwise this is NOT TESTED with a reason.
- **SC-007**: Containment can be reversed, and its reversal confirmed, in under 15 minutes from the pre-written reversal.

## Assumptions

- The diagnostic facts F1–F6 are current. Live is not re-explored during specify; the plan's first Live step re-confirms them read-only before any change.
- The deployed app does not call the two-parameter publish entry point. Its publish path is the one-parameter design from the repo's 0010, so removing access to the two-parameter version breaks no current feature. The plan confirms this from the code.
- The existing helper checks ("is admin", "is active user") are correct as diagnosed (F5) and may be reused by access rules.
- The intended access model is the one already expressed by the repo's B1/B2 rules: admins all, staff read-only on designated tables, others nothing. This feature fixes the mechanism, not the model.
- 001's verification approach (forced-rollback transactions, transaction-local identities, existing `TEST_ADMIN_EMAIL` test subject, no Auth users) is reused.
- Out of scope:
  - new features;
  - B2 rollout steps (0010 apply and B2 behavioral checks stay in 001);
  - real supplier PDFs;
  - any other security findings, which are logged as follow-ups.
