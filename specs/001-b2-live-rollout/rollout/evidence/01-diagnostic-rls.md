# Live read-only diagnostic: user_profiles RLS recursion (2026-11-07, Asia/Taipei)

Standalone diagnostic requested by the owner. **Not** T007 completion and not a T006 pass; T006 remains FAIL.
Project: `factory erp` (`mdyldmshwapikwnhlkvs`, ACTIVE_HEALTHY, Postgres 17), matching `NEXT_PUBLIC_SUPABASE_URL`.
Only catalog SELECTs, count queries, and one forced-rollback read-only DO block were run.

## 1. user_profiles policies on Live (RLS enabled, not forced)
| Policy | Cmd | Roles | USING |
|---|---|---|---|
| Users can read own profile | SELECT | public | `auth.uid() = id` |
| Admins can read all profiles | SELECT | public | `auth.uid() IN (SELECT user_profiles_1.id FROM user_profiles user_profiles_1 WHERE role = 'admin')` |
| Admins can update all profiles | UPDATE | public | same self-referencing subquery |

These are identical to repo `supabase/migrations/0002_add_rls_and_profiles.sql`.

## 2. Helper functions on Live
`is_admin()` and `is_active_user()`: `LANGUAGE sql SECURITY DEFINER SET search_path = public`, bodies identical to repo 0002.

## 3. Probe as authenticated (test subject = TEST_ADMIN_EMAIL account, active admin; transaction-local claims, forced rollback)
| Read | Result |
|---|---|
| public.user_profiles | ERROR: infinite recursion detected in policy for relation "user_profiles" |
| public.product_external_mappings (B1) | ERROR: same |
| public.import_batches (B1) | ERROR: same |
| public.pricing_policies (B2, from 0008) | ERROR: same |
| public.products (S1, policy uses is_active_user()) | OK rows=3 |
| is_admin() | OK true |

## 4. Additional state observed (read-only)
- `list_migrations`: 0001, 0002 (applied twice), 0003–0007, **0008_b2_pricing_foundation (20261107104621)**, **0009_b2_publish_rpc (20261107104850)**. 0010 is not applied. 0008 and 0009 were applied before this rollout run, outside this spec.
- `publish_supplier_price_list(uuid, uuid)` is present, SECURITY DEFINER, and **EXECUTE is granted to anon and authenticated** (risk R1 is live). `publish_supplier_price_list(uuid)`, `set_pricing_policy`, the append-only trigger, and the `supplier-price-lists` bucket are absent.
- Counts before = after (identical JSON): `pricing_policies=3`, `supplier_price_lists=0`, `supplier_price_list_items=0`, `purchase_cost_history=4`, `user_profiles=1`, `auth.users=1`, `storage.buckets=0`, and all others unchanged.

## Conclusion
- The user_profiles RLS recursion **exists on Live**, and Live matches repo 0002.
- Affected: user_profiles itself, and every policy of the form `auth.uid() IN (SELECT id FROM user_profiles …)`: B1 (import_batches, customers, historical_sales, historical_purchases, product_external_mappings, import_staging_rows) and B2 (pricing_policies, supplier_price_lists, supplier_price_list_items). The app's `user_profiles` role lookups (layout, requireAdmin, the /costs and /settings pages) go through the same path.
- Live was not changed.
