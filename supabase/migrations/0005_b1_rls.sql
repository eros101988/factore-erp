-- Enable RLS
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_external_mappings ENABLE ROW LEVEL SECURITY;

-- import_batches: Admin all, Staff read-only
CREATE POLICY "Admin can do all on import_batches" ON import_batches FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin' AND is_active = true));
CREATE POLICY "Staff can view import_batches" ON import_batches FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'staff' AND is_active = true));

-- customers: Admin all, Staff read-only
CREATE POLICY "Admin can do all on customers" ON customers FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin' AND is_active = true));
CREATE POLICY "Staff can view customers" ON customers FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'staff' AND is_active = true));

-- historical_sales: Admin all, Staff read-only
CREATE POLICY "Admin can do all on historical_sales" ON historical_sales FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin' AND is_active = true));
CREATE POLICY "Staff can view historical_sales" ON historical_sales FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'staff' AND is_active = true));

-- historical_purchases: Admin all, Staff read-only
CREATE POLICY "Admin can do all on historical_purchases" ON historical_purchases FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin' AND is_active = true));
CREATE POLICY "Staff can view historical_purchases" ON historical_purchases FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'staff' AND is_active = true));

-- product_external_mappings: Admin all, Staff read-only
CREATE POLICY "Admin can do all on product_external_mappings" ON product_external_mappings FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin' AND is_active = true));
CREATE POLICY "Staff can view product_external_mappings" ON product_external_mappings FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'staff' AND is_active = true));
