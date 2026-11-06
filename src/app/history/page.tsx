import QuoteHistory from "@/components/QuoteHistory";
import { QuoteRepository } from "@/repositories";
import { connection } from "next/server";

export default async function HistoryPage() {
  await connection();
  const quotes = await QuoteRepository.getQuotes();
  
  return (
    <QuoteHistory initialQuotes={quotes} />
  );
}
