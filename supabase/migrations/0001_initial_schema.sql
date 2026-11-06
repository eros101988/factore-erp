-- 1. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 2. Products (商品基本資料)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internal_sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    specification TEXT,
    sales_unit VARCHAR(50) NOT NULL,
    items_per_box INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 3. Supplier Product Mappings
CREATE TABLE IF NOT EXISTS supplier_product_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    product_id UUID REFERENCES products(id),
    supplier_sku VARCHAR(100) NOT NULL,
    conversion_ratio DECIMAL(10,4) DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(supplier_id, product_id)
);

-- 4. Purchase Cost History
CREATE TABLE IF NOT EXISTS purchase_cost_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    unit_cost DECIMAL(15,4) NOT NULL,
    tax_type VARCHAR(20) DEFAULT 'untaxed',
    effective_date DATE NOT NULL,
    source_document VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 5. Tier Policies (三級 Default Margin)
CREATE TABLE IF NOT EXISTS tier_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name VARCHAR(50) UNIQUE NOT NULL, -- e.g., large, medium, small
    threshold_amount DECIMAL(15,2),
    default_margin DECIMAL(5,4), -- 0.0000 to 1.0000
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 6. Sales Channels
CREATE TABLE IF NOT EXISTS sales_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 7. Channel Fee Rules
CREATE TABLE IF NOT EXISTS channel_fee_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES sales_channels(id),
    fee_percentage DECIMAL(5,4) DEFAULT 0,
    fixed_fee DECIMAL(10,2) DEFAULT 0,
    fee_basis VARCHAR(50) DEFAULT 'untaxed_sales',
    effective_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 8. Quotes (報價 Header)
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(255),
    channel_id UUID REFERENCES sales_channels(id),
    tier_name VARCHAR(50),
    status VARCHAR(50) DEFAULT 'draft',
    total_untaxed DECIMAL(15,2) DEFAULT 0,
    total_tax DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 9. Quote Items (報價 Snapshot Items)
CREATE TABLE IF NOT EXISTS quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    -- Snapshots
    internal_sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    specification TEXT,
    unit VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(15,4) NOT NULL,
    effective_cost_date DATE,
    fixed_cost DECIMAL(15,2) DEFAULT 0,
    channel_fee_rate DECIMAL(5,4) DEFAULT 0,
    target_margin DECIMAL(5,4) DEFAULT 0,
    unit_price DECIMAL(15,2) NOT NULL,
    subtotal DECIMAL(15,2) NOT NULL,
    tax_rate DECIMAL(5,4) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 10. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 11. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
