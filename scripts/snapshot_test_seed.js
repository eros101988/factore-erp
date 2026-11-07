require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching Live DEMO Product...');
  
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('internal_sku', 'E2E-LIVE-001')
    .single();

  if (productError || !product) {
    console.error('Error fetching product:', productError);
    process.exit(1);
  }
  
  console.log('Product found:', product.id);

  // Add New Cost History
  console.log('Adding new Cost History (120)...');
  const { data: cost, error: costError } = await supabase
    .from('purchase_cost_history')
    .insert({
      product_id: product.id,
      unit_cost: 120,
      effective_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
      tax_type: 'untaxed'
    })
    .select()
    .single();

  if (costError) {
    console.error('Error creating new cost:', costError);
    process.exit(1);
  }
  
  console.log('New Cost created:', cost.id);
  console.log('Snapshot Test DEMO data seeded successfully.');
}

run();