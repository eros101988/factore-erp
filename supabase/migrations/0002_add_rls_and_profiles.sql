-- 1. User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users can read own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;
CREATE POLICY "Admins can read all profiles"
    ON user_profiles FOR SELECT
    USING (
      auth.uid() IN (
        SELECT id FROM user_profiles WHERE role = 'admin'
      )
    );

DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;
CREATE POLICY "Admins can update all profiles"
    ON user_profiles FOR UPDATE
    USING (
      auth.uid() IN (
        SELECT id FROM user_profiles WHERE role = 'admin'
      )
    );

-- 2. Add new columns to existing tables safely
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='legacy_erp_id') THEN
    ALTER TABLE products ADD COLUMN legacy_erp_id VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='pricing_version') THEN
    ALTER TABLE quotes ADD COLUMN pricing_version VARCHAR(20) DEFAULT 'v1';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='created_by') THEN
    ALTER TABLE quotes ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- 3. Enable RLS on all existing tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Helper function to check if user is admin (SET search_path for security)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

-- Helper function to check if user is staff or admin (SET search_path for security)
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_active = true
  );
$$;

-- Suppliers (Admin: ALL, Staff: SELECT)
DROP POLICY IF EXISTS "Suppliers: Active users can read" ON suppliers;
CREATE POLICY "Suppliers: Active users can read" ON suppliers FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "Suppliers: Admins can modify" ON suppliers;
CREATE POLICY "Suppliers: Admins can modify" ON suppliers FOR ALL USING (is_admin());

-- Products (Admin: ALL, Staff: SELECT)
DROP POLICY IF EXISTS "Products: Active users can read" ON products;
CREATE POLICY "Products: Active users can read" ON products FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "Products: Admins can modify" ON products;
CREATE POLICY "Products: Admins can modify" ON products FOR ALL USING (is_admin());

-- Supplier Product Mappings (Admin: ALL, Staff: SELECT)
DROP POLICY IF EXISTS "Supplier Mappings: Active users can read" ON supplier_product_mappings;
CREATE POLICY "Supplier Mappings: Active users can read" ON supplier_product_mappings FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "Supplier Mappings: Admins can modify" ON supplier_product_mappings;
CREATE POLICY "Supplier Mappings: Admins can modify" ON supplier_product_mappings FOR ALL USING (is_admin());

-- Purchase Cost History (Admin: ALL, Staff: SELECT)
DROP POLICY IF EXISTS "Cost History: Active users can read" ON purchase_cost_history;
CREATE POLICY "Cost History: Active users can read" ON purchase_cost_history FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "Cost History: Admins can modify" ON purchase_cost_history;
CREATE POLICY "Cost History: Admins can modify" ON purchase_cost_history FOR ALL USING (is_admin());

-- Tier Policies (Admin: ALL, Staff: SELECT)
DROP POLICY IF EXISTS "Tier Policies: Active users can read" ON tier_policies;
CREATE POLICY "Tier Policies: Active users can read" ON tier_policies FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "Tier Policies: Admins can modify" ON tier_policies;
CREATE POLICY "Tier Policies: Admins can modify" ON tier_policies FOR ALL USING (is_admin());

-- Sales Channels (Admin: ALL, Staff: SELECT)
DROP POLICY IF EXISTS "Sales Channels: Active users can read" ON sales_channels;
CREATE POLICY "Sales Channels: Active users can read" ON sales_channels FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "Sales Channels: Admins can modify" ON sales_channels;
CREATE POLICY "Sales Channels: Admins can modify" ON sales_channels FOR ALL USING (is_admin());

-- Channel Fee Rules (Admin: ALL, Staff: SELECT)
DROP POLICY IF EXISTS "Channel Fees: Active users can read" ON channel_fee_rules;
CREATE POLICY "Channel Fees: Active users can read" ON channel_fee_rules FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "Channel Fees: Admins can modify" ON channel_fee_rules;
CREATE POLICY "Channel Fees: Admins can modify" ON channel_fee_rules FOR ALL USING (is_admin());

-- Quotes (Admin: ALL, Staff: SELECT own / INSERT)
-- Assuming quotes doesn't have a user_id yet, let's add it (handled above).

DROP POLICY IF EXISTS "Quotes: Admins can read all" ON quotes;
CREATE POLICY "Quotes: Admins can read all" ON quotes FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "Quotes: Staff can read own" ON quotes;
CREATE POLICY "Quotes: Staff can read own" ON quotes FOR SELECT USING (is_active_user() AND created_by = auth.uid());
DROP POLICY IF EXISTS "Quotes: Active users can insert" ON quotes;
CREATE POLICY "Quotes: Active users can insert" ON quotes FOR INSERT WITH CHECK (is_active_user());
DROP POLICY IF EXISTS "Quotes: Admins can update" ON quotes;
CREATE POLICY "Quotes: Admins can update" ON quotes FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "Quotes: Admins can delete" ON quotes;
CREATE POLICY "Quotes: Admins can delete" ON quotes FOR DELETE USING (is_admin());

-- Quote Items (Follow Quotes)
DROP POLICY IF EXISTS "Quote Items: Admins can read all" ON quote_items;
CREATE POLICY "Quote Items: Admins can read all" ON quote_items FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "Quote Items: Staff can read own" ON quote_items;
CREATE POLICY "Quote Items: Staff can read own" ON quote_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid())
);
DROP POLICY IF EXISTS "Quote Items: Active users can insert" ON quote_items;
CREATE POLICY "Quote Items: Active users can insert" ON quote_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id AND quotes.created_by = auth.uid())
);
DROP POLICY IF EXISTS "Quote Items: Admins can update/delete" ON quote_items;
CREATE POLICY "Quote Items: Admins can update/delete" ON quote_items FOR ALL USING (is_admin());

-- System Settings (Admin: ALL, Staff: SELECT)
DROP POLICY IF EXISTS "Settings: Active users can read" ON system_settings;
CREATE POLICY "Settings: Active users can read" ON system_settings FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "Settings: Admins can modify" ON system_settings;
CREATE POLICY "Settings: Admins can modify" ON system_settings FOR ALL USING (is_admin());

-- Audit Logs (Admin: ALL, Staff: INSERT only for their actions)
DROP POLICY IF EXISTS "Audit Logs: Admins can read all" ON audit_logs;
CREATE POLICY "Audit Logs: Admins can read all" ON audit_logs FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "Audit Logs: Active users can insert" ON audit_logs;
CREATE POLICY "Audit Logs: Active users can insert" ON audit_logs FOR INSERT WITH CHECK (is_active_user() AND user_id = auth.uid());
