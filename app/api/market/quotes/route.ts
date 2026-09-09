import { NextRequest, NextResponse } from 'next/server';
import { LiveMarketFeed, SUPPORTED_SYMBOL_SPECS } from '@/lib/server/live-market-feed';
import { CTraderDemoGateway } from '@/lib/gateway/ctrader-gateway';

export async function GET(request: NextRequest) {
  const feed = LiveMarketFeed.getInstance();
  const gateway = CTraderDemoGateway.getInstance();
  const gatewayStatus = gateway.getStatus();
  const gatewayQuotes = gateway.getQuotes();
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');

  if (symbol) {
    const quote = gatewayQuotes[symbol.toUpperCase()] || feed.getQuote(symbol);
    const specs = feed.getSymbolSpecs(symbol);
    return NextResponse.json({
      success: !!quote,
      quote,
      specs,
      feedStatus: feed.getStatus(),
      gatewayStatus,
    });
  }

  return NextResponse.json({
    success: true,
    quotes: Object.keys(gatewayQuotes).length > 0 ? gatewayQuotes : feed.getAllQuotes(),
    specs: SUPPORTED_SYMBOL_SPECS,
    feedStatus: feed.getStatus(),
    gatewayStatus,
  });
}
