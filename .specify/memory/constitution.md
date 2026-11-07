# Yuan ERP (侑安 ERP) Constitution

Permanent invariants. Every spec, plan, task and code change must satisfy all of them.
Current status lives in `.specify/memory/project-state.md`, not here.

## Core Principles

### I. Money uses Decimal
All financial calculation (cost, pack cost, price, margin, fees, tax) uses `decimal.js`
(or SQL `DECIMAL`). Never JS floating-point math on money.

### II. Authorization fails closed
Missing user, missing profile, inactive user, or unknown role = deny. Server actions and
`SECURITY DEFINER` RPCs check the role themselves (`auth.uid()`), never trust client-sent IDs.

### III. SKIPPED / NOT TESTED ≠ PASS
A check that was skipped, mocked away, or not run is reported as such. Never report it as passed.

### IV. No hard-coded credentials
Secrets come from environment variables only. `.env*`, tokens, passwords, and Supabase
secret keys are never committed, logged, or pasted into docs.

### V. Cost history is append-only
`purchase_cost_history` only receives INSERTs. Old months are never updated; a new cost is a
new row with a new `effective_from`.

### VI. Quotes preserve snapshots
A saved quote stores its own copy of cost, cost source, effective date, policy, margins, fees,
and price. Later cost or policy changes never alter a saved quote.

### VII. Current quote price = effective current cost + fees + target margin
`P = (C + F) / (1 − r − m)` with `1 − r − m > 0`; margin is not markup. Cost is the published
supplier cost with `effective_from <= quote date`. No effective cost → `COST_NOT_FOUND`;
never fall back to 0, demo, future, or remembered values.

### VIII. Kingcard (千奧) history is analytics, not pricing authority
Historical sales/purchases are for analysis, calibration, audit, and comparison. They never
set current cost or pricing policy unless an admin explicitly imports and publishes them.

### IX. Do not expand beyond the current spec
Implement only what the active spec asks for. New ideas become a new spec, not extra scope.

## Governance
This file overrides conflicting instructions in other docs. Changing a principle requires
an explicit request from the project owner; record the change in the version line below.

**Version**: 1.0.0 | **Ratified**: 2026-11-07 | **Last Amended**: 2026-11-07
