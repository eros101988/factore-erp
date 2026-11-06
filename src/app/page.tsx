import QuoteCalculator from "@/components/QuoteCalculator";
import { ProductRepository, ConfigRepository } from "@/repositories";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  const products = await ProductRepository.getProducts();
  const tiers = await ConfigRepository.getTiers();
  const channels = await ConfigRepository.getChannels();
  
  // Need to pass cost histories for all products so client can compute, 
  // or fetch dynamically. Since it's demo/small data, we can pass all latest costs.
  // But wait, the client component already imports DEMO_DATA. 
  // Let's modify QuoteCalculator to take props.
  const productCosts = await Promise.all(
    products.map(async (p) => {
      const cost = await ProductRepository.getEffectiveCost(p.id, new Date().toISOString().split('T')[0]);
      return { productId: p.id, cost };
    })
  );

  const channelFees = await Promise.all(
    channels.map(async (c) => {
      const fee = await ConfigRepository.getChannelFee(c.id);
      return { channelId: c.id, fee };
    })
  );

  return (
    <QuoteCalculator 
      initialProducts={products}
      initialTiers={tiers}
      initialChannels={channels}
      productCosts={productCosts}
      channelFees={channelFees}
    />
  );
}
