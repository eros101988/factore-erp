import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { Product, CostHistory, Quote, DEMO_PRODUCTS, DEMO_COST_HISTORY, DEMO_TIERS, DEMO_CHANNELS, DEMO_CHANNEL_FEES, DEMO_QUOTES } from '@/lib/data/demo';
import { Decimal } from 'decimal.js';

// Check if we have Supabase connected
export const isSupabaseConfigured = () => {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321';
};

const enforceConfigInProduction = () => {
  if (process.env.NODE_ENV === 'production' && !isSupabaseConfigured()) {
    throw new Error('Supabase configuration is missing. DEMO fallback is disabled in Production.');
  }
};

// We need to use the server client for server components/actions
const getSupabaseClient = async () => {
  if (typeof window === 'undefined') {
    return await createServerClient();
  }
  return createBrowserClient();
};

export class ProductRepository {
  static async getProducts(): Promise<Product[]> {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) {
      return DEMO_PRODUCTS;
    }
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('products').select('*').eq('is_active', true);
    if (error) throw error;
    return data as Product[];
  }

  static async getEffectiveCost(productId: string, dateStr: string): Promise<CostHistory | null> {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) {
      const histories = DEMO_COST_HISTORY.filter(h => h.product_id === productId && h.effective_date <= dateStr);
      if (histories.length === 0) return null;
      histories.sort((a, b) => b.effective_date.localeCompare(a.effective_date));
      return histories[0];
    }
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('purchase_cost_history')
      .select('*')
      .eq('product_id', productId)
      .lte('effective_date', dateStr)
      .order('effective_date', { ascending: false })
      .limit(1)
      .single();
      
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found
    return data as CostHistory | null;
  }
}

export class QuoteRepository {
  static async saveQuote(quoteData: Omit<Quote, 'id' | 'quote_number' | 'created_at'>): Promise<Quote> {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) {
      const newQuote: Quote = {
        ...quoteData,
        id: `quote-${Date.now()}`,
        quote_number: `Q${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Date.now()).slice(-4)}`,
        created_at: new Date().toISOString()
      };
      DEMO_QUOTES.push(newQuote);
      return newQuote;
    }

    const supabase = await getSupabaseClient();
    // 1. Insert Quote Header
    const quoteNumber = `Q${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Date.now()).slice(-4)}`;
    
    const { data: quoteHeader, error: headerError } = await supabase.from('quotes').insert({
      quote_number: quoteNumber,
      customer_name: quoteData.customer_name,
      channel_id: quoteData.channel_id,
      tier_name: quoteData.tier_name,
      total_untaxed: quoteData.total_untaxed,
      total_tax: quoteData.total_tax,
      total_amount: quoteData.total_amount,
      pricing_version: 'v1'
    }).select().single();

    if (headerError) throw headerError;

    // 2. Insert Quote Items
    const itemsToInsert = quoteData.items.map(item => ({
      quote_id: quoteHeader.id,
      product_id: item.product_id,
      internal_sku: item.internal_sku,
      product_name: item.product_name,
      specification: item.specification,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      effective_cost_date: item.effective_cost_date,
      fixed_cost: item.fixed_cost,
      channel_fee_rate: item.channel_fee_rate,
      target_margin: item.target_margin,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
      tax_rate: item.tax_rate,
      tax_amount: item.tax_amount,
      total: item.total
    }));

    const { error: itemsError } = await supabase.from('quote_items').insert(itemsToInsert);
    
    if (itemsError) throw itemsError;

    return {
      ...quoteData,
      id: quoteHeader.id,
      quote_number: quoteHeader.quote_number,
      created_at: quoteHeader.created_at
    };
  }

  static async getQuotes(): Promise<Quote[]> {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) {
      return [...DEMO_QUOTES].reverse();
    }
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('quotes')
      .select('*, items:quote_items(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Quote[];
  }
}

export class ConfigRepository {
  static async getTiers() {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) return DEMO_TIERS;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('tier_policies').select('*');
    if (error) throw error;
    return data.map(d => ({ id: d.id, name: d.tier_name, defaultMargin: parseFloat(d.default_margin) }));
  }

  static async getChannels() {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) return DEMO_CHANNELS;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('sales_channels').select('*');
    if (error) throw error;
    return data;
  }

  static async getChannelFee(channelId: string) {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) return DEMO_CHANNEL_FEES[channelId] || { feeRate: 0, fixedFee: 0 };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('channel_fee_rules')
      .select('*')
      .eq('channel_id', channelId)
      .lte('effective_date', new Date().toISOString().split('T')[0])
      .order('effective_date', { ascending: false })
      .limit(1)
      .single();
      
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return { feeRate: 0, fixedFee: 0 };
    return { feeRate: parseFloat(data.fee_percentage), fixedFee: parseFloat(data.fixed_fee) };
  }
}
