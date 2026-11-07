# Contract: Access Model (expected values, FR-008)

Roles:
- **A** = active admin
- **S** = active staff
- **I** = inactive member (admin or staff with `is_active = false`)
- **N** = authenticated non-member (no profile)
- **X** = anon

"0 rows" means a read returns nothing. "deny" means a write is refused. Reads must **never** raise a recursion error.

| Object | Action | A | S | I | N | X |
|---|---|---|---|---|---|---|
| `user_profiles` own row | read | yes | yes | yes¹ | 0 rows | 0 rows |
| `user_profiles` other rows | read | yes | 0 rows | 0 rows | 0 rows | 0 rows |
| `user_profiles` any row | update | yes | deny | deny | deny | deny |
| B1 tables² | read | yes | yes | 0 rows | 0 rows | 0 rows |
| B1 tables² | insert/update/delete | yes | deny | deny | deny | deny |
| B2 tables³ | read | yes | yes | 0 rows | 0 rows | 0 rows |
| B2 tables³ | insert/update/delete | yes | deny | deny | deny | deny |
| S1 control `products` | read | yes | yes | 0 rows | 0 rows | 0 rows |
| S1 control `products` | write | yes | deny | deny | deny | deny |
| `is_admin()` | result | true | false | false | false | false |
| `is_active_user()` | result | true | true | false | false | false |
| `publish_supplier_price_list(uuid, uuid)` | execute | deny⁴ | deny | deny | deny | deny |

¹ Unchanged from today: the own-row rule doesn't check `is_active`, and the app separately treats inactive users as inactive.

² B1 tables: `import_batches`, `customers`, `historical_sales`, `historical_purchases`, `product_external_mappings`, `import_staging_rows`.

³ B2 tables: `pricing_policies`, `supplier_price_lists`, `supplier_price_list_items`.

⁴ For roles `authenticated` and `anon`, and for `PUBLIC`. `service_role` and the owner keep EXECUTE (server-only, accepted; recorded).

This table is the source of truth for the matrix's expected outcomes. Any observed outcome that differs is FAIL.
