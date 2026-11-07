-- Staging Architecture
CREATE TABLE IF NOT EXISTS import_staging_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    raw_data JSONB NOT NULL,
    normalized_data JSONB,
    validation_status VARCHAR(50) DEFAULT 'pending', -- pending, valid, error, warning
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

ALTER TABLE import_staging_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on import_staging_rows" ON import_staging_rows FOR ALL TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin' AND is_active = true));
CREATE POLICY "Staff can view import_staging_rows" ON import_staging_rows FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'staff' AND is_active = true));
