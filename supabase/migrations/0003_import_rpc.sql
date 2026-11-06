-- 0003_import_rpc.sql
-- Create an RPC function to handle bulk importing products and costs within a single transaction

CREATE OR REPLACE FUNCTION bulk_import_products_and_costs(
  payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  current_product_id UUID;
  processed_count INT := 0;
BEGIN
  -- Security Check: Only Admin can execute this RPC
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: Only admin can execute bulk import';
  END IF;
  -- We assume payload is a JSON array of objects:
  -- {
  --   "internal_sku": "...",
  --   "name": "...",
  --   "specification": "...",
  --   "sales_unit": "...",
  --   "items_per_box": 1,
  --   "unit_cost": 100.5,
  --   "effective_date": "2026-10-01"
  -- }

  -- Iterate through the payload array
  FOR item IN SELECT * FROM jsonb_array_elements(payload)
  LOOP
    -- 1. Upsert product
    INSERT INTO products (internal_sku, name, specification, sales_unit, items_per_box, is_active)
    VALUES (
      item->>'internal_sku',
      item->>'name',
      item->>'specification',
      item->>'sales_unit',
      (item->>'items_per_box')::INT,
      true
    )
    ON CONFLICT (internal_sku) DO UPDATE
    SET 
      name = EXCLUDED.name,
      specification = EXCLUDED.specification,
      sales_unit = EXCLUDED.sales_unit,
      items_per_box = EXCLUDED.items_per_box
    RETURNING id INTO current_product_id;

    -- 2. Insert cost history
    INSERT INTO purchase_cost_history (product_id, unit_cost, effective_date, tax_type)
    VALUES (
      current_product_id,
      (item->>'unit_cost')::DECIMAL,
      (item->>'effective_date')::DATE,
      'untaxed'
    );

    processed_count := processed_count + 1;
  END LOOP;

  -- Since we are in a plpgsql function, this is automatically executed in a single transaction.
  -- If any error occurs, PostgreSQL will automatically rollback the entire transaction.

  RETURN jsonb_build_object('success', true, 'processed_count', processed_count);
END;
$$;
