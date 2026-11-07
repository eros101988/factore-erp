-- 1. bulk_import_products_v2
CREATE OR REPLACE FUNCTION bulk_import_products_v2(batch_id UUID, payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item JSONB;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    -- Verify admin
    v_user_id := auth.uid();
    SELECT EXISTS (
        SELECT 1 FROM user_profiles WHERE id = v_user_id AND role = 'admin' AND is_active = true
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only active admins can perform bulk import';
    END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(payload)
    LOOP
        INSERT INTO products (internal_sku, name, specification, sales_unit, items_per_box, legacy_erp_id, category, barcode)
        VALUES (
            item->>'external_product_code',
            item->>'product_name',
            item->>'specification',
            COALESCE(item->>'unit', '箱'),
            COALESCE((item->>'pack_qty')::INTEGER, 1),
            item->>'external_product_code',
            item->>'category',
            item->>'barcode'
        )
        ON CONFLICT (internal_sku) DO UPDATE SET
            name = EXCLUDED.name,
            specification = EXCLUDED.specification,
            sales_unit = EXCLUDED.sales_unit,
            items_per_box = EXCLUDED.items_per_box,
            category = EXCLUDED.category,
            barcode = EXCLUDED.barcode;
            
        -- If current_purchase_price exists, add to history
        IF item->>'current_purchase_price' IS NOT NULL THEN
            INSERT INTO purchase_cost_history (
                product_id, unit_cost, effective_date, source_import_batch_id
            )
            SELECT 
                id, 
                (item->>'current_purchase_price')::DECIMAL, 
                CURRENT_DATE,
                batch_id
            FROM products WHERE internal_sku = item->>'external_product_code';
        END IF;
    END LOOP;
END;
$$;

-- 2. bulk_import_customers
CREATE OR REPLACE FUNCTION bulk_import_customers(batch_id UUID, payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item JSONB;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_user_id AND role = 'admin' AND is_active = true) INTO v_is_admin;
    IF NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(payload)
    LOOP
        INSERT INTO customers (external_customer_code, customer_name, tax_id, phone, address, salesperson, payment_terms)
        VALUES (
            item->>'external_customer_code',
            item->>'customer_name',
            item->>'tax_id',
            item->>'phone',
            item->>'address',
            item->>'salesperson',
            item->>'payment_terms'
        )
        ON CONFLICT (external_customer_code) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            tax_id = EXCLUDED.tax_id,
            phone = EXCLUDED.phone,
            address = EXCLUDED.address,
            salesperson = EXCLUDED.salesperson,
            payment_terms = EXCLUDED.payment_terms;
    END LOOP;
END;
$$;

-- 3. bulk_import_suppliers
CREATE OR REPLACE FUNCTION bulk_import_suppliers(batch_id UUID, payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item JSONB;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_user_id AND role = 'admin' AND is_active = true) INTO v_is_admin;
    IF NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(payload)
    LOOP
        INSERT INTO suppliers (external_supplier_code, name, tax_id, phone, address)
        VALUES (
            item->>'external_supplier_code',
            item->>'supplier_name',
            item->>'tax_id',
            item->>'phone',
            item->>'address'
        )
        ON CONFLICT (external_supplier_code) DO UPDATE SET
            name = EXCLUDED.name,
            tax_id = EXCLUDED.tax_id,
            phone = EXCLUDED.phone,
            address = EXCLUDED.address;
    END LOOP;
END;
$$;

-- 4. bulk_import_historical_sales
CREATE OR REPLACE FUNCTION bulk_import_historical_sales(batch_id UUID, payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item JSONB;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_user_id AND role = 'admin' AND is_active = true) INTO v_is_admin;
    IF NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(payload)
    LOOP
        INSERT INTO historical_sales (
            sale_date, sale_number, customer_code, product_code, quantity, unit_price, subtotal, discount, tax, total, import_batch_id
        )
        VALUES (
            (item->>'sale_date')::DATE,
            item->>'sale_number',
            item->>'customer_code',
            item->>'product_code',
            (item->>'quantity')::DECIMAL,
            (item->>'unit_price')::DECIMAL,
            (item->>'subtotal')::DECIMAL,
            COALESCE((item->>'discount')::DECIMAL, 0),
            COALESCE((item->>'tax')::DECIMAL, 0),
            (item->>'total')::DECIMAL,
            batch_id
        )
        ON CONFLICT (sale_number, product_code) DO NOTHING; -- Skip duplicates
    END LOOP;
END;
$$;

-- 5. bulk_import_historical_purchases
CREATE OR REPLACE FUNCTION bulk_import_historical_purchases(batch_id UUID, payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item JSONB;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_user_id AND role = 'admin' AND is_active = true) INTO v_is_admin;
    IF NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(payload)
    LOOP
        INSERT INTO historical_purchases (
            purchase_date, purchase_number, supplier_code, product_code, quantity, unit_cost, subtotal, import_batch_id
        )
        VALUES (
            (item->>'purchase_date')::DATE,
            item->>'purchase_number',
            item->>'supplier_code',
            item->>'product_code',
            (item->>'quantity')::DECIMAL,
            (item->>'unit_cost')::DECIMAL,
            (item->>'subtotal')::DECIMAL,
            batch_id
        )
        ON CONFLICT (purchase_number, product_code) DO NOTHING;
        
        -- Append to cost history
        INSERT INTO purchase_cost_history (
            product_id, supplier_id, external_supplier_sku, unit_cost, effective_date, source_import_batch_id
        )
        SELECT 
            p.id,
            s.id,
            item->>'product_code',
            (item->>'unit_cost')::DECIMAL,
            (item->>'purchase_date')::DATE,
            batch_id
        FROM products p
        LEFT JOIN suppliers s ON s.external_supplier_code = item->>'supplier_code'
        WHERE p.internal_sku = item->>'product_code';
    END LOOP;
END;
$$;
