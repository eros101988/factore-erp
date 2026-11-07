-- 1. Pricing Policies
CREATE TABLE IF NOT EXISTS pricing_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier VARCHAR(50) UNIQUE NOT NULL, -- small, medium, large
    default_margin DECIMAL(5,4) NOT NULL,
    minimum_margin DECIMAL(5,4),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 2. Supplier Price Lists
CREATE TABLE IF NOT EXISTS supplier_price_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id) NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    source_type VARCHAR(50) DEFAULT 'pdf',
    source_filename VARCHAR(255),
    source_file_url TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- draft, parsed, needs_review, ready, published, rejected
    notes TEXT,
    uploaded_by UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    published_by UUID,
    published_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(supplier_id, year, month)
);

-- 3. Supplier Price List Items
CREATE TABLE IF NOT EXISTS supplier_price_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id UUID REFERENCES supplier_price_lists(id) ON DELETE CASCADE,
    supplier_sku VARCHAR(100) NOT NULL,
    supplier_product_name VARCHAR(255),
    specification TEXT,
    color VARCHAR(100),
    pack_qty INTEGER,
    purchase_unit VARCHAR(50),
    unit_cost DECIMAL(15,4) NOT NULL,
    calculated_pack_cost DECIMAL(15,4),
    raw_data JSONB,
    mapping_status VARCHAR(50) DEFAULT 'suggested', -- suggested, confirmed, rejected, unmapped
    mapped_product_id UUID REFERENCES products(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Note: product_external_mappings was already created in B1. We'll reuse it.
-- Add constraint if needed or just use it as is.

-- 4. Alter Purchase Cost History to link to Price Lists
ALTER TABLE purchase_cost_history ADD COLUMN IF NOT EXISTS source_price_list_id UUID REFERENCES supplier_price_lists(id);
ALTER TABLE purchase_cost_history ADD COLUMN IF NOT EXISTS source_price_list_item_id UUID REFERENCES supplier_price_list_items(id);
ALTER TABLE purchase_cost_history ADD COLUMN IF NOT EXISTS pack_cost DECIMAL(15,4);

-- 5. Alter Quotes to save Pricing Policy Info
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pricing_policy_id UUID REFERENCES pricing_policies(id);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS supplier_sku VARCHAR(100);
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS cost_source_type VARCHAR(50); -- e.g., 'supplier_price_list'
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS cost_source_id UUID;

-- 6. Initial Default Pricing Policies (if not exists)
INSERT INTO pricing_policies (tier, default_margin, created_at)
VALUES 
    ('small', 0.2500, now()),
    ('medium', 0.2000, now()),
    ('large', 0.1500, now())
ON CONFLICT (tier) DO NOTHING;

-- 7. RLS Policies
ALTER TABLE pricing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_price_list_items ENABLE ROW LEVEL SECURITY;

-- Pricing Policies
CREATE POLICY "Admin can do all on pricing_policies" ON pricing_policies FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin' AND is_active = true));
CREATE POLICY "Staff can view pricing_policies" ON pricing_policies FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'staff' AND is_active = true));

-- Supplier Price Lists
CREATE POLICY "Admin can do all on supplier_price_lists" ON supplier_price_lists FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin' AND is_active = true));
CREATE POLICY "Staff can view supplier_price_lists" ON supplier_price_lists FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'staff' AND is_active = true));

-- Supplier Price List Items
CREATE POLICY "Admin can do all on supplier_price_list_items" ON supplier_price_list_items FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin' AND is_active = true));
CREATE POLICY "Staff can view supplier_price_list_items" ON supplier_price_list_items FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'staff' AND is_active = true));