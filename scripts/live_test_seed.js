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
  console.log('Creating Live DEMO Product...');
  
  // Create Product
  const { data: product, error: productError } = await supabase
    .from('products')
    .insert({
      internal_sku: 'E2E-LIVE-001',
      name: '[TEST] Live Persistence Product',
      sales_unit: '箱',
      is_active: true
    })
    .select()
    .single();

  if (productError) {
    if (productError.code === '23505') {
       console.log('Product E2E-LIVE-001 already exists, skipping creation.');
    } else {
       console.error('Error creating product:', productError);
       process.exit(1);
    }
  } else {
    console.log('Product created:', product.id);

    // Create Cost History
    const { data: cost, error: costError } = await supabase
      .from('purchase_cost_history')
      .insert({
        product_id: product.id,
        unit_cost: 100,
        effective_date: new Date().toISOString().split('T')[0],
        tax_type: 'untaxed'
      })
      .select()
      .single();

    if (costError) {
      console.error('Error creating cost:', costError);
      process.exit(1);
    }
    
    console.log('Initial Cost created:', cost.id);
  }
  
  console.log('Live DEMO data seeded successfully.');
}

run();