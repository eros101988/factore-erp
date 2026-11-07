// @vitest-environment node
// 002 security matrix: replays the repo migrations on PGlite with Supabase-like roles/grants and
// evaluates contracts/access-model.md for five roles (A/S/I/N/X). Every cell runs in its own
// transaction that is always rolled back.
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const MIG_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const allMigrations = () => fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();
const upTo = (lastInclusive: string) => allMigrations().filter(f => f <= lastInclusive);
const has = (file: string) => fs.existsSync(path.join(MIG_DIR, file));

export const F_0009 = '0009_b2_publish_rpc.sql';
export const F_0009A = '0009a_revoke_legacy_publish.sql';
export const F_0009B = '0009b_fix_rls_recursion.sql';
export const F_0010 = '0010_b2_cost_integrity.sql';
// Live applied order (F1): 0002 appears twice in Live history.
const LIVE_ORDER = ['0001_initial_schema.sql', '0002_add_rls_and_profiles.sql', '0003_import_rpc.sql',
  '0002_add_rls_and_profiles.sql', '0004_b1_data_intake_foundation.sql', '0005_b1_rls.sql', '0006_b1_import_rpcs.sql',
  '0007_b1_staging_rows.sql', '0008_b2_pricing_foundation.sql', F_0009, F_0009A, F_0009B];
const FIXED_TABLES = ['user_profiles', 'import_batches', 'customers', 'historical_sales', 'historical_purchases',
  'product_external_mappings', 'import_staging_rows', 'pricing_policies', 'supplier_price_lists', 'supplier_price_list_items'];

const SUBJECT = '11111111-1111-1111-1111-111111111111';   // active admin test subject
const OTHER = '22222222-2222-2222-2222-222222222222';     // another (staff) profile
const NONMEMBER = '33333333-3333-3333-3333-333333333333'; // authenticated, no profile

// Supabase-like environment: roles, default grants on public, auth.uid() from JWT claims, storage.
const STUBS = `
  CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''),
                    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN DEFAULT false);
  CREATE TABLE storage.objects (id UUID DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
`;

// One fixture row per protected table so "yes" (>= 1 row visible / 1 row updated) is observable.
const SEED = `
  INSERT INTO auth.users (id, email) VALUES ('${SUBJECT}', 'subject@example.test'), ('${OTHER}', 'other@example.test');
  INSERT INTO public.user_profiles (id, display_name, role, is_active)
    VALUES ('${SUBJECT}', 'Subject', 'admin', true), ('${OTHER}', 'Other', 'staff', true);
  INSERT INTO public.suppliers (name) VALUES ('Fixture Supplier');
  INSERT INTO public.products (internal_sku, name, sales_unit, items_per_box) VALUES ('FX-001', 'Fixture', '箱', 1);
  INSERT INTO public.import_batches (source_system, import_type, original_filename) VALUES ('manual', 'products', 'fx.csv');
  INSERT INTO public.customers (external_customer_code, customer_name) VALUES ('C-FX', 'Fixture Customer');
  INSERT INTO public.historical_sales (sale_date, sale_number, customer_code, product_code, quantity, unit_price)
    VALUES (DATE '2026-01-01', 'S-FX', 'C-FX', 'FX-001', 1, 1);
  INSERT INTO public.historical_purchases (purchase_date, purchase_number, supplier_code, product_code, quantity, unit_cost)
    VALUES (DATE '2026-01-01', 'P-FX', 'SUP-FX', 'FX-001', 1, 1);
  INSERT INTO public.product_external_mappings (product_id, source_type, external_code, status)
    SELECT id, 'supplier_price_list', 'FX-SKU', 'confirmed' FROM public.products WHERE internal_sku = 'FX-001';
  INSERT INTO public.import_staging_rows (import_batch_id, row_number, raw_data)
    SELECT id, 1, '{}'::jsonb FROM public.import_batches LIMIT 1;
  INSERT INTO public.supplier_price_lists (supplier_id, year, month, effective_from)
    SELECT id, 2026, 1, DATE '2026-01-01' FROM public.suppliers LIMIT 1;
  INSERT INTO public.supplier_price_list_items (price_list_id, supplier_sku, unit_cost)
    SELECT id, 'FX-SKU', 1 FROM public.supplier_price_lists LIMIT 1;
`;

