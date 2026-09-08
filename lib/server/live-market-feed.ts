/**
 * lib/server/live-market-feed.ts
 * ماژول مدیریت فید قیمت‌های زنده و فراداده نمادها — الزام W4 Gate A
 * 
 * - اتصال Read-Only به نرخ‌های لحظه‌ای cTrader / شبیه‌ساز دقیق نرخ‌های زنده
 * - پایش میزان تازگی داده (Freshness Tracking)، تشخیص تأخیر (Staleness) و داده‌های نامشخص (Unknown)
 * - ارائه قیمت‌های زنده Bid / Ask و اسپرد برای XAUUSD و EURUSD
 * - تضمین عدم امکان ارسال هرگونه سفارش بروکر از این ماژول (Zero Broker Writes)
 */

import { CTraderLiveQuote, CTraderSymbolSpecs } from '../contracts/ctrader';

export interface MarketFeedStatus {
  isConnected: boolean;
  isStale: boolean;
  dataMode: 'LIVE' | 'STALE' | 'UNKNOWN' | 'SIMULATED';
  lastHeartbeatTimestamp: number;
  lastQuoteTimestamp: number;
  latencyMs: number;
  activeSymbols: string[];
}

export const SUPPORTED_SYMBOL_SPECS: Record<string, CTraderSymbolSpecs> = {
  XAUUSD: {
    symbolId: 1,
    symbolName: 'XAUUSD',
    digits: 2,
    pipPosition: 1,
    minVolume: 0.01,
    maxVolume: 50.0,
    volumeStep: 0.01,
    tradingMode: 'FULL_ACCESS',
    schedule: '24/5 UTC',
  },
  EURUSD: {
    symbolId: 2,
    symbolName: 'EURUSD',
    digits: 5,
    pipPosition: 4,
    minVolume: 0.01,
    maxVolume: 100.0,
    volumeStep: 0.01,
    tradingMode: 'FULL_ACCESS',
    schedule: '24/5 UTC',
  },
};

const globalForFeed = globalThis as unknown as {
  marketFeedInstance?: LiveMarketFeed;
};

export class LiveMarketFeed {
  private quotes: Map<string, CTraderLiveQuote> = new Map();
  private lastHeartbeatTimestamp: number = Date.now();
  private maxStaleThresholdMs: number = 4000;
  private isSimulatedLiveActive: boolean = true;
  private hasRealConnection: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  // قیمت‌های پایه پیش‌فرض
  private currentBasePrices: Record<string, number> = {
    XAUUSD: 2652.45,
    EURUSD: 1.08465,
  };

  constructor() {
    this.initializeQuotes();
    this.startTickGenerator();
  }

  public static getInstance(): LiveMarketFeed {
    if (!globalForFeed.marketFeedInstance || typeof (globalForFeed.marketFeedInstance as any).resetForTesting !== 'function') {
      if (globalForFeed.marketFeedInstance) {
        globalForFeed.marketFeedInstance.stop();
      }
      globalForFeed.marketFeedInstance = new LiveMarketFeed();
    }
    return globalForFeed.marketFeedInstance;
  }

  private initializeQuotes(): void {
    const now = Date.now();
    for (const [sym, price] of Object.entries(this.currentBasePrices)) {
      const spread = sym === 'XAUUSD' ? 0.25 : 0.00014;
      const spreadPips = sym === 'XAUUSD' ? 2.5 : 1.4;
      this.quotes.set(sym, {
        symbol: sym,
        bid: Number((price - spread / 2).toFixed(sym === 'XAUUSD' ? 2 : 5)),
        ask: Number((price + spread / 2).toFixed(sym === 'XAUUSD' ? 2 : 5)),
        spreadPips,
        timestamp: now,
        quality: 'SIMULATED',
      });
    }
  }

