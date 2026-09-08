export type CTraderEnvironment = 'demo'; // حساب واقعی (live) در تمام سیستم غیرمجاز است

export type CTraderConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'STALE'
  | 'ERROR'
  | 'BLOCKED';

export interface CTraderSanitizedAccount {
  accountId: string;          // شناسه ماسک‌شده برای نمایش
  accountType: 'DEMO';        // فقط DEMO
  depositCurrency: string;    // مثلاً USD
  leverage: number;
  balance: number;
  equity: number;
  isLiveRejected: true;       // تضمین اعتبارسنجی رد حساب لایو
}

export interface CTraderSessionStatus {
  state: CTraderConnectionState;
  environment: CTraderEnvironment;
  isAuthenticated: boolean;
  activeAccount: CTraderSanitizedAccount | null;
  lastHeartbeatTimestamp: number | null;
  dataFreshnessMs: number | null;
  isDataStale: boolean;
  errorMessage?: string;
  errorCode?: string;
  demoBadge: true;
}

export interface CTraderSymbolSpecs {
  symbolId: number;
  symbolName: string; // XAUUSD, EURUSD
  digits: number;
  pipPosition: number;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  tradingMode: 'FULL_ACCESS' | 'CLOSE_ONLY' | 'DISABLED';
  schedule: string;
}

export interface CTraderLiveQuote {
  symbol: string;
  bid: number;
  ask: number;
  spreadPips: number;
  timestamp: number;
  quality: 'LIVE' | 'STALE' | 'UNKNOWN' | 'SIMULATED';
}