export async function buildDb(files: string[]) {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of files) {
    try { await db.exec(fs.readFileSync(path.join(MIG_DIR, f), 'utf8')); }
    catch (e) { throw new Error(`${f}: ${(e as Error).message}`); }
  }
  await db.exec(SEED);
  return db;
}

type Role = 'A' | 'S' | 'I' | 'N' | 'X';
export const ROLES: Role[] = ['A', 'S', 'I', 'N', 'X'];
type Kind = 'read' | 'write' | 'bool' | 'exec';
interface Cell { id: string; kind: Kind; sql: string; expect: Record<Role, string> }

const READ_ALL_ACTIVE = { A: 'yes', S: 'yes', I: '0 rows', N: '0 rows', X: '0 rows' };
const WRITE_ADMIN_ONLY = { A: 'yes', S: 'deny', I: 'deny', N: 'deny', X: 'deny' };
const B1 = { import_batches: 'original_filename', customers: 'customer_name', historical_sales: 'quantity',
  historical_purchases: 'quantity', product_external_mappings: 'notes', import_staging_rows: 'row_number' };
const B2 = { pricing_policies: 'default_margin', supplier_price_lists: 'notes', supplier_price_list_items: 'supplier_sku' };

// Expected values = contracts/access-model.md
export const CELLS: Cell[] = [
  { id: 'profile.own.read', kind: 'read', sql: `SELECT count(*)::int AS n FROM public.user_profiles WHERE id = auth.uid()`,
    expect: { A: 'yes', S: 'yes', I: 'yes', N: '0 rows', X: '0 rows' } },
  { id: 'profile.other.read', kind: 'read', sql: `SELECT count(*)::int AS n FROM public.user_profiles WHERE id = '${OTHER}'`,
    expect: { A: 'yes', S: '0 rows', I: '0 rows', N: '0 rows', X: '0 rows' } },
  { id: 'profile.update', kind: 'write', sql: `UPDATE public.user_profiles SET display_name = display_name WHERE id = '${OTHER}'`,
    expect: WRITE_ADMIN_ONLY },
  ...Object.entries({ ...B1, ...B2 }).flatMap(([t, col]): Cell[] => [
    { id: `${t in B1 ? 'B1' : 'B2'}.${t}.read`, kind: 'read', sql: `SELECT count(*)::int AS n FROM public.${t}`, expect: READ_ALL_ACTIVE },
    { id: `${t in B1 ? 'B1' : 'B2'}.${t}.write`, kind: 'write', sql: `UPDATE public.${t} SET ${col} = ${col}`, expect: WRITE_ADMIN_ONLY },
  ]),
  { id: 'S1.products.read', kind: 'read', sql: `SELECT count(*)::int AS n FROM public.products`, expect: READ_ALL_ACTIVE },
  { id: 'S1.products.write', kind: 'write', sql: `UPDATE public.products SET name = name`, expect: WRITE_ADMIN_ONLY },
  { id: 'fn.is_admin', kind: 'bool', sql: `SELECT public.is_admin() AS b`,
    expect: { A: 'true', S: 'false', I: 'false', N: 'false', X: 'false' } },
  { id: 'fn.is_active_user', kind: 'bool', sql: `SELECT public.is_active_user() AS b`,
    expect: { A: 'true', S: 'true', I: 'false', N: 'false', X: 'false' } },
  { id: 'fn.publish_2arg.execute', kind: 'exec',
    sql: `SELECT public.publish_supplier_price_list('00000000-0000-0000-0000-000000000099'::uuid, '${SUBJECT}'::uuid)`,
    expect: { A: 'deny', S: 'deny', I: 'deny', N: 'deny', X: 'deny' } },
];

