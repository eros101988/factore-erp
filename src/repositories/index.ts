import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { Product, Quote, DEMO_PRODUCTS, DEMO_CHANNELS, DEMO_CHANNEL_FEES, DEMO_QUOTES } from '@/lib/data/demo';
import {
  COST_NOT_FOUND,
  EffectiveCostResult,
  PricingPolicyRow,
  getEffectiveProductCost,
  getPricingPolicies,
  toDateString,
} from '@/lib/pricing/costResolver';
import type { QuoteItemSnapshot } from '@/lib/pricing/quote';

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

export interface QuoteHeaderInput {
  customer_name: string;
  channel_id: string;
  tier_name: string;
  pricing_policy_id: string | null;
  total_untaxed: number;
  total_tax: number;
  total_amount: number;
}

function newQuoteNumber() {
  const now = new Date();
  return `Q${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(Date.now()).slice(-6)}`;
}

export class ProductRepository {
  static async getProducts(): Promise<Product[]> {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) {
      return DEMO_PRODUCTS;
    }
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('internal_sku');
    if (error) throw error;
    return data as Product[];
  }

  /**
   * Published supplier cost in force on dateStr. Never falls back to 0 / demo / future cost.
   */
  static async getEffectiveCost(productId: string, dateStr: string): Promise<EffectiveCostResult> {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) return { ok: false, code: COST_NOT_FOUND };
    return getEffectiveProductCost(productId, dateStr);
  }
}

export class QuoteRepository {
  static async saveQuote(header: QuoteHeaderInput, items: QuoteItemSnapshot[]): Promise<Quote> {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) {
      const newQuote = {
        ...header,
        items,
        id: `quote-${Date.now()}`,
        quote_number: newQuoteNumber(),
        created_at: new Date().toISOString(),
      } as unknown as Quote;
      DEMO_QUOTES.push(newQuote);
      return newQuote;
    }

    const supabase = await getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Insert Quote Header
    const { data: quoteHeader, error: headerError } = await supabase.from('quotes').insert({
      quote_number: newQuoteNumber(),
      ...header,
      created_by: user?.id,
      pricing_version: 'v2',
    }).select().single();

    if (headerError) throw headerError;

    // 2. Insert Quote Items (full snapshot; never re-read from cost tables later)
    const { error: itemsError } = await supabase
      .from('quote_items')
      .insert(items.map(item => ({ quote_id: quoteHeader.id, ...item })));

    if (itemsError) throw itemsError;

    return { ...quoteHeader, items } as unknown as Quote;
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
  static async getPricingPolicies(dateStr: string): Promise<PricingPolicyRow[]> {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) return [];
    return getPricingPolicies(dateStr);
  }

  static async getChannels(): Promise<{ id: string; name: string }[]> {
    enforceConfigInProduction();
    if (!isSupabaseConfigured()) return DEMO_CHANNELS;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('sales_channels').select('*').order('name');
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
      .lte('effective_date', toDateString(new Date()))
      .order('effective_date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return { feeRate: 0, fixedFee: 0 };
    return { feeRate: parseFloat(data.fee_percentage), fixedFee: parseFloat(data.fixed_fee) };
  }
}
