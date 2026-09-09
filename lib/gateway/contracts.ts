import { SymbolId } from '@/lib/contracts/market';

export type GatewayState =
  | 'DISABLED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'APP_AUTHENTICATED'
  | 'ACCOUNT_AUTHENTICATED'
  | 'SUBSCRIBED'
  | 'DEGRADED'
  | 'RECONNECTING';

export type MarketQuality = 'LIVE' | 'STALE' | 'GAP' | 'INVALID';

export interface GatewayQuote {
  symbol: SymbolId;
  bid: number;
  ask: number;
  timestamp: number;
  receivedAt: number;
  quality: MarketQuality;
  source: 'CTRADER_DEMO';
  messageId?: string;
}

export interface GatewayConfig {
  host: string;
  port: number;
  accessToken: string;
  accountId: number;
  clientId: string;
  symbols: Array<{ symbol: SymbolId; symbolId: number }>;
  heartbeatMs: number;
  staleAfterMs: number;
  maxReconnectAttempts: number;
}

export interface GatewayStatus {
  state: GatewayState;
  configured: boolean;
  connected: boolean;
  lastHeartbeatAt: number | null;
  lastQuoteAt: number | null;
  reconnectAttempts: number;
  subscribedSymbols: SymbolId[];
  lastError?: string;
}

export interface CTraderJsonMessage {
  payloadType: number;
  clientMsgId?: string;
  ctidTraderAccountId?: number;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GatewayCommandResult {
  accepted: boolean;
  clientMsgId: string;
  error?: string;
}