  /**
   * تولید نرخ‌های پیوسته و شبه‌تصادفی لحظه‌ای جهت فعال نگه‌داشتن فید زنده Paper Live
   */
  private startTickGenerator(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      if (!this.isSimulatedLiveActive) return;

      const now = Date.now();
      this.lastHeartbeatTimestamp = now;

      for (const [sym, currentPrice] of Object.entries(this.currentBasePrices)) {
        // نوسان گام تصادفی (Random Walk)
        const volatility = sym === 'XAUUSD' ? 0.35 : 0.00008;
        const delta = (Math.random() - 0.495) * volatility;
        const newBase = Math.max(1, currentPrice + delta);
        this.currentBasePrices[sym] = newBase;

        const spread = sym === 'XAUUSD' ? 0.22 + Math.random() * 0.08 : 0.00012 + Math.random() * 0.00004;
        const digits = sym === 'XAUUSD' ? 2 : 5;
        const pipMultiplier = sym === 'XAUUSD' ? 10 : 10000;

        const bid = Number((newBase - spread / 2).toFixed(digits));
        const ask = Number((newBase + spread / 2).toFixed(digits));
        const spreadPips = Number(((ask - bid) * pipMultiplier).toFixed(1));

        this.quotes.set(sym, {
          symbol: sym,
          bid,
          ask,
          spreadPips,
          timestamp: now,
          quality: this.hasRealConnection ? 'LIVE' : 'SIMULATED',
        });
      }
    }, 1000);
  }

  /**
   * دریافت آخرین مظنه قیمت یک نماد با ارزیابی برخط تازگی داده
   */
  public getQuote(symbol: string): CTraderLiveQuote | null {
    const quote = this.quotes.get(symbol.toUpperCase());
    if (!quote) return null;

    const now = Date.now();
    const delay = now - quote.timestamp;
    const isStale = delay > this.maxStaleThresholdMs;

    return {
      ...quote,
      quality: isStale ? 'STALE' : (this.hasRealConnection ? 'LIVE' : 'SIMULATED'),
    };
  }

  /**
   * دریافت کلیه مظنه‌های فعال
   */
  public getAllQuotes(): Record<string, CTraderLiveQuote> {
    const result: Record<string, CTraderLiveQuote> = {};
    for (const [sym] of this.quotes.entries()) {
      const q = this.getQuote(sym);
      if (q) result[sym] = q;
    }
    return result;
  }

  /**
   * تزریق دستی داده زنده از سرور cTrader (هنگام اتصال واقعی پروتوباف)
   */
  public injectLiveQuote(quote: CTraderLiveQuote): void {
    this.hasRealConnection = true;
    this.isSimulatedLiveActive = false; // توقف گام تصادفی شبیه‌ساز برای جلوگیری از پولوشن داده زنده
    const sym = quote.symbol.toUpperCase();
    this.currentBasePrices[sym] = (quote.bid + quote.ask) / 2;

    this.quotes.set(sym, {
      ...quote,
      symbol: sym,
      timestamp: quote.timestamp || Date.now(),
      quality: 'LIVE',
    });
    this.lastHeartbeatTimestamp = Date.now();
  }

  /**
   * بازنشانی فید به حالت اولیه جهت ایزولاسیون کامل تست‌ها
   */
  public resetForTesting(): void {
    this.hasRealConnection = false;
    this.isSimulatedLiveActive = true;
    this.currentBasePrices = {
      XAUUSD: 2652.45,
      EURUSD: 1.08465,
    };
    this.initializeQuotes();
    this.lastHeartbeatTimestamp = Date.now();
  }

  /**
   * بررسی سلامت و تأخیر فید داده
   */
  public getStatus(): MarketFeedStatus {
    const now = Date.now();
    const delaySinceHeartbeat = now - this.lastHeartbeatTimestamp;
    const isConnected = delaySinceHeartbeat < 15000;
    const isStale = delaySinceHeartbeat > this.maxStaleThresholdMs;

    let dataMode: 'LIVE' | 'STALE' | 'UNKNOWN' | 'SIMULATED' = this.hasRealConnection ? 'LIVE' : 'SIMULATED';
    if (!isConnected) {
      dataMode = 'UNKNOWN';
    } else if (isStale) {
      dataMode = 'STALE';
    }

    return {
      isConnected,
      isStale,
      dataMode,
      lastHeartbeatTimestamp: this.lastHeartbeatTimestamp,
      lastQuoteTimestamp: now,
      latencyMs: Math.max(0, delaySinceHeartbeat),
      activeSymbols: Array.from(this.quotes.keys()),
    };
  }

  public getSymbolSpecs(symbol: string): CTraderSymbolSpecs | null {
    return SUPPORTED_SYMBOL_SPECS[symbol.toUpperCase()] || null;
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
