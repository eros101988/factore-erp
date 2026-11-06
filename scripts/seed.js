const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function seed() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use SUPABASE_SECRET_KEY as preferred, fallback to SUPABASE_SERVICE_ROLE_KEY for legacy compatibility
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.log('Skipping seed: No Supabase Secret Key found in .env.local');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey);

  console.log('Seeding Demo Data...');

  // 1. Clear Demo Data (Careful with this in production!)
  // We identify demo data by a specific prefix or we just truncate if it's a fresh DB.
  // For safety, let's just insert if not exists.

  // Products
  const products = [
    { internal_sku: 'DEMO-001', name: '[TEST] 測試垃圾袋', specification: '91×110', sales_unit: '箱', items_per_box: 40 },
    { internal_sku: 'DEMO-002', name: '[TEST] 測試手套', specification: 'M號 100雙', sales_unit: '箱', items_per_box: 10 },
    { internal_sku: 'DEMO-003', name: '[TEST] 測試耐熱袋', specification: '半斤', sales_unit: '包', items_per_box: 1 }
  ];

  const { data: insertedProducts, error: pError } = await supabase
    .from('products')
    .upsert(products, { onConflict: 'internal_sku' })
    .select('id, internal_sku');
  
  if (pError) throw pError;
  const productMap = new Map(insertedProducts.map(p => [p.internal_sku, p.id]));

  // Costs
  const costs = [
    { product_id: productMap.get('DEMO-001'), unit_cost: 1400.0, effective_date: '2026-10-01' },
    { product_id: productMap.get('DEMO-001'), unit_cost: 1464.0, effective_date: '2026-11-01' },
    { product_id: productMap.get('DEMO-002'), unit_cost: 850.0, effective_date: '2026-10-15' },
    { product_id: productMap.get('DEMO-003'), unit_cost: 45.5, effective_date: '2026-11-05' }
  ];

  // We can just insert, but it might duplicate if run multiple times. That's fine for cost history for demo.
  await supabase.from('purchase_cost_history').insert(costs);

  // Channels
  const channels = [
    { name: '一般現場' },
    { name: 'Shopee Demo (TEST)' }
  ];
  
  const { data: insertedChannels } = await supabase.from('sales_channels').upsert(channels, { onConflict: 'name' }).select('id, name');
  const channelMap = new Map(insertedChannels.map(c => [c.name, c.id]));

  // Channel Fees
  await supabase.from('channel_fee_rules').insert([
    { channel_id: channelMap.get('Shopee Demo (TEST)'), fee_percentage: 0.085, effective_date: '2026-01-01' }
  ]);

  // Tiers
  const tiers = [
    { tier_name: '大盤', default_margin: 0.15 },
    { tier_name: '中盤', default_margin: 0.20 },
    { tier_name: '小盤', default_margin: 0.25 }
  ];
  
  await supabase.from('tier_policies').upsert(tiers, { onConflict: 'tier_name' });

  // System Settings
  const settings = [
    { setting_key: 'tax_rate', setting_value: { rate: 0.05 } },
    { setting_key: 'price_rounding_mode', setting_value: { mode: '1' } }
  ];

  await supabase.from('system_settings').upsert(settings, { onConflict: 'setting_key' });

  console.log('Demo Data Seeded Successfully!');
}

seed().catch(console.error);
