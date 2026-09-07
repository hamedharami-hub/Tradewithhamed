import { NextRequest, NextResponse } from 'next/server';
import { LiveMarketFeed, SUPPORTED_SYMBOL_SPECS } from '@/lib/server/live-market-feed';

export async function GET(request: NextRequest) {
  const feed = LiveMarketFeed.getInstance();
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');

  if (symbol) {
    const quote = feed.getQuote(symbol);
    const specs = feed.getSymbolSpecs(symbol);
    return NextResponse.json({
      success: !!quote,
      quote,
      specs,
      feedStatus: feed.getStatus(),
    });
  }

  return NextResponse.json({
    success: true,
    quotes: feed.getAllQuotes(),
    specs: SUPPORTED_SYMBOL_SPECS,
    feedStatus: feed.getStatus(),
  });
}
