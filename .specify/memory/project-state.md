# Project State

Last updated: 2026-11-07. Keep this short; update it when a milestone changes.

## Completed
- **S1 foundation**: Next.js 16 + Supabase, auth/RLS, quote calculator, quote history (live-activated in S1.6).
- **B1 data intake foundation**: import wizard, staging rows, validation, transactional import RPCs (migrations 0004–0007).
- **B2 monthly supplier pricing & pricing policy**: implemented on branch `feat/b1-b2-data-intake-pricing`
  (commit `734c0ff`), not merged to `main`. Details: `B2_MONTHLY_COST_REPORT.md`.
  - Tests: `npx vitest run` → 48/48 passed (includes PGlite tests running real migration SQL).
  - Build: `npm run build` succeeds.

## Pending
- **Migrations 0008–0010**: not verified or applied on Live Supabase. Apply in order 0008 → 0009 → 0010
  only as an explicit, separate task.
- **First real supplier PDF review**: upload → review → publish with a real 侑安 supplier PDF;
  the parser may need layout tuning.
- **Kingcard (千奧) real exports**: not received yet; will feed historical analytics only.
- B1/B2 PR to `main` not opened (GitHub CLI not authenticated).

## Known issues
- `src/components/DataIntakeWizard.tsx` has pre-existing lint errors (`no-explicit-any`).

## Workflow
Spec Kit (Claude integration): `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
Supabase work: use the project skills `supabase` and `supabase-postgres-best-practices`.
