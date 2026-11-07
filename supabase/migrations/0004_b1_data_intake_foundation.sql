-- 1. Import Batches
CREATE TABLE IF NOT EXISTS import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system VARCHAR(100) NOT NULL,
    import_type VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'uploaded',
    row_count INTEGER DEFAULT 0,
    valid_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    raw_data JSONB,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    confirmed_at TIMESTAMP WITH TIME ZONE
);

-- 2. Customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_customer_code VARCHAR(100) UNIQUE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50),
    phone VARCHAR(100),
    address TEXT,
    salesperson VARCHAR(100),
    payment_terms VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 3. Historical Sales
CREATE TABLE IF NOT EXISTS historical_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_date DATE NOT NULL,
    sale_number VARCHAR(100) NOT NULL,
    customer_code VARCHAR(100) NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    quantity DECIMAL(15,4) NOT NULL,
    unit_price DECIMAL(15,4) NOT NULL,
    subtotal DECIMAL(15,2),
    discount DECIMAL(15,2) DEFAULT 0,
    tax DECIMAL(15,2) DEFAULT 0,
    total DECIMAL(15,2),
    import_batch_id UUID REFERENCES import_batches(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(sale_number, product_code)
);

-- 4. Historical Purchases
CREATE TABLE IF NOT EXISTS historical_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_date DATE NOT NULL,
    purchase_number VARCHAR(100) NOT NULL,
    supplier_code VARCHAR(100) NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    quantity DECIMAL(15,4) NOT NULL,
    unit_cost DECIMAL(15,4) NOT NULL,
    subtotal DECIMAL(15,2),
    import_batch_id UUID REFERENCES import_batches(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(purchase_number, product_code)
);

-- 5. Product External Mappings
CREATE TABLE IF NOT EXISTS product_external_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    source_type VARCHAR(100) NOT NULL,
    external_code VARCHAR(100) NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),
    confidence DECIMAL(5,4),
    status VARCHAR(50) DEFAULT 'suggested',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(source_type, external_code)
);

-- 6. Alter Existing Tables
ALTER TABLE products ADD COLUMN IF NOT EXISTS legacy_erp_id VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS external_supplier_code VARCHAR(100) UNIQUE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE purchase_cost_history ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE purchase_cost_history ADD COLUMN IF NOT EXISTS external_supplier_sku VARCHAR(100);
ALTER TABLE purchase_cost_history ADD COLUMN IF NOT EXISTS source_import_batch_id UUID REFERENCES import_batches(id);
ALTER TABLE purchase_cost_history ADD COLUMN IF NOT EXISTS cost_unit VARCHAR(50);
ALTER TABLE purchase_cost_history ADD COLUMN IF NOT EXISTS pack_qty INTEGER;
