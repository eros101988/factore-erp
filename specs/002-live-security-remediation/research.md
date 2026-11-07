# Research: Live Security Remediation

## R-1 Containment mechanism

- **Decision**: `REVOKE EXECUTE ON FUNCTION public.publish_supplier_price_list(uuid, uuid) FROM PUBLIC, anon, authenticated` as migration `0009a`.
- **Rationale**:
  - it is the smallest ACL-only change;
  - it is exactly reversible from the recorded `proacl`;
  - the app doesn't use the two-argument version (verified in `src/app/actions/pricing.ts`);
  - 0010 later drops the function on every database, so the end states converge.
- Supabase's default privileges grant EXECUTE on new `public` functions to `anon`, `authenticated`, and `service_role` explicitly (Live shows `anon_exec = true`). A `PUBLIC`-only revoke therefore isn't enough; all three are named.
- **Alternatives**: DROP FUNCTION (larger blast radius; reversal needs re-creating from file); ad-hoc REVOKE without a history entry (makes Live history incomplete; see R-2).

## R-2 Canonical sequence

- **Decision**: insert `0009a_revoke_legacy_publish.sql` and `0009b_fix_rls_recursion.sql` between `0009` and the unapplied `0010`. No renames.
- **Rationale**:
  - Lexical order puts `0009_` < `0009a_` < `0009b_` < `0010_` (verified with a JS sort, which the PGlite tests use).
  - Live applies only the missing steps, in file order, and history versions are apply timestamps. So history order equals file order, and a fresh replay equals Live.
  - Zero edits to existing files or references.
- **Rejected**:
  - (A) operational REVOKE plus a later migration. Containment would be missing from history, and the RLS fix file would sort after 0010 although it must run before it.
  - (B) renumbering 0010 to 0012. Viable, but it touches every 001 artifact that names 0010 (spec, plan, tasks, rollout SQL, hash map, report), for no safety gain over C1.
  - (C2) merging into 0010. That couples urgent containment with B2 schema changes and breaks FR-001.
- **If B is ever chosen instead**, the plan requires:
  - `git mv` with an unchanged blob hash;
  - updating the 001 references;
  - re-running `tests/b2_publish_db.test.ts`, the new matrix test, and a fresh replay with an object-level diff.
- **Naming in history**: the exact repo filename, matching Live's existing entries.

## R-3 Helper functions

- **Live definitions (F5)**: `LANGUAGE sql SECURITY DEFINER SET search_path = public`. They select from the unqualified `user_profiles` where `id = auth.uid()`, and `is_admin()` also requires `role = 'admin'`. Both require `is_active = true`.
- **Why they don't recurse**: as SECURITY DEFINER owned by the table owner (RLS not forced), their internal read bypasses the `user_profiles` RLS.
- **Escalation review**:
  - they return only a boolean about the caller's own `auth.uid()`;
  - they have no parameters;
  - EXECUTE by PUBLIC is acceptable and is needed by the policies.
- **Weakness found**: `search_path = public` still searches `pg_temp` first for relations, which lets temp tables shadow `user_profiles` inside a SECURITY DEFINER function.
- **Fix**: `SET search_path = ''` plus `public.user_profiles`, and mark the functions `STABLE`. `CREATE OR REPLACE` keeps the OID, grants, and the policies that reference them.

## R-4 Policy rewrite pattern

- **Pattern:**
  - `USING ((select public.is_admin()))` / `WITH CHECK ((select public.is_admin()))` for admin ALL;
  - `USING ((select public.is_active_user()))` for staff SELECT;
  - `TO authenticated` throughout.
- The `(select …)` wrapper makes Postgres evaluate the helper once per statement (Supabase RLS performance guidance), not per row.
- **Equivalence with the current intent:** role ∈ {admin, staff}, so `is_active_user()` = active admin ∪ active staff, and admins already have ALL. Adding the explicit `WITH CHECK` tightens writes; the old ALL policies relied on the implicit `USING`.
- **Same policy names** keep the change reviewable and the reversal simple.

## R-5 Verification without Auth users

Reuse 001's approach: forced-rollback `DO` blocks, `SET LOCAL ROLE`, and `request.jwt.claims`.

The five roles:
- **active admin**: the existing `TEST_ADMIN_EMAIL` subject;
- **active staff**: the same subject with `role` set to `staff` inside the rollback;
- **inactive member**: the same subject with `is_active` set to false inside the rollback;
- **non-member**: a synthetic UUID;
- **anon**: `SET LOCAL ROLE anon`.

`[TEST]` fixtures exist only inside the rollback.

**Fidelity**: this doesn't exercise PostgREST or cookies, so the app smoke test (§S) covers that.

## R-6 Backup scope

- **Containment:** exempt (FR-021). It takes a read-only snapshot and has a one-line GRANT reversal.
- **0009b:** the full three-layer gate from 001 (DN-1 = C), since it rewrites 21 policies and 2 functions. A restore, or the R-0009b reversal from the snapshot, is available.
