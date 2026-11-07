import QuoteCalculator from "@/components/QuoteCalculator";
import { ProductRepository, ConfigRepository } from "@/repositories";
import { toDateString } from "@/lib/pricing/costResolver";
import { connection } from "next/server";

const TIER_NAMES: Record<string, string> = { small: '小盤', medium: '中盤', large: '大盤' };
const TIER_ORDER: Record<string, number> = { large: 1, medium: 2, small: 3 };

export default async function Home() {
  await connection();
  const [products, channels, policies] = await Promise.all([
    ProductRepository.getProducts(),
    ConfigRepository.getChannels(),
    ConfigRepository.getPricingPolicies(toDateString(new Date())),
  ]);

  const channelFees = await Promise.all(
    channels.map(async c => ({ channelId: c.id, fee: await ConfigRepository.getChannelFee(c.id) }))
  );

  // Margins come from pricing_policies (admin-editable), never hard-coded
  const tiers = policies
    .map(p => ({
      tier: p.tier,
      name: TIER_NAMES[p.tier] ?? p.tier,
      defaultMargin: Number(p.default_margin),
      minimumMargin: p.minimum_margin === null ? null : Number(p.minimum_margin),
    }))
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99));

  return (
    <div className="flex flex-col min-h-[calc(100vh-60px)]">
      <QuoteCalculator
        initialProducts={products}
        initialTiers={tiers}
        initialChannels={channels}
        channelFees={channelFees}
      />
    </div>
  );
}
