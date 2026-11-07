-- B2 hardening: append-only costs, all-or-nothing publish, versioned pricing policies,
-- configurable cost-change threshold, quote snapshot columns.
-- Idempotent: safe whether or not 0008/0009 were already applied.

-- 1. Pricing policies are versioned (new row per change), so tier is no longer globally unique
ALTER TABLE pricing_policies DROP CONSTRAINT IF EXISTS pricing_policies_tier_key;
CREATE UNIQUE INDEX IF NOT EXISTS pricing_policies_one_open_per_tier
    ON pricing_policies (tier) WHERE is_active AND effective_to IS NULL;
ALTER TABLE pricing_policies DROP CONSTRAINT IF EXISTS pricing_policies_margin_range;
ALTER TABLE pricing_policies ADD CONSTRAINT pricing_policies_margin_range CHECK (
    default_margin >= 0 AND default_margin < 1
    AND (minimum_margin IS NULL OR (minimum_margin >= 0 AND minimum_margin <= default_margin))
);
ALTER TABLE pricing_policies DROP CONSTRAINT IF EXISTS pricing_policies_tier_values;
ALTER TABLE pricing_policies ADD CONSTRAINT pricing_policies_tier_values CHECK (tier IN ('small', 'medium', 'large'));

-- 2. Supplier price lists
ALTER TABLE supplier_price_lists ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE supplier_price_lists ALTER COLUMN status SET DEFAULT 'draft';
UPDATE supplier_price_lists SET status = 'draft' WHERE status NOT IN ('draft','parsed','needs_review','ready','published','rejected');
ALTER TABLE supplier_price_lists DROP CONSTRAINT IF EXISTS supplier_price_lists_status_values;
ALTER TABLE supplier_price_lists ADD CONSTRAINT supplier_price_lists_status_values
    CHECK (status IN ('draft','parsed','needs_review','ready','published','rejected'));

-- 3. Supplier price list items: explicit row status (error rows must be fixed or ignored)
ALTER TABLE supplier_price_list_items ADD COLUMN IF NOT EXISTS row_status VARCHAR(20) NOT NULL DEFAULT 'valid';
ALTER TABLE supplier_price_list_items ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE supplier_price_list_items ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE supplier_price_list_items ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE supplier_price_list_items ALTER COLUMN unit_cost DROP NOT NULL; -- unreadable cost is stored as an error row
ALTER TABLE supplier_price_list_items DROP CONSTRAINT IF EXISTS spli_row_status_values;
ALTER TABLE supplier_price_list_items ADD CONSTRAINT spli_row_status_values CHECK (row_status IN ('valid','error','ignored'));
ALTER TABLE supplier_price_list_items DROP CONSTRAINT IF EXISTS spli_mapping_status_values;
ALTER TABLE supplier_price_list_items ADD CONSTRAINT spli_mapping_status_values
    CHECK (mapping_status IN ('suggested','confirmed','rejected','unmapped'));
CREATE INDEX IF NOT EXISTS spli_price_list_idx ON supplier_price_list_items (price_list_id);

-- 4. Product <-> Supplier <-> Supplier SKU mapping (reuses product_external_mappings, source_type = 'supplier_price_list')
-- The same SKU code may exist at two suppliers, so uniqueness includes supplier_id.
ALTER TABLE product_external_mappings DROP CONSTRAINT IF EXISTS product_external_mappings_source_type_external_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS product_external_mappings_src_supplier_code
    ON product_external_mappings (source_type, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), external_code);
ALTER TABLE product_external_mappings DROP CONSTRAINT IF EXISTS pem_status_values;
ALTER TABLE product_external_mappings ADD CONSTRAINT pem_status_values CHECK (status IN ('suggested','confirmed','rejected'));

-- 5. purchase_cost_history is append-only.
--    effective_date is the effective_from; effective_to is derived (next record's effective_from),
--    never written, so old months are never updated.
CREATE UNIQUE INDEX IF NOT EXISTS pch_source_item_unique
    ON purchase_cost_history (source_price_list_item_id) WHERE source_price_list_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pch_product_effective_idx ON purchase_cost_history (product_id, effective_date DESC);

CREATE OR REPLACE FUNCTION purchase_cost_history_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'purchase_cost_history is append-only: UPDATE is not allowed (insert a new effective record instead)';
    END IF;
    -- DELETE only for maintenance roles (test-data cleanup), never from app users
    IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'purchase_cost_history is append-only: DELETE is not allowed';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_cost_history_append_only ON purchase_cost_history;
CREATE TRIGGER trg_purchase_cost_history_append_only
    BEFORE UPDATE OR DELETE ON purchase_cost_history
    FOR EACH ROW EXECUTE FUNCTION purchase_cost_history_append_only();

-- 6. Quote snapshot columns
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS cost_unit VARCHAR(50);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS source_price_list_id UUID;
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS pricing_policy_id UUID;
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS pricing_tier VARCHAR(50);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS default_margin DECIMAL(5,4);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS suggested_price DECIMAL(15,4);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2);

-- 7. Configurable cost change warning threshold (ratio, 0.30 = 30%)
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('cost_change_warning_threshold', '0.30'::jsonb, '價格表成本漲跌超過此比例時顯示警告 (0.30 = 30%)')
ON CONFLICT (setting_key) DO NOTHING;

