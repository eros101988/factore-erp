# Recovery Runbook: B2 Live Rollout

Use only when tasks.md sends you to Phase R.

Every action requires **explicit owner approval**, quoted in `rollout-record.md` before it runs. After the action, run the confirmation query and log it. The run's verdict stays FAIL, or BLOCKED if the stop came before any migration.

The confirmation tool is `rollout/sql/preflight-inventory.sql`, referred to below as **INV**.

| Stop point | Task | Action (after approval) | Confirm |
|---|---|---|---|
| Before any migration (T002–T009) | — | None. Record the cause and re-run from T007. | `baseline-counts.sql` equals `01-baseline-counts.json` |
| 0008 apply error | T020 | Run INV. If the 0008 objects are ABSENT, there's nothing to undo; fix the cause in a separate change. If they are PARTIAL, run `R-0008.sql` or restore. | INV: grp 0008 all `present = false` |
| 0008 post-check FAIL | T020 | `R-0008.sql`, or keep 0008 and fix forward in a separate change | INV matches the pre-0008 record |
| 0009 error / post-check FAIL | T021 | `R-0009.sql` | INV: `publish_supplier_price_list(uuid,uuid)` absent; `postcheck-0008.sql` still all PASS |
| 0010 apply error | T022 | **First** `R-0009.sql` (closes the R1 window), then INV. If grp 0010 is PARTIAL → `R-0010.sql` or restore. | INV consistent; 2-arg function absent |
| 0010 post-check FAIL | T023 | Unsafe failure (A-0010-02 / 07 / 08: anon EXECUTE, missing RLS/REVOKE, public bucket) → `R-0010.sql` + `R-0009.sql`, or restore. Otherwise keep the schema and fix forward with a new approved migration. | Re-run `postcheck-0010.sql` or INV |
| Verification FAIL / cleanup residue | T024 | Keep the schema; tell the owner not to publish price lists. Residue is deleted only after owner review, by the maintenance role, followed by a re-run of T017. | `cleanup-reconcile.sql` all 0 |
| Severe / unknown | T025 | Restore from L3: `pg_restore --clean --if-exists -d <db> yuan-erp-pre-b2.dump` (owner types the password), or from L1 PITR if one was confirmed. **This discards real activity after the restore point.** | Re-run T007; inventory and counts equal the pre-rollout record |

## Notes

- Order of reverse scripts is newest first: `R-0010` → `R-0009` → `R-0008`. `R-0008` refuses to run while a publish function exists.
- Each reverse script aborts without changing anything if any B2 data exists (price lists, items, published cost rows, bucket objects).
- Two parts of 0010 can't be reversed in SQL:
  - the status normalisation `UPDATE` (expected to affect 0 rows);
  - the bucket row. Supabase blocks direct SQL deletes on `storage.*`, so an empty bucket is removed via Dashboard → Storage if required.
- Restoring discards real activity after the restore point. Prefer the reverse scripts while the B2 tables are empty.
