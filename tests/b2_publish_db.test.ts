// @vitest-environment node
// Runs the real migrations (0001-0010) on an in-process Postgres (PGlite) to verify the
// publish RPC transaction, append-only cost history, and policy versioning.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { pickEffectiveCost, CostRecord, EffectiveCost, COST_NOT_FOUND } from '@/lib/pricing/costResolver';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const STAFF = '22222222-2222-2222-2222-222222222222';

// Minimal stand-ins for the Supabase-managed schemas the migrations reference
const SUPABASE_STUBS = `
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id UUID PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN);
  CREATE TABLE storage.objects (id UUID DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT);
`;

let db: PGlite;
let supplierId: string;
let productId: string;
let product2Id: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const one = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const asUser = (uid: string) => db.exec(`SELECT set_config('test.uid', '${uid}', false)`);

async function createList(year: number, month: number, items: { sku: string; cost: string | null; qty: number; product?: string | null; mapping?: string; row?: string }[]) {
  const list = await one<{ id: string }>(
    `INSERT INTO supplier_price_lists (supplier_id, year, month, effective_from, source_filename, status)
     VALUES ($1, $2, $3, make_date($2, $3, 1), 'fixture.pdf', 'needs_review') RETURNING id`,
    [supplierId, year, month],
  );
  for (const it of items) {
    await db.query(
      `INSERT INTO supplier_price_list_items (price_list_id, supplier_sku, unit_cost, pack_qty, purchase_unit, calculated_pack_cost, mapping_status, mapped_product_id, row_status)
       VALUES ($1, $2, $3::numeric, $4::int, 'ROLL', $3::numeric * $4::int, $5, $6, $7)`,
      [list.id, it.sku, it.cost, it.qty, it.mapping ?? 'confirmed', it.product === undefined ? productId : it.product, it.row ?? 'valid'],
    );
  }
  return list.id;
}

const costRows = async () =>
  (await db.query<CostRecord>(
    `SELECT id, product_id, supplier_id, external_supplier_sku, unit_cost::text, cost_unit, pack_qty, pack_cost::text,
            to_char(effective_date, 'YYYY-MM-DD') AS effective_date, created_at::text, source_price_list_id, source_price_list_item_id
     FROM purchase_cost_history WHERE product_id = $1`, [productId])).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }
  await db.exec(`
    INSERT INTO auth.users (id) VALUES ('${ADMIN}'), ('${STAFF}');
    INSERT INTO user_profiles (id, role, is_active) VALUES ('${ADMIN}', 'admin', true), ('${STAFF}', 'staff', true);
  `);
  supplierId = (await one(`INSERT INTO suppliers (name) VALUES ('臺灣營德') RETURNING id`)).id;
  productId = (await one(`INSERT INTO products (internal_sku, name, sales_unit, items_per_box) VALUES ('23191001', 'Tape', '箱', 40) RETURNING id`)).id;
  product2Id = (await one(`INSERT INTO products (internal_sku, name, sales_unit, items_per_box) VALUES ('23191002', 'Bag', '箱', 100) RETURNING id`)).id;
}, 60_000);

