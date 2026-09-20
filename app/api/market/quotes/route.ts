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
  const mode = searchParams.get('mode'); // 'demo' | undefined

  // در حالت دمو، مطلقاً نباید به داده‌های شبیه‌سازی‌شده (LiveMarketFeed) فال‌بک زده شود
  const isDemoMode = mode === 'demo';

  if (symbol) {
    const upperSymbol = symbol.toUpperCase();
    const gatewayQuote = gatewayQuotes[upperSymbol] || null;
    
    if (isDemoMode) {
      const specs = feed.getSymbolSpecs(upperSymbol);
      return NextResponse.json({
        success: !!gatewayQuote,
        quote: gatewayQuote,
        specs,
        source: gatewayQuote ? 'CTRADER_DEMO' : 'UNAVAILABLE',
        error: gatewayQuote ? undefined : 'BROKER_QUOTE_UNAVAILABLE: مظنه قیمت بروکر در دسترس نیست.',
        gatewayStatus,
      });
    }

    const fallbackQuote = feed.getQuote(upperSymbol);
    const quote = gatewayQuote || fallbackQuote;
    const specs = feed.getSymbolSpecs(upperSymbol);
    return NextResponse.json({
      success: !!quote,
      quote,
      specs,
      source: gatewayQuote ? 'CTRADER_DEMO' : 'SIMULATED',
      feedStatus: feed.getStatus(),
      gatewayStatus,
    });
  }

  if (isDemoMode) {
    return NextResponse.json({
      success: Object.keys(gatewayQuotes).length > 0,
      quotes: gatewayQuotes,
      specs: SUPPORTED_SYMBOL_SPECS,
      source: 'CTRADER_DEMO',
      gatewayStatus,
    });
  }

  return NextResponse.json({
    success: true,
    quotes: Object.keys(gatewayQuotes).length > 0 ? gatewayQuotes : feed.getAllQuotes(),
    specs: SUPPORTED_SYMBOL_SPECS,
    source: Object.keys(gatewayQuotes).length > 0 ? 'CTRADER_DEMO' : 'SIMULATED',
    feedStatus: feed.getStatus(),
    gatewayStatus,
  });
}
