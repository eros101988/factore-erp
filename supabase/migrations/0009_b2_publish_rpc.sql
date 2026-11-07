-- 1. publish_supplier_price_list
CREATE OR REPLACE FUNCTION publish_supplier_price_list(p_price_list_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_list RECORD;
    v_item RECORD;
BEGIN
    -- Verify admin
    SELECT EXISTS (
        SELECT 1 FROM user_profiles WHERE id = p_user_id AND role = 'admin' AND is_active = true
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only active admins can publish price lists';
    END IF;

    -- Get list info
    SELECT * INTO v_list FROM supplier_price_lists WHERE id = p_price_list_id;
    IF v_list.status = 'published' THEN
        RAISE EXCEPTION 'Price list is already published';
    END IF;

    -- Insert into purchase_cost_history for all mapped items
    FOR v_item IN (SELECT * FROM supplier_price_list_items WHERE price_list_id = p_price_list_id AND mapping_status = 'confirmed' AND mapped_product_id IS NOT NULL)
    LOOP
        INSERT INTO purchase_cost_history (
            product_id, supplier_id, external_supplier_sku, unit_cost, effective_date, 
            source_price_list_id, source_price_list_item_id, cost_unit, pack_qty, pack_cost
        )
        VALUES (
            v_item.mapped_product_id,
            v_list.supplier_id,
            v_item.supplier_sku,
            v_item.unit_cost,
            v_list.effective_from,
            p_price_list_id,
            v_item.id,
            v_item.purchase_unit,
            v_item.pack_qty,
            v_item.calculated_pack_cost
        );
    END LOOP;

    -- Update list status
    UPDATE supplier_price_lists 
    SET status = 'published', published_by = p_user_id, published_at = now()
    WHERE id = p_price_list_id;
    
    -- Audit
    INSERT INTO audit_logs (user_id, action, table_name, record_id)
    VALUES (p_user_id, 'PUBLISH_PRICE_LIST', 'supplier_price_lists', p_price_list_id);
    
END;
$$;