function classify(kind: Kind, res: { rows?: Record<string, unknown>[]; affectedRows?: number } | null, err: string | null): string {
  if (err && /infinite recursion/.test(err)) return 'RECURSION';
  if (kind === 'read') return err ? (/permission denied/.test(err) ? '0 rows' : `ERROR ${err}`) : (Number(res!.rows![0].n) > 0 ? 'yes' : '0 rows');
  if (kind === 'write') return err ? 'deny' : ((res!.affectedRows ?? 0) > 0 ? 'yes' : 'deny');
  if (kind === 'bool') return err ? `ERROR ${err}` : String(res!.rows![0].b);
  return err ? (/permission denied/.test(err) ? 'deny' : `ERROR ${err}`) : 'yes';
}

export async function runCell(db: PGlite, role: Role, cell: Cell): Promise<string> {
  await db.exec('BEGIN');
  try {
    if (role === 'S') await db.exec(`UPDATE public.user_profiles SET role = 'staff' WHERE id = '${SUBJECT}'`);
    if (role === 'I') await db.exec(`UPDATE public.user_profiles SET is_active = false WHERE id = '${SUBJECT}'`);
    if (role === 'X') {
      await db.exec(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;`);
    } else {
      const sub = role === 'N' ? NONMEMBER : SUBJECT;
      await db.exec(`SELECT set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true);
                     SELECT set_config('request.jwt.claim.sub', '${sub}', true); SET LOCAL ROLE authenticated;`);
    }
    try { return classify(cell.kind, await db.query(cell.sql), null); }
    catch (e) { return classify(cell.kind, null, (e as Error).message); }
  } finally {
    await db.exec('ROLLBACK');
  }
}

export async function runMatrix(db: PGlite) {
  const out: Record<string, Record<Role, string>> = {};
  for (const c of CELLS) {
    out[c.id] = {} as Record<Role, string>;
    for (const r of ROLES) out[c.id][r] = await runCell(db, r, c);
  }
  return out;
}

export function mismatches(m: Record<string, Record<Role, string>>) {
  return CELLS.flatMap(c => ROLES.filter(r => m[c.id][r] !== c.expect[r]).map(r => `${c.id}[${r}] got ${m[c.id][r]} want ${c.expect[r]}`));
}

// Catalog snapshot for object-level comparison (policies, functions incl. ACL, constraints, indexes, columns).
export async function snapshot(db: PGlite) {
  const q = async (sql: string) => (await db.query(sql)).rows.map(r => JSON.stringify(r));
  return {
    policies: await q(`SELECT schemaname, tablename, policyname, cmd, roles::text, qual, with_check FROM pg_policies ORDER BY 1,2,3`),
    // ACL compared as a sorted set of entries: GRANT order changes aclitem order, not the privileges.
    functions: await q(`SELECT p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) AS def,
                               (SELECT string_agg(a, ',' ORDER BY a) FROM unnest(p.proacl::text[]) a) AS acl
                        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY 1`),
    constraints: await q(`SELECT conrelid::regclass::text AS rel, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
                          WHERE connamespace = 'public'::regnamespace ORDER BY 1,2`),
    indexes: await q(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1,2`),
    columns: await q(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
                      WHERE table_schema = 'public' ORDER BY 1,2`),
  };
}

export function diffSnapshots(a: Awaited<ReturnType<typeof snapshot>>, b: Awaited<ReturnType<typeof snapshot>>) {
  const d: string[] = [];
  for (const k of Object.keys(a) as (keyof typeof a)[]) {
    const sa = new Set(a[k]), sb = new Set(b[k]);
    for (const x of a[k]) if (!sb.has(x)) d.push(`- ${k}: ${x.slice(0, 160)}`);
    for (const x of b[k]) if (!sa.has(x)) d.push(`+ ${k}: ${x.slice(0, 160)}`);
  }
  return d;
}

const LEGACY_SIG = 'public.publish_supplier_price_list(uuid,uuid)';

describe('002 baseline: repo migrations 0001 -> 0009 (no remediation)', () => {
  it('reproduces the Live diagnostic: recursion on role lookups, anon can execute the legacy publish function', async () => {
    const db = await buildDb(upTo(F_0009));
    const m = await runMatrix(db);
    console.log('[002 baseline matrix]\n' + JSON.stringify(m, null, 1));
    // F4: recursion for admins on profile, B1 and B2 reads
    expect(m['profile.own.read'].A).toBe('RECURSION');
    expect(m['B1.product_external_mappings.read'].A).toBe('RECURSION');
    expect(m['B1.import_batches.read'].A).toBe('RECURSION');
    expect(m['B2.pricing_policies.read'].A).toBe('RECURSION');
    // F5: S1 via helpers works, helpers correct
    expect(m['S1.products.read'].A).toBe('yes');
    expect(m['fn.is_admin'].A).toBe('true');
    expect(m['fn.is_active_user'].S).toBe('true');
    // F2: anonymous caller can execute the legacy two-argument publish function
    expect(m['fn.publish_2arg.execute'].X).toBe('yes');
    const acl = (await db.query<{ anon: boolean }>(`SELECT has_function_privilege('anon', '${LEGACY_SIG}', 'EXECUTE') AS anon`)).rows[0];
    expect(acl.anon).toBe(true);
  }, 120_000);
});

describe.runIf(has(F_0009A))('002 L-04: after 0009a containment', () => {
  it('legacy function is not executable by anon/authenticated/PUBLIC; nothing else differs from post-0009', async () => {
    const base = await buildDb(upTo(F_0009));
    const contained = await buildDb(upTo(F_0009A));

    const priv = (await contained.query<{ anon: boolean; auth: boolean; pub: boolean; svc: boolean }>(
      `SELECT has_function_privilege('anon', '${LEGACY_SIG}', 'EXECUTE') AS anon,
              has_function_privilege('authenticated', '${LEGACY_SIG}', 'EXECUTE') AS auth,
              has_function_privilege('public', '${LEGACY_SIG}', 'EXECUTE') AS pub,
              has_function_privilege('service_role', '${LEGACY_SIG}', 'EXECUTE') AS svc`)).rows[0];
    expect(priv).toEqual({ anon: false, auth: false, pub: false, svc: true });

    // object-level diff: only the legacy function's ACL may change
    const d = diffSnapshots(await snapshot(base), await snapshot(contained));
    expect(d.length).toBe(2);
    expect(d.every(x => x.includes('publish_supplier_price_list(uuid,uuid)'))).toBe(true);

    // matrix: every role is now denied on the legacy function; all other cells identical to baseline
    const mb = await runMatrix(base);
    const mc = await runMatrix(contained);
    for (const r of ROLES) expect(mc['fn.publish_2arg.execute'][r]).toBe('deny');
    const changed = Object.keys(mb).filter(k => k !== 'fn.publish_2arg.execute' && JSON.stringify(mb[k]) !== JSON.stringify(mc[k]));
    expect(changed).toEqual([]);
  }, 180_000);

  it('reversal R-0009a restores the post-0009 ACL exactly', async () => {
    const base = await buildDb(upTo(F_0009));
    const contained = await buildDb(upTo(F_0009A));
    const reversal = fs.readFileSync(
      path.join(__dirname, '..', 'specs', '002-live-security-remediation', 'rollout', 'recovery', 'R-0009a.sql'), 'utf8');
    const t0 = Date.now();
    await contained.exec(reversal);
    const elapsed = Date.now() - t0;
    expect(diffSnapshots(await snapshot(base), await snapshot(contained))).toEqual([]);
    expect(elapsed).toBeLessThan(15 * 60 * 1000);
  }, 180_000);
});

const isFixedPolicy = (row: string) => FIXED_TABLES.some(t => row.includes(`"tablename":"${t}"`));

describe.runIf(has(F_0009B))('002 L-01..L-03: after 0009b permanent fix', () => {
  it('L-01 fresh replay 0001 -> 0009b: full access model matches, 0 recursion, helpers hardened', async () => {
    const db = await buildDb(upTo(F_0009B));
    const m = await runMatrix(db);
    console.log('[002 post-0009b matrix]\n' + JSON.stringify(m, null, 1));
    expect(mismatches(m)).toEqual([]);
    expect(JSON.stringify(m)).not.toContain('RECURSION');
    const helpers = (await db.query<{ proname: string; cfg: string; vol: string; secdef: boolean; src: string }>(
      `SELECT proname, array_to_string(proconfig, ',') AS cfg, provolatile AS vol, prosecdef AS secdef, prosrc AS src
       FROM pg_proc WHERE proname IN ('is_admin', 'is_active_user') AND pronamespace = 'public'::regnamespace ORDER BY 1`)).rows;
    expect(helpers).toHaveLength(2);
    for (const h of helpers) {
      expect(h.cfg).toBe('search_path=""');
      expect(h.vol).toBe('s');
      expect(h.secdef).toBe(true);
      expect(h.src).toContain('public.user_profiles');
    }
  }, 180_000);

  it('0009b touches only the 2 helpers and the 21 user_profiles/B1/B2 policies', async () => {
    const d = diffSnapshots(await snapshot(await buildDb(upTo(F_0009A))), await snapshot(await buildDb(upTo(F_0009B))));
    const outside = d.filter(x => !(x.includes('policies:') && FIXED_TABLES.some(t => x.includes(`"tablename":"${t}"`)))
      && !(x.includes('functions:') && (x.includes('is_admin()') || x.includes('is_active_user()'))));
    expect(outside).toEqual([]);
    expect(d.filter(x => x.startsWith('+ policies:')).length).toBe(21);
  }, 180_000);

  it('L-02 replay through 0010: matrix still matches, fixed policies unchanged, legacy function absent', async () => {
    const at9b = await buildDb(upTo(F_0009B));
    const at10 = await buildDb(upTo(F_0010));
    const p9b = (await snapshot(at9b)).policies.filter(isFixedPolicy);
    const p10 = (await snapshot(at10)).policies.filter(isFixedPolicy);
    expect(p10).toEqual(p9b);
    const legacy = (await at10.query<{ present: boolean }>(
      `SELECT to_regprocedure('public.publish_supplier_price_list(uuid,uuid)') IS NOT NULL AS present`)).rows[0];
    expect(legacy.present).toBe(false);
    const m = await runMatrix(at10);
    const mm = mismatches(m).filter(x => !x.startsWith('fn.publish_2arg.execute'));
    expect(mm).toEqual([]);
    expect(JSON.stringify(m)).not.toContain('RECURSION');
  }, 240_000);

  it('L-03 Live-like replay (Live history order, 0002 twice) equals fresh replay object by object', async () => {
    const fresh = await snapshot(await buildDb(upTo(F_0009B)));
    const liveLike = await snapshot(await buildDb(LIVE_ORDER));
    expect(diffSnapshots(fresh, liveLike)).toEqual([]);
  }, 180_000);
});

const R_0009B = path.join(__dirname, '..', 'specs', '002-live-security-remediation', 'rollout', 'recovery', 'R-0009b.sql');
describe.runIf(has(F_0009B) && fs.existsSync(R_0009B))('002 T011: R-0009b dry-run', () => {
  it('R-0009b (generated from the Live catalog) restores the exact post-0009a objects on a Live-like replay', async () => {
    const at9a = await snapshot(await buildDb(LIVE_ORDER.slice(0, -1)));
    const db = await buildDb(LIVE_ORDER);
    await db.exec(fs.readFileSync(R_0009B, 'utf8'));
    expect(diffSnapshots(at9a, await snapshot(db))).toEqual([]);
  }, 180_000);
});
