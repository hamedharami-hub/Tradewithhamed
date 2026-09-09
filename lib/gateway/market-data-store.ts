import { GatewayQuote, MarketQuality } from './contracts';
import { SymbolId } from '@/lib/contracts/market';

const globalForMarketStore = globalThis as unknown as { normalizedMarketStore?: MarketDataStore };

export class MarketDataStore {
  private readonly quotes = new Map<SymbolId, GatewayQuote>();
  private readonly lastEventTimestamp = new Map<SymbolId, number>();
  private readonly invalidEvents: Array<{ symbol: string; reason: string; receivedAt: number }> = [];

  public static getInstance(): MarketDataStore {
    if (!globalForMarketStore.normalizedMarketStore) globalForMarketStore.normalizedMarketStore = new MarketDataStore();
    return globalForMarketStore.normalizedMarketStore;
  }

  public upsertQuote(input: Omit<GatewayQuote, 'quality' | 'receivedAt' | 'source'> & { receivedAt?: number }): GatewayQuote {
    const receivedAt = input.receivedAt || Date.now();
    const previousTimestamp = this.lastEventTimestamp.get(input.symbol);
    let quality: MarketQuality = 'LIVE';
    let reason = '';
    if (!Number.isFinite(input.bid) || !Number.isFinite(input.ask) || input.bid <= 0 || input.ask <= 0 || input.bid > input.ask) {
      quality = 'INVALID'; reason = 'bid/ask نامعتبر است.';
    } else if (previousTimestamp !== undefined && input.timestamp < previousTimestamp) {
      quality = 'GAP'; reason = 'timestamp به عقب برگشته است.';
    }
    const quote: GatewayQuote = { ...input, receivedAt, quality, source: 'CTRADER_DEMO' };
    if (quality === 'INVALID' || quality === 'GAP') {
      this.invalidEvents.push({ symbol: input.symbol, reason, receivedAt });
      if (this.invalidEvents.length > 100) this.invalidEvents.shift();
      return quote;
    }
    this.lastEventTimestamp.set(input.symbol, input.timestamp);
    this.quotes.set(input.symbol, quote);
    return quote;
  }

  public getQuote(symbol: SymbolId, staleAfterMs: number): GatewayQuote | null {
    const quote = this.quotes.get(symbol);
    if (!quote) return null;
    if (Date.now() - quote.receivedAt > staleAfterMs) return { ...quote, quality: 'STALE' };
    return quote;
  }

  public getAll(staleAfterMs: number): Record<string, GatewayQuote> {
    const output: Record<string, GatewayQuote> = {};
    for (const symbol of this.quotes.keys()) {
      const quote = this.getQuote(symbol, staleAfterMs);
      if (quote) output[symbol] = quote;
    }
    return output;
  }

  public getInvalidEventCount(): number { return this.invalidEvents.length; }
  public resetForTesting(): void { this.quotes.clear(); this.lastEventTimestamp.clear(); this.invalidEvents.length = 0; }
}
