-- T004 / contracts §B: B-01..B-04. Runs on Live ONLY at T015, never before migrations.
-- Forced rollback: the block ALWAYS ends with RAISE EXCEPTION 'B2_VERIFY_RESULT {json}', so nothing commits.
-- Each check also runs in its own sub-transaction that is rolled back ('B2_CHECK_DONE').
-- Identity: research R-4. __ADMIN_ID__ = existing test subject UUID (from test-subject.sql). No auth.users writes.
DO $verify$
DECLARE
  v_admin uuid := '__ADMIN_ID__';
  v_res jsonb := '{}'::jsonb;
  v_sup uuid; v_p1 uuid; v_p2 uuid; v_list uuid; v_item2 uuid;
  v_n int; v_m int; v_a int; v_ret int; v_msg text; v_status text;
BEGIN
  INSERT INTO public.suppliers (name) VALUES ('[TEST] B2 Rollout Supplier') RETURNING id INTO v_sup;
  INSERT INTO public.products (internal_sku, name, sales_unit, items_per_box)
    VALUES ('[TEST]-B2-001', '[TEST] Tape', '箱', 40) RETURNING id INTO v_p1;
  INSERT INTO public.products (internal_sku, name, sales_unit, items_per_box)
    VALUES ('[TEST]-B2-002', '[TEST] Bag', '箱', 100) RETURNING id INTO v_p2;

  -- B-01: one unmapped row blocks publish; nothing written
  BEGIN
    INSERT INTO public.supplier_price_lists (supplier_id, year, month, effective_from, source_filename, status)
      VALUES (v_sup, 2099, 1, DATE '2099-01-01', '[TEST]-fixture.pdf', 'needs_review') RETURNING id INTO v_list;
    INSERT INTO public.supplier_price_list_items
      (price_list_id, supplier_sku, unit_cost, pack_qty, purchase_unit, calculated_pack_cost, mapping_status, mapped_product_id, row_status)
      VALUES (v_list, 'TEST-KA-T91N', 36.6, 40, 'ROLL', 1464, 'confirmed', v_p1, 'valid'),
             (v_list, 'TEST-NEW', 5, 10, 'PCS', 50, 'unmapped', NULL, 'valid');
    v_msg := 'NOT REFUSED';
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.publish_supplier_price_list(v_list);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_n FROM public.purchase_cost_history WHERE source_price_list_id = v_list;
    v_res := v_res || jsonb_build_object('B-01', jsonb_build_object(
      'result', CASE WHEN v_msg LIKE 'PUBLISH_BLOCKED: 1 unmapped%' AND v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
      'detail', v_msg || ' | cost_rows=' || v_n));
    RAISE EXCEPTION 'B2_CHECK_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'B2_CHECK_DONE' THEN
      v_res := v_res || jsonb_build_object('B-01', jsonb_build_object('result', 'FAIL', 'detail', 'unexpected: ' || SQLERRM));
    END IF;
  END;
  EXECUTE 'RESET ROLE';

  -- B-02: invalid-cost / error row blocks publish; nothing written
  BEGIN
    INSERT INTO public.supplier_price_lists (supplier_id, year, month, effective_from, source_filename, status)
      VALUES (v_sup, 2099, 2, DATE '2099-02-01', '[TEST]-fixture.pdf', 'needs_review') RETURNING id INTO v_list;
    INSERT INTO public.supplier_price_list_items
      (price_list_id, supplier_sku, unit_cost, pack_qty, purchase_unit, calculated_pack_cost, mapping_status, mapped_product_id, row_status)
      VALUES (v_list, 'TEST-KA-T91N', 36.6, 40, 'ROLL', 1464, 'confirmed', v_p1, 'valid'),
             (v_list, 'TEST-KA-X99', NULL, 10, 'BOX', NULL, 'confirmed', v_p2, 'error');
    v_msg := 'NOT REFUSED';
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.publish_supplier_price_list(v_list);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_n FROM public.purchase_cost_history WHERE source_price_list_id = v_list;
    v_res := v_res || jsonb_build_object('B-02', jsonb_build_object(
      'result', CASE WHEN v_msg LIKE 'PUBLISH_BLOCKED: 0 unmapped, 1 invalid cost, 1 error rows%' AND v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
      'detail', v_msg || ' | cost_rows=' || v_n));
    RAISE EXCEPTION 'B2_CHECK_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'B2_CHECK_DONE' THEN
      v_res := v_res || jsonb_build_object('B-02', jsonb_build_object('result', 'FAIL', 'detail', 'unexpected: ' || SQLERRM));
    END IF;
  END;
  EXECUTE 'RESET ROLE';

  -- B-03: explicitly ignored error row + 1 valid row -> publishes exactly 1 row
  BEGIN
    INSERT INTO public.supplier_price_lists (supplier_id, year, month, effective_from, source_filename, status)
      VALUES (v_sup, 2099, 3, DATE '2099-03-01', '[TEST]-fixture.pdf', 'needs_review') RETURNING id INTO v_list;
    INSERT INTO public.supplier_price_list_items
      (price_list_id, supplier_sku, unit_cost, pack_qty, purchase_unit, calculated_pack_cost, mapping_status, mapped_product_id, row_status)
      VALUES (v_list, 'TEST-KA-T91N', 36.6, 40, 'ROLL', 1464, 'confirmed', v_p1, 'valid'),
             (v_list, 'TEST-KA-X99', NULL, 10, 'BOX', NULL, 'unmapped', NULL, 'ignored');
    v_msg := NULL; v_ret := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      v_ret := public.publish_supplier_price_list(v_list);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_n FROM public.purchase_cost_history WHERE source_price_list_id = v_list;
    v_res := v_res || jsonb_build_object('B-03', jsonb_build_object(
      'result', CASE WHEN v_msg IS NULL AND v_ret = 1 AND v_n = 1 THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'returned=' || COALESCE(v_ret::text, 'null') || ' cost_rows=' || v_n || COALESCE(' err=' || v_msg, '')));
    RAISE EXCEPTION 'B2_CHECK_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'B2_CHECK_DONE' THEN
      v_res := v_res || jsonb_build_object('B-03', jsonb_build_object('result', 'FAIL', 'detail', 'unexpected: ' || SQLERRM));
    END IF;
  END;
  EXECUTE 'RESET ROLE';

  -- B-04: mid-publish failure (unique violation on item 2) -> nothing from the attempt remains
  BEGIN
    INSERT INTO public.supplier_price_lists (supplier_id, year, month, effective_from, source_filename, status)
      VALUES (v_sup, 2099, 4, DATE '2099-04-01', '[TEST]-fixture.pdf', 'needs_review') RETURNING id INTO v_list;
    INSERT INTO public.supplier_price_list_items
      (price_list_id, supplier_sku, unit_cost, pack_qty, purchase_unit, calculated_pack_cost, mapping_status, mapped_product_id, row_status)
      VALUES (v_list, 'TEST-KA-T91N', 36.6, 40, 'ROLL', 1464, 'confirmed', v_p1, 'valid');
    INSERT INTO public.supplier_price_list_items
      (price_list_id, supplier_sku, unit_cost, pack_qty, purchase_unit, calculated_pack_cost, mapping_status, mapped_product_id, row_status)
      VALUES (v_list, 'TEST-KA-B20', 1.25, 100, 'PCS', 125, 'confirmed', v_p2, 'valid') RETURNING id INTO v_item2;
    INSERT INTO public.purchase_cost_history (product_id, unit_cost, effective_date, external_supplier_sku, source_price_list_item_id)
      VALUES (v_p2, 1, DATE '2099-04-01', 'TEST-PRESEED', v_item2);
    v_msg := 'NOT REFUSED';
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.publish_supplier_price_list(v_list);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_n FROM public.purchase_cost_history WHERE source_price_list_id = v_list;
    SELECT count(*) INTO v_m FROM public.product_external_mappings WHERE external_code LIKE 'TEST-%';
    SELECT count(*) INTO v_a FROM public.audit_logs WHERE record_id = v_list;
    SELECT status INTO v_status FROM public.supplier_price_lists WHERE id = v_list;
    v_res := v_res || jsonb_build_object('B-04', jsonb_build_object(
      'result', CASE WHEN v_msg <> 'NOT REFUSED' AND v_n = 0 AND v_m = 0 AND v_a = 0 AND v_status = 'needs_review'
                     THEN 'PASS' ELSE 'FAIL' END,
      'detail', v_msg || ' | cost_rows=' || v_n || ' mappings=' || v_m || ' audit=' || v_a || ' status=' || v_status));
    RAISE EXCEPTION 'B2_CHECK_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'B2_CHECK_DONE' THEN
      v_res := v_res || jsonb_build_object('B-04', jsonb_build_object('result', 'FAIL', 'detail', 'unexpected: ' || SQLERRM));
    END IF;
  END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'B2_VERIFY_RESULT %', v_res::text;
END
$verify$;