describe('B2 publish (real SQL on PGlite)', () => {
  it('Unmapped item blocks publish and nothing is written', async () => {
    await asUser(ADMIN);
    const listId = await createList(2026, 10, [
      { sku: 'KA-T91N', cost: '36.6', qty: 40 },
      { sku: 'NEW-SKU', cost: '5', qty: 10, product: null, mapping: 'unmapped' },
    ]);
    await expect(db.query('SELECT publish_supplier_price_list($1)', [listId])).rejects.toThrow(/PUBLISH_BLOCKED: 1 unmapped/);
    expect(await costRows()).toHaveLength(0);
    expect((await one(`SELECT status FROM supplier_price_lists WHERE id = $1`, [listId])).status).toBe('needs_review');
    await db.query(`DELETE FROM supplier_price_lists WHERE id = $1`, [listId]);
  });

  it('Invalid cost blocks publish; error rows must be fixed or ignored explicitly', async () => {
    await asUser(ADMIN);
    const listId = await createList(2026, 9, [
      { sku: 'KA-T91N', cost: '36.6', qty: 40 },
      { sku: 'KA-X99', cost: null, qty: 10, product: product2Id, row: 'error' },
    ]);
    await expect(db.query('SELECT publish_supplier_price_list($1)', [listId])).rejects.toThrow(/1 invalid cost, 1 error rows/);
    expect(await costRows()).toHaveLength(0);
    await db.query(`DELETE FROM supplier_price_lists WHERE id = $1`, [listId]);
  });

  it('Only active admins can publish', async () => {
    await asUser(STAFF);
    const listId = await createList(2026, 8, [{ sku: 'KA-T91N', cost: '36.6', qty: 40 }]);
    await expect(db.query('SELECT publish_supplier_price_list($1)', [listId])).rejects.toThrow(/Only active admins/);
    await db.query(`DELETE FROM supplier_price_lists WHERE id = $1`, [listId]);
  });

  it('Publish transaction rollback: a failure mid-insert leaves no partial cost rows', async () => {
    await asUser(ADMIN);
    const listId = await createList(2026, 7, [
      { sku: 'KA-T91N', cost: '36.6', qty: 40 },
      { sku: 'KA-B20', cost: '1.25', qty: 100, product: product2Id },
    ]);
    // Pre-existing history row pointing at the 2nd item -> unique violation inside the RPC
    const item2 = (await one(`SELECT id FROM supplier_price_list_items WHERE price_list_id = $1 AND supplier_sku = 'KA-B20'`, [listId])).id;
    await db.query(
      `INSERT INTO purchase_cost_history (product_id, unit_cost, effective_date, source_price_list_item_id) VALUES ($1, 1, '2020-01-01', $2)`,
      [product2Id, item2],
    );
    await expect(db.query('SELECT publish_supplier_price_list($1)', [listId])).rejects.toThrow();
    expect(await costRows()).toHaveLength(0); // KA-T91N row was rolled back too
    expect((await one(`SELECT status FROM supplier_price_lists WHERE id = $1`, [listId])).status).toBe('needs_review');
    expect((await one(`SELECT count(*)::int AS n FROM product_external_mappings WHERE source_type = 'supplier_price_list'`)).n).toBe(0);
    expect((await one(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'PUBLISH_PRICE_LIST'`)).n).toBe(0);
    await db.query(`DELETE FROM purchase_cost_history WHERE source_price_list_item_id = $1`, [item2]);
    await db.query(`DELETE FROM supplier_price_lists WHERE id = $1`, [listId]);
  });

  it('Monthly cost append: Nov (1464) and Dec (1520) both kept, old month never updated', async () => {
    await asUser(ADMIN);
    const nov = await createList(2026, 11, [
      { sku: 'KA-T91N', cost: '36.6', qty: 40 },
      { sku: 'KA-X99', cost: null, qty: 10, product: null, mapping: 'unmapped', row: 'ignored' }, // explicitly ignored
    ]);
    expect((await one('SELECT publish_supplier_price_list($1) AS n', [nov])).n).toBe(1);
    const novRow = (await costRows())[0];
    expect(novRow).toMatchObject({ unit_cost: '36.6000', pack_cost: '1464.0000', pack_qty: 40, external_supplier_sku: 'KA-T91N', effective_date: '2026-11-01' });
    expect((await one(`SELECT status, published_by FROM supplier_price_lists WHERE id = $1`, [nov]))).toMatchObject({ status: 'published', published_by: ADMIN });

    // Confirmed mapping is remembered for next month's auto-mapping
    expect(await one(`SELECT product_id, status FROM product_external_mappings WHERE external_code = 'KA-T91N'`)).toMatchObject({ product_id: productId, status: 'confirmed' });

    // Re-publishing the same list is refused
    await expect(db.query('SELECT publish_supplier_price_list($1)', [nov])).rejects.toThrow(/already published/);

    const dec = await createList(2026, 12, [{ sku: 'KA-T91N', cost: '38', qty: 40 }]);
    await db.query('SELECT publish_supplier_price_list($1)', [dec]);
    const rows = await costRows();
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.effective_date === '2026-11-01')).toEqual(novRow);
    expect(rows.find(r => r.effective_date === '2026-12-01')!.pack_cost).toBe('1520.0000');

    // Append-only: UPDATE is rejected by trigger
    await expect(db.query(`UPDATE purchase_cost_history SET unit_cost = 1 WHERE id = $1`, [novRow.id])).rejects.toThrow(/append-only/);
  });

  it('Effective cost by quote date from published rows; future cost not used; missing -> COST_NOT_FOUND', async () => {
    const rows = await costRows();
    expect((pickEffectiveCost(rows, '2026-11-15') as EffectiveCost).quote_unit_cost).toBe('1464.0000');
    expect((pickEffectiveCost(rows, '2026-12-01') as EffectiveCost).quote_unit_cost).toBe('1520.0000');
    expect(pickEffectiveCost(rows, '2026-10-31')).toEqual({ ok: false, code: COST_NOT_FOUND });
  });

  it('Quote snapshot remains unchanged after a new cost is published', async () => {
    await asUser(ADMIN);
    const q = await one(`INSERT INTO quotes (quote_number, tier_name, created_by) VALUES ('Q-TEST', '中盤', $1) RETURNING id`, [ADMIN]);
    await db.query(
      `INSERT INTO quote_items (quote_id, product_id, internal_sku, product_name, unit, quantity, unit_cost, effective_cost_date,
                                supplier_sku, supplier_name, default_margin, target_margin, unit_price, subtotal, total)
       VALUES ($1, $2, '23191001', 'Tape', '箱', 1, 1520, '2026-12-01', 'KA-T91N', '臺灣營德', 0.2, 0.18, 1854, 1854, 1947)`,
      [q.id, productId],
    );
    const jan = await createList(2027, 1, [{ sku: 'KA-T91N', cost: '40', qty: 40 }]);
    await db.query('SELECT publish_supplier_price_list($1)', [jan]);
    expect(await costRows()).toHaveLength(3);
    const item = await one(`SELECT unit_cost::text, effective_cost_date::text, default_margin::text, subtotal::text FROM quote_items WHERE quote_id = $1`, [q.id]);
    expect(item).toEqual({ unit_cost: '1520.0000', effective_cost_date: '2026-12-01', default_margin: '0.2000', subtotal: '1854.00' });
  });
});

describe('B2 pricing policies (real SQL on PGlite)', () => {
  it('Seeded demo margins are data, and changes create a new version', async () => {
    const seeded = (await db.query<{ tier: string; default_margin: string }>(
      `SELECT tier, default_margin::text FROM pricing_policies WHERE is_active ORDER BY tier`)).rows;
    expect(seeded).toEqual([
      { tier: 'large', default_margin: '0.1500' },
      { tier: 'medium', default_margin: '0.2000' },
      { tier: 'small', default_margin: '0.2500' },
    ]);

    await asUser(ADMIN);
    await db.query(`SELECT set_pricing_policy('medium', 0.22, 0.12)`);
    const medium = (await db.query<{ default_margin: string; minimum_margin: string | null; is_active: boolean }>(
      `SELECT default_margin::text, minimum_margin::text, is_active FROM pricing_policies WHERE tier = 'medium' ORDER BY created_at`)).rows;
    expect(medium).toHaveLength(2);
    expect(medium.filter(m => m.is_active)).toEqual([{ default_margin: '0.2200', minimum_margin: '0.1200', is_active: true }]);

    await asUser(STAFF);
    await expect(db.query(`SELECT set_pricing_policy('small', 0.3)`)).rejects.toThrow(/Only active admins/);
    await asUser(ADMIN);
    await expect(db.query(`SELECT set_pricing_policy('small', 1.2)`)).rejects.toThrow();
  });
});
