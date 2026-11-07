# Contract: Inspection Report (Stage 1 preflight)

Read-only. Only catalog/`SELECT count(*)` queries via MCP `execute_sql`, plus `list_projects`, `get_project`, `list_migrations`, `list_tables`, `get_advisors`.
It never touches business values: counts and IDs only.

## Object inventory (expected after each step)

### Prerequisites (must be PRESENT before 0008)
- Tables: `suppliers`, `products`, `purchase_cost_history` (with B1 columns `supplier_id`, `external_supplier_sku`, `cost_unit`, `pack_qty`, `source_import_batch_id`), `quotes`, `quote_items`, `system_settings`, `audit_logs`, `user_profiles`, `product_external_mappings`, `import_batches`
- Functions: `is_admin()`, `is_active_user()`
- `system_settings.setting_key` is unique (needed by 0010 `ON CONFLICT`)

### 0008
- Tables: `pricing_policies`, `supplier_price_lists` (unique `supplier_id, year, month`), `supplier_price_list_items`
- Columns:
  - `purchase_cost_history`: `source_price_list_id`, `source_price_list_item_id`, `pack_cost`
  - `quotes`: `pricing_policy_id`
  - `quote_items`: `supplier_id`, `supplier_sku`, `cost_source_type`, `cost_source_id`
- Seed: `pricing_policies` small 0.2500, medium 0.2000, large 0.1500
- RLS enabled on the 3 new tables. 6 policies: "Admin can do all on …" and "Staff can view …" for each.

### 0009
- Function `publish_supplier_price_list(uuid, uuid)` (transient; removed by 0010)

### 0010
- `pricing_policies`:
  - `pricing_policies_tier_key` dropped
  - partial unique index `pricing_policies_one_open_per_tier`
  - checks `pricing_policies_margin_range`, `pricing_policies_tier_values`
- `supplier_price_lists`:
  - column `storage_path`
  - check `supplier_price_lists_status_values`
- `supplier_price_list_items`:
  - columns `row_status` (NOT NULL, default `valid`), `error_message`, `reviewed_by`, `reviewed_at`
  - `unit_cost` nullable
  - checks `spli_row_status_values`, `spli_mapping_status_values`
  - index `spli_price_list_idx`
- `product_external_mappings`:
  - `product_external_mappings_source_type_external_code_key` dropped
  - unique index `product_external_mappings_src_supplier_code`
  - check `pem_status_values`
- `purchase_cost_history`:
  - indexes `pch_source_item_unique`, `pch_product_effective_idx`
  - function `purchase_cost_history_append_only()`
  - trigger `trg_purchase_cost_history_append_only` (BEFORE UPDATE OR DELETE)
- `quote_items` columns: `supplier_name`, `cost_unit`, `source_price_list_id`, `pricing_policy_id`, `pricing_tier`, `default_margin`, `suggested_price`, `gross_profit`
- `system_settings` row `cost_change_warning_threshold` = 0.30
- `storage.buckets` row `supplier-price-lists` (public = false). Policy "Admins manage supplier price list files" on `storage.objects`.
- Functions:
  - `publish_supplier_price_list(uuid)` returns integer, SECURITY DEFINER; the `(uuid, uuid)` version is absent
  - `set_pricing_policy(text, numeric, numeric)`
  - EXECUTE revoked from `PUBLIC` and `anon`, granted to `authenticated`, on both

## Conflict scan (must be 0 for READY, unless stated)
- `product_external_mappings` grouped by `(source_type, supplier_id, external_code)` having count > 1
- `product_external_mappings.status NOT IN ('suggested','confirmed','rejected')`
- If `pricing_policies` exists: more than 1 active open row per tier; tier values outside small/medium/large; margins outside 0–1
- If `supplier_price_lists` exists: status values outside the allowed set
- Existing bucket `supplier-price-lists`: object count (informational; must be preserved)

## Test subject (DN-3)
- Look up the account named by `TEST_ADMIN_EMAIL` (read locally from `.env.local`; never printed or committed): its UUID, `user_profiles.role`, and `is_active`.
- `test_subject_ok = true` only if the account exists and has an active `admin` profile. If false, the admin/staff behavior checks are flagged BLOCKED / NOT TESTED in the report. It does not change the migration readiness verdict.

## Verdict
- **READY:** all prerequisites PRESENT, all 0008–0010 objects ABSENT, 0 conflicts
- **ALREADY APPLIED:** all 0008–0010 objects PRESENT → skip to the Stage 5 verification, after owner approval
- **PARTIALLY APPLIED:** any mix → STOP, and propose a recovery
- **BLOCKED:** a prerequisite missing, project mismatch, or MCP lacks a needed right

## Output
`rollout/evidence/01-inspection.json` (machine-readable) plus a summary table in `rollout/rollout-record.md`.
