import { CTraderLiveQuote } from '../contracts/ctrader';

export const CTRADER_DEMO_ENDPOINTS = {
  WEBSOCKET_HOST: 'demo.ctraderapi.com',
  WEBSOCKET_PORT: 5035,
  REST_AUTH_URL: 'https://openapi.ctrader.com/apps/token',
};

export const PROTO_OA_MESSAGE_TYPES = {
  HEARTBEAT_EVENT: 51,
  PROTO_OA_APPLICATION_AUTH_REQ: 2100,
  PROTO_OA_APPLICATION_AUTH_RES: 2101,
  PROTO_OA_ACCOUNT_AUTH_REQ: 2102,
  PROTO_OA_ACCOUNT_AUTH_RES: 2103,
  PROTO_OA_SYMBOLS_LIST_REQ: 2114,
  PROTO_OA_SYMBOLS_LIST_RES: 2115,
  PROTO_OA_SUBSCRIBE_SPOTS_REQ: 2104,
  PROTO_OA_SUBSCRIBE_SPOTS_RES: 2105,
  PROTO_OA_SPOT_EVENT: 2126,
  PROTO_OA_ERROR_RES: 2142,
};

export class CTraderFeedTracker {
  private lastQuoteTimestamp = 0;
  private lastHeartbeatTimestamp = 0;
  private maxStaleThresholdMs = 3000;

  public recordQuote(quote: CTraderLiveQuote): { isFresh: boolean; delayMs: number } {
    const now = Date.now();
    this.lastQuoteTimestamp = quote.timestamp || now;
    const delay = Math.max(0, now - this.lastQuoteTimestamp);
    const isFresh = delay <= this.maxStaleThresholdMs;

    return { isFresh, delayMs: delay };
  }

  public recordHeartbeat(): void {
    this.lastHeartbeatTimestamp = Date.now();
  }

  public checkHealth(): {
    isConnected: boolean;
    isStale: boolean;
    timeSinceLastQuoteMs: number;
    timeSinceLastHeartbeatMs: number;
  } {
    const now = Date.now();
    const timeSinceLastQuote = this.lastQuoteTimestamp > 0 ? now - this.lastQuoteTimestamp : -1;
    const timeSinceLastHeartbeat = this.lastHeartbeatTimestamp > 0 ? now - this.lastHeartbeatTimestamp : -1;

    const isStale = timeSinceLastQuote > this.maxStaleThresholdMs;
    const isConnected = timeSinceLastHeartbeat > 0 && now - this.lastHeartbeatTimestamp < 15000;

    return {
      isConnected,
      isStale,
      timeSinceLastQuoteMs: timeSinceLastQuote,
      timeSinceLastHeartbeatMs: timeSinceLastHeartbeat,
    };
  }
}
