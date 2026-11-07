-- T004 / contracts §B: B-05..B-08. Runs on Live ONLY at T015.
-- Forced rollback: always ends with RAISE EXCEPTION 'B2_VERIFY_RESULT {json}'. Identity: research R-4.
DO $verify$
DECLARE
  v_admin uuid := '__ADMIN_ID__';
  v_res jsonb := '{}'::jsonb;
  v_sup uuid; v_p1 uuid; v_nov uuid; v_dec uuid; v_nov_row uuid;
  v_nov_cost text; v_dec_cost text; v_rows int; v_map text; v_msg text; v_msg2 text;
  v_d1 text; v_d2 text; v_d3 text; v_d4 text;
BEGIN
  INSERT INTO public.suppliers (name) VALUES ('[TEST] B2 Rollout Supplier') RETURNING id INTO v_sup;
  INSERT INTO public.products (internal_sku, name, sales_unit, items_per_box)
    VALUES ('[TEST]-B2-001', '[TEST] Tape', '箱', 40) RETURNING id INTO v_p1;

  INSERT INTO public.supplier_price_lists (supplier_id, year, month, effective_from, source_filename, status)
    VALUES (v_sup, 2099, 11, DATE '2099-11-01', '[TEST]-fixture.pdf', 'ready') RETURNING id INTO v_nov;
  INSERT INTO public.supplier_price_list_items
    (price_list_id, supplier_sku, unit_cost, pack_qty, purchase_unit, calculated_pack_cost, mapping_status, mapped_product_id, row_status)
    VALUES (v_nov, 'TEST-KA-T91N', 36.6, 40, 'ROLL', 1464, 'confirmed', v_p1, 'valid');
  INSERT INTO public.supplier_price_lists (supplier_id, year, month, effective_from, source_filename, status)
    VALUES (v_sup, 2099, 12, DATE '2099-12-01', '[TEST]-fixture.pdf', 'ready') RETURNING id INTO v_dec;
  INSERT INTO public.supplier_price_list_items
    (price_list_id, supplier_sku, unit_cost, pack_qty, purchase_unit, calculated_pack_cost, mapping_status, mapped_product_id, row_status)
    VALUES (v_dec, 'TEST-KA-T91N', 38, 40, 'ROLL', 1520, 'confirmed', v_p1, 'valid');

  -- B-05: publish Nov then Dec as admin; both months kept with exact Decimal pack cost
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.publish_supplier_price_list(v_nov);
    PERFORM public.publish_supplier_price_list(v_dec);
    EXECUTE 'RESET ROLE';
    SELECT id, pack_cost::text INTO v_nov_row, v_nov_cost FROM public.purchase_cost_history WHERE source_price_list_id = v_nov;
    SELECT pack_cost::text INTO v_dec_cost FROM public.purchase_cost_history WHERE source_price_list_id = v_dec;
    SELECT count(*) INTO v_rows FROM public.purchase_cost_history WHERE product_id = v_p1;
    SELECT status || ':' || (product_id = v_p1)::text INTO v_map FROM public.product_external_mappings
      WHERE source_type = 'supplier_price_list' AND supplier_id = v_sup AND external_code = 'TEST-KA-T91N';
    v_res := v_res || jsonb_build_object('B-05', jsonb_build_object(
      'result', CASE WHEN v_nov_cost = '1464.0000' AND v_dec_cost = '1520.0000' AND v_rows = 2 AND v_map = 'confirmed:true'
                     THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'nov=' || COALESCE(v_nov_cost, 'null') || ' dec=' || COALESCE(v_dec_cost, 'null') ||
                ' rows=' || v_rows || ' mapping=' || COALESCE(v_map, 'none')));
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || jsonb_build_object('B-05', jsonb_build_object('result', 'FAIL', 'detail', 'unexpected: ' || SQLERRM));
  END;
  EXECUTE 'RESET ROLE';

  -- B-06: UPDATE of a published cost row is refused, as admin and as the owner role
  v_msg := 'NOT REFUSED'; v_msg2 := 'NOT REFUSED';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.purchase_cost_history SET unit_cost = 1 WHERE id = v_nov_row;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  BEGIN
    UPDATE public.purchase_cost_history SET unit_cost = 1 WHERE id = v_nov_row;
  EXCEPTION WHEN OTHERS THEN v_msg2 := SQLERRM;
  END;
  v_res := v_res || jsonb_build_object('B-06', jsonb_build_object(
    'result', CASE WHEN v_nov_row IS NOT NULL AND v_msg LIKE '%append-only%' AND v_msg2 LIKE '%append-only%' THEN 'PASS' ELSE 'FAIL' END,
    'detail', 'admin: ' || v_msg || ' | owner: ' || v_msg2));

  -- B-07: re-publishing an already published list is refused
  v_msg := 'NOT REFUSED';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.publish_supplier_price_list(v_nov);
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  v_res := v_res || jsonb_build_object('B-07', jsonb_build_object(
    'result', CASE WHEN v_msg LIKE '%already published%' THEN 'PASS' ELSE 'FAIL' END, 'detail', v_msg));

  -- B-08: effective cost by date (same rule as getEffectiveProductCost): published only, effective_from <= date, newest wins
  SELECT COALESCE(pack_cost, unit_cost)::text INTO v_d1 FROM public.purchase_cost_history
    WHERE product_id = v_p1 AND source_price_list_id IS NOT NULL AND effective_date <= DATE '2099-10-31'
    ORDER BY effective_date DESC, created_at DESC LIMIT 1;
  SELECT COALESCE(pack_cost, unit_cost)::text INTO v_d2 FROM public.purchase_cost_history
    WHERE product_id = v_p1 AND source_price_list_id IS NOT NULL AND effective_date <= DATE '2099-11-15'
    ORDER BY effective_date DESC, created_at DESC LIMIT 1;
  SELECT COALESCE(pack_cost, unit_cost)::text INTO v_d3 FROM public.purchase_cost_history
    WHERE product_id = v_p1 AND source_price_list_id IS NOT NULL AND effective_date <= DATE '2099-11-30'
    ORDER BY effective_date DESC, created_at DESC LIMIT 1;
  SELECT COALESCE(pack_cost, unit_cost)::text INTO v_d4 FROM public.purchase_cost_history
    WHERE product_id = v_p1 AND source_price_list_id IS NOT NULL AND effective_date <= DATE '2099-12-01'
    ORDER BY effective_date DESC, created_at DESC LIMIT 1;
  v_res := v_res || jsonb_build_object('B-08', jsonb_build_object(
    'result', CASE WHEN v_d1 IS NULL AND v_d2 = '1464.0000' AND v_d3 = '1464.0000' AND v_d4 = '1520.0000' THEN 'PASS' ELSE 'FAIL' END,
    'detail', '10-31=' || COALESCE(v_d1, 'COST_NOT_FOUND') || ' 11-15=' || COALESCE(v_d2, 'null') ||
              ' 11-30=' || COALESCE(v_d3, 'null') || ' 12-01=' || COALESCE(v_d4, 'null')));

  RAISE EXCEPTION 'B2_VERIFY_RESULT %', v_res::text;
END
$verify$;
