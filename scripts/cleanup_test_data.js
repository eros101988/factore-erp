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
  console.log('Cleaning up Live DEMO Product and related data...');
  
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('internal_sku', 'E2E-LIVE-001')
    .single();

  if (product) {
    // Find all quotes that contain this product
    const { data: quoteItems } = await supabase
      .from('quote_items')
      .select('quote_id')
      .eq('product_id', product.id);
      
    const quoteIds = [...new Set((quoteItems || []).map(qi => qi.quote_id))];

    // Delete quote_items first (they reference product_id)
    console.log('Deleting quote items for product...');
    await supabase.from('quote_items').delete().eq('product_id', product.id);
    
    // Delete quotes that are now empty (if we created any in this test)
    if (quoteIds.length > 0) {
      console.log('Deleting parent quotes...');
      await supabase.from('quotes').delete().in('id', quoteIds);
    }
    
    // Delete cost history
    console.log('Deleting cost history for product...');
    await supabase.from('purchase_cost_history').delete().eq('product_id', product.id);
    
    // Finally delete product
    console.log('Deleting product...');
    await supabase.from('products').delete().eq('id', product.id);
    console.log('Cleanup complete.');
  } else {
    console.log('Product E2E-LIVE-001 not found. Nothing to clean up.');
  }
}

run();