-- T004 / contracts §B: B-09a, B-09b, B-10, B-11, B-12. Runs on Live ONLY at T015.
-- Forced rollback: always ends with RAISE EXCEPTION 'B2_VERIFY_RESULT {json}'. Identity: research R-4.
-- Staff = the test subject with role flipped to 'staff' INSIDE a rolled-back sub-transaction. No auth.users writes.
DO $verify$
DECLARE
  v_admin uuid := '__ADMIN_ID__';
  v_ghost uuid := gen_random_uuid();   -- synthetic non-member, has no profile
  v_res jsonb := '{}'::jsonb;
  v_sup uuid; v_p1 uuid; v_p2 uuid; v_list uuid;
  v_msg text; v_msg2 text; v_n int; v_open int; v_closed_before int; v_closed_after int; v_def text; v_bad_tiers int;
  v_b1_before int; v_b1_after int; v_p2_cost text;
BEGIN
  INSERT INTO public.suppliers (name) VALUES ('[TEST] B2 Rollout Supplier') RETURNING id INTO v_sup;
  INSERT INTO public.products (internal_sku, name, sales_unit, items_per_box)
    VALUES ('[TEST]-B2-001', '[TEST] Tape', '箱', 40) RETURNING id INTO v_p1;
  INSERT INTO public.products (internal_sku, name, sales_unit, items_per_box)
    VALUES ('[TEST]-B2-002', '[TEST] Bag', '箱', 100) RETURNING id INTO v_p2;
  INSERT INTO public.supplier_price_lists (supplier_id, year, month, effective_from, source_filename, status)
    VALUES (v_sup, 2099, 5, DATE '2099-05-01', '[TEST]-fixture.pdf', 'ready') RETURNING id INTO v_list;
  INSERT INTO public.supplier_price_list_items
    (price_list_id, supplier_sku, unit_cost, pack_qty, purchase_unit, calculated_pack_cost, mapping_status, mapped_product_id, row_status)
    VALUES (v_list, 'TEST-KA-T91N', 36.6, 40, 'ROLL', 1464, 'confirmed', v_p1, 'valid');

  -- B-09a: non-member (synthetic UUID, no profile) is refused publish and policy change (fail closed)
  v_msg := 'NOT REFUSED'; v_msg2 := 'NOT REFUSED';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ghost, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_ghost::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.publish_supplier_price_list(v_list);
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ghost, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_ghost::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.set_pricing_policy('medium', 0.21, NULL);
  EXCEPTION WHEN OTHERS THEN v_msg2 := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  v_res := v_res || jsonb_build_object('B-09a', jsonb_build_object(
    'result', CASE WHEN v_msg LIKE '%Only active admins%' AND v_msg2 LIKE '%Only active admins%' THEN 'PASS' ELSE 'FAIL' END,
    'detail', 'publish: ' || v_msg || ' | policy: ' || v_msg2));

  -- B-09b + B-11 (staff): test subject flipped to staff inside a rolled-back sub-transaction
  BEGIN
    UPDATE public.user_profiles SET role = 'staff' WHERE id = v_admin;
    v_msg := 'NOT REFUSED'; v_msg2 := 'NOT REFUSED';
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.publish_supplier_price_list(v_list);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.set_pricing_policy('medium', 0.21, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg2 := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    v_res := v_res || jsonb_build_object('B-09b', jsonb_build_object(
      'result', CASE WHEN v_msg LIKE '%Only active admins%' AND v_msg2 LIKE '%Only active admins%' THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'publish: ' || v_msg || ' | policy: ' || v_msg2));

    -- B-11 staff: can read new tables, cannot write (read and write each captured separately)
    v_n := NULL; v_msg := 'NOT REFUSED'; v_msg2 := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*) INTO v_n FROM public.pricing_policies;
    EXCEPTION WHEN OTHERS THEN v_msg2 := SQLERRM;
    END;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      INSERT INTO public.supplier_price_lists (supplier_id, year, month, effective_from, source_filename)
        VALUES (v_sup, 2099, 6, DATE '2099-06-01', '[TEST]-staff-write.pdf');
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    v_res := v_res || jsonb_build_object('B-11-staff', jsonb_build_object(
      'result', CASE WHEN v_msg2 IS NULL AND v_n >= 3 AND v_msg <> 'NOT REFUSED' AND v_msg NOT LIKE '%infinite recursion%'
                     THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'staff read: ' || COALESCE('rows=' || v_n, 'ERROR ' || v_msg2) || ' | staff insert: ' || v_msg));
    RAISE EXCEPTION 'B2_CHECK_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'B2_CHECK_DONE' THEN
      v_res := v_res || jsonb_build_object('B-09b', jsonb_build_object('result', 'FAIL', 'detail', 'unexpected: ' || SQLERRM));
    END IF;
  END;
  EXECUTE 'RESET ROLE';

  -- B-11 anon: sees nothing in the new tables (0 rows or permission denied)
  v_n := NULL; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT (SELECT count(*) FROM public.pricing_policies) + (SELECT count(*) FROM public.supplier_price_lists)
         + (SELECT count(*) FROM public.supplier_price_list_items) INTO v_n;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  v_res := v_res || jsonb_build_object('B-11-anon', jsonb_build_object(
    'result', CASE WHEN v_n = 0 OR v_msg LIKE '%permission denied%' THEN 'PASS' ELSE 'FAIL' END,
    'detail', COALESCE('anon rows=' || v_n, 'anon: ' || v_msg)));

  -- B-10: admin policy change creates a new version; exactly one open row per tier
  BEGIN
    SELECT count(*) INTO v_closed_before FROM public.pricing_policies WHERE tier = 'medium' AND NOT is_active;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.set_pricing_policy('medium', 0.2100, NULL);
    EXECUTE 'RESET ROLE';
    SELECT count(*), max(default_margin::text) INTO v_open, v_def
      FROM public.pricing_policies WHERE tier = 'medium' AND is_active AND effective_to IS NULL;
    SELECT count(*) INTO v_closed_after FROM public.pricing_policies WHERE tier = 'medium' AND NOT is_active;
    SELECT count(*) INTO v_bad_tiers FROM (SELECT tier FROM public.pricing_policies WHERE is_active AND effective_to IS NULL
                                           GROUP BY tier HAVING count(*) <> 1) t;
    v_res := v_res || jsonb_build_object('B-10', jsonb_build_object(
      'result', CASE WHEN v_open = 1 AND v_def = '0.2100' AND v_closed_after = v_closed_before + 1 AND v_bad_tiers = 0
                     THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'open_medium=' || v_open || ' default=' || COALESCE(v_def, 'null') ||
                ' closed ' || v_closed_before || '->' || v_closed_after || ' tiers_not_one_open=' || v_bad_tiers));
    RAISE EXCEPTION 'B2_CHECK_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'B2_CHECK_DONE' THEN
      v_res := v_res || jsonb_build_object('B-10', jsonb_build_object('result', 'FAIL', 'detail', 'unexpected: ' || SQLERRM));
    END IF;
  END;
  EXECUTE 'RESET ROLE';

  -- B-12: B1-style cost rows (no source_price_list_id) are untouched by publish and never an effective cost
  BEGIN
    INSERT INTO public.purchase_cost_history (product_id, unit_cost, effective_date, external_supplier_sku)
      VALUES (v_p2, 10, DATE '2099-06-01', 'TEST-B1-ROW');
    SELECT count(*) INTO v_b1_before FROM public.purchase_cost_history WHERE source_price_list_id IS NULL;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.publish_supplier_price_list(v_list);
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_b1_after FROM public.purchase_cost_history WHERE source_price_list_id IS NULL;
    SELECT COALESCE(pack_cost, unit_cost)::text INTO v_p2_cost FROM public.purchase_cost_history
      WHERE product_id = v_p2 AND source_price_list_id IS NOT NULL AND effective_date <= DATE '2099-12-31'
      ORDER BY effective_date DESC, created_at DESC LIMIT 1;
    v_res := v_res || jsonb_build_object('B-12', jsonb_build_object(
      'result', CASE WHEN v_b1_after = v_b1_before AND v_p2_cost IS NULL THEN 'PASS' ELSE 'FAIL' END,
      'detail', 'b1_rows ' || v_b1_before || '->' || v_b1_after || ' p2_effective=' || COALESCE(v_p2_cost, 'COST_NOT_FOUND')));
    RAISE EXCEPTION 'B2_CHECK_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'B2_CHECK_DONE' THEN
      v_res := v_res || jsonb_build_object('B-12', jsonb_build_object('result', 'FAIL', 'detail', 'unexpected: ' || SQLERRM));
    END IF;
  END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'B2_VERIFY_RESULT %', v_res::text;
END
$verify$;