-- 8. Private storage bucket for uploaded supplier PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-price-lists', 'supplier-price-lists', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins manage supplier price list files" ON storage.objects;
CREATE POLICY "Admins manage supplier price list files" ON storage.objects FOR ALL TO authenticated
    USING (bucket_id = 'supplier-price-lists' AND is_admin())
    WITH CHECK (bucket_id = 'supplier-price-lists' AND is_admin());

-- 9. Publish: one transaction, all-or-nothing, caller identity from auth.uid()
DROP FUNCTION IF EXISTS publish_supplier_price_list(UUID, UUID);

CREATE OR REPLACE FUNCTION publish_supplier_price_list(p_price_list_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_list supplier_price_lists%ROWTYPE;
    v_unmapped INTEGER;
    v_invalid INTEGER;
    v_errors INTEGER;
    v_count INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_user AND role = 'admin' AND is_active = true) THEN
        RAISE EXCEPTION 'Only active admins can publish price lists';
    END IF;

    SELECT * INTO v_list FROM supplier_price_lists WHERE id = p_price_list_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Price list % not found', p_price_list_id;
    END IF;
    IF v_list.status IN ('published', 'rejected') THEN
        RAISE EXCEPTION 'Price list is already %', v_list.status;
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE mapping_status <> 'confirmed' OR mapped_product_id IS NULL),
        COUNT(*) FILTER (WHERE unit_cost IS NULL OR unit_cost <= 0 OR pack_qty IS NULL OR pack_qty <= 0),
        COUNT(*) FILTER (WHERE row_status = 'error')
    INTO v_unmapped, v_invalid, v_errors
    FROM supplier_price_list_items
    WHERE price_list_id = p_price_list_id AND row_status <> 'ignored';

    IF v_unmapped > 0 OR v_invalid > 0 OR v_errors > 0 THEN
        RAISE EXCEPTION 'PUBLISH_BLOCKED: % unmapped, % invalid cost, % error rows. Fix or ignore explicitly before publishing.',
            v_unmapped, v_invalid, v_errors;
    END IF;

    INSERT INTO purchase_cost_history (
        product_id, supplier_id, external_supplier_sku, unit_cost, cost_unit, pack_qty, pack_cost,
        effective_date, tax_type, source_document, source_price_list_id, source_price_list_item_id
    )
    SELECT
        i.mapped_product_id, v_list.supplier_id, i.supplier_sku, i.unit_cost, i.purchase_unit, i.pack_qty,
        i.unit_cost * i.pack_qty,
        v_list.effective_from, 'untaxed', v_list.source_filename, v_list.id, i.id
    FROM supplier_price_list_items i
    WHERE i.price_list_id = p_price_list_id AND i.row_status <> 'ignored';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'PUBLISH_BLOCKED: no publishable rows';
    END IF;

    -- Remember confirmed mappings for next month's auto-mapping
    INSERT INTO product_external_mappings (product_id, source_type, external_code, supplier_id, confidence, status, notes)
    SELECT DISTINCT ON (i.supplier_sku) i.mapped_product_id, 'supplier_price_list', i.supplier_sku, v_list.supplier_id, 1, 'confirmed',
           'Confirmed via price list ' || v_list.year || '/' || v_list.month
    FROM supplier_price_list_items i
    WHERE i.price_list_id = p_price_list_id AND i.row_status <> 'ignored'
    ON CONFLICT (source_type, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), external_code)
    DO UPDATE SET product_id = EXCLUDED.product_id, status = 'confirmed', confidence = 1;

    UPDATE supplier_price_lists
    SET status = 'published', published_by = v_user, published_at = now()
    WHERE id = p_price_list_id;

    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (v_user, 'PUBLISH_PRICE_LIST', 'supplier_price_lists', p_price_list_id,
            jsonb_build_object('rows', v_count, 'effective_from', v_list.effective_from));

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION publish_supplier_price_list(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION publish_supplier_price_list(UUID) TO authenticated;

-- 10. Pricing policy change = close the current version and insert a new one (keeps history)
CREATE OR REPLACE FUNCTION set_pricing_policy(p_tier TEXT, p_default_margin DECIMAL, p_minimum_margin DECIMAL DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_id UUID;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Only active admins can change pricing policies';
    END IF;

    UPDATE pricing_policies
    SET effective_to = CURRENT_DATE - 1, is_active = false
    WHERE tier = p_tier AND is_active AND effective_to IS NULL;

    INSERT INTO pricing_policies (tier, default_margin, minimum_margin, effective_from, is_active, created_by)
    VALUES (p_tier, p_default_margin, p_minimum_margin, CURRENT_DATE, true, v_user)
    RETURNING id INTO v_id;

    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (v_user, 'SET_PRICING_POLICY', 'pricing_policies', v_id,
            jsonb_build_object('tier', p_tier, 'default_margin', p_default_margin, 'minimum_margin', p_minimum_margin));
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION set_pricing_policy(TEXT, DECIMAL, DECIMAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_pricing_policy(TEXT, DECIMAL, DECIMAL) TO authenticated;
