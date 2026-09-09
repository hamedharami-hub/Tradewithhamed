import type { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';

export type ReadOnlyCanonicalSymbol = SymbolId | 'BTCUSD';

/**
 * Strict outbound payload allowlist for read-only transport.
 * 51: HEARTBEAT
 * 2100: APP_AUTH_REQ
 * 2102: ACCOUNT_AUTH_REQ
 * 2114: SYMBOLS_LIST_REQ
 * 2116: SYMBOL_BY_ID_REQ
 * 2127: SUBSCRIBE_SPOTS_REQ
 * 2129: UNSUBSCRIBE_SPOTS_REQ
 * 2149: GET_ACCOUNT_LIST_REQ
 *
 * ANY OTHER PAYLOAD (especially 2106 NEW_ORDER_REQ, 2108 CANCEL, 2110 AMEND, 2124 RECONCILE)
 * is strictly forbidden and blocked before socket transmission.
 */
export const READONLY_ALLOWED_PAYLOAD_TYPES = [
  51,   // ProtoHeartbeatEvent
  2100, // ProtoOAApplicationAuthReq
  2102, // ProtoOAAccountAuthReq
  2114, // ProtoOASymbolsListReq
  2116, // ProtoOASymbolByIdReq
  2127, // ProtoOASubscribeSpotsReq
  2129, // ProtoOAUnsubscribeSpotsReq
  2149, // ProtoOAGetAccountListByAccessTokenReq
] as const;

export type ReadOnlyAllowedPayloadType = typeof READONLY_ALLOWED_PAYLOAD_TYPES[number];

export interface CTraderReadOnlyConfig {
  host: string;
  port: number;
  clientId: string;
  clientSecret?: string;
  accessToken: string;
  accountId: number;
  environment: 'demo';
  staleAfterMs: number;
  heartbeatIntervalMs: number;
  maxReconnectAttempts: number;
  readonly brokerWrites: false;
}

export type ReadOnlyEventType =
  | 'CONNECTED'
  | 'DISCONNECT'
  | 'RECONNECT'
  | 'GAP'
  | 'STALE'
  | 'UNAVAILABLE_SYMBOL'
  | 'BAR_CLOSED'
  | 'SUBSCRIBED'
  | 'ERROR'
  | 'HEARTBEAT';

export interface ReadOnlyEvent {
  type: ReadOnlyEventType;
  timestamp: number;
  isoTime: string;
  readonly brokerWrites: false;
  symbol?: string;
  timeframe?: Timeframe;
  candle?: Candle;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface DiscoveredSymbol {
  symbolId: number;
  symbolName: string;
  canonicalSymbol: ReadOnlyCanonicalSymbol;
  digits?: number;
  pipPosition?: number;
}

export interface ReadOnlyPreflightResult {
  valid: boolean;
  reason?: string;
  config?: CTraderReadOnlyConfig;
  brokerWrites: false;
}

/**
 * Validates preflight environment configuration for read-only paper forward mode.
 * Enforces fail-closed rules: demo only, port 5036 only (rejects 5035), credentials presence.
 */
export function validateReadOnlyPreflight(env: Record<string, string | undefined> = process.env): ReadOnlyPreflightResult {
  if (env.CTRADER_LIVE_ENABLE === 'true') {
    return {
      valid: false,
      reason: 'LIVE_MODE_EXPLICITLY_FORBIDDEN: Live trading is strictly forbidden in read-only paper forward mode.',
      brokerWrites: false,
    };
  }

  const environment = (env.CTRADER_ENVIRONMENT || '').trim().toLowerCase();
  if (environment !== 'demo') {
    return {
      valid: false,
      reason: `LIVE_ENVIRONMENT_FORBIDDEN: CTRADER_ENVIRONMENT must be 'demo'. Received: '${environment || 'undefined'}'.`,
      brokerWrites: false,
    };
  }

  const host = (env.CTRADER_GATEWAY_HOST || 'demo.ctraderapi.com').trim();
  if (!host.includes('demo')) {
    return {
      valid: false,
      reason: `NON_DEMO_HOST_FORBIDDEN: Gateway host '${host}' is not a verified demo endpoint.`,
      brokerWrites: false,
    };
  }

  const portRaw = env.CTRADER_GATEWAY_PORT ? Number(env.CTRADER_GATEWAY_PORT) : 5036;
  if (portRaw === 5035) {
    return {
      valid: false,
      reason: 'PORT_5035_DEPRECATED: Port 5035 is protobuf/legacy. Official cTrader Open API JSON WebSocket requires port 5036.',
      brokerWrites: false,
    };
  }
  if (portRaw !== 5036) {
    return {
      valid: false,
      reason: `INVALID_PORT: cTrader read-only JSON transport must connect to port 5036. Received: ${portRaw}.`,
      brokerWrites: false,
    };
  }

  const clientId = env.CTRADER_CLIENT_ID?.trim();
  const clientSecret = env.CTRADER_CLIENT_SECRET?.trim();
  const accessToken = env.CTRADER_ACCESS_TOKEN?.trim();
  const accountId = Number(env.CTRADER_ACCOUNT_ID);

  if (!clientId || !accessToken || !Number.isInteger(accountId) || accountId <= 0) {
    return {
      valid: false,
      reason: 'MISSING_CREDENTIALS: CTRADER_CLIENT_ID, CTRADER_ACCESS_TOKEN and a positive integer CTRADER_ACCOUNT_ID are required.',
      brokerWrites: false,
    };
  }

  return {
    valid: true,
    brokerWrites: false,
    config: {
      host,
      port: 5036,
      clientId,
      clientSecret,
      accessToken,
      accountId,
      environment: 'demo',
      staleAfterMs: Number(env.CTRADER_STALE_MS) || 4000,
      heartbeatIntervalMs: Number(env.CTRADER_HEARTBEAT_MS) || 10000,
      maxReconnectAttempts: Number(env.CTRADER_MAX_RECONNECT) || 10,
      brokerWrites: false,
    },
  };
}

/**
 * Validates whether an outbound message payloadType is permitted on read-only transport.
 * Throws SAFETY_BLOCKED if the payload is not strictly allowlisted.
 */
export function assertOutboundMessageAllowed(payloadType: number): asserts payloadType is ReadOnlyAllowedPayloadType {
  if (!(READONLY_ALLOWED_PAYLOAD_TYPES as readonly number[]).includes(payloadType)) {
    throw new Error(
      `SAFETY_BLOCKED: Payload type ${payloadType} is strictly forbidden on read-only transport. Outbound messages are restricted to read-only discovery, auth, heartbeat, and spot subscription.`
    );
  }
}

/**
 * Matches broker symbol alias to canonical symbol.
 */
export function matchCanonicalSymbol(rawName: string): ReadOnlyCanonicalSymbol | null {
  const clean = rawName.toUpperCase().replace(/[\/\.\-_]/g, '');
  if (clean.startsWith('EURUSD')) return 'EURUSD';
  if (clean.startsWith('GBPUSD')) return 'GBPUSD';
  if (clean.startsWith('USDJPY')) return 'USDJPY';
  if (clean.startsWith('XAUUSD') || clean === 'GOLD' || clean.startsWith('GOLD')) return 'XAUUSD';
  if (clean.startsWith('BTCUSD') || clean.startsWith('BITCOIN')) return 'BTCUSD';
  return null;
}

/**
 * Processes raw symbol catalog from ProtoOASymbolsListRes.
 * Emits UNAVAILABLE_SYMBOL for any canonical symbol not discoverable.
 */
export function processDiscoveredSymbols(symbols: Array<{ symbolId: number; symbolName: string; digits?: number; pipPosition?: number }>): {
  discovered: DiscoveredSymbol[];
  unavailable: ReadOnlyCanonicalSymbol[];
} {
  const discovered: DiscoveredSymbol[] = [];
  const required: ReadOnlyCanonicalSymbol[] = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
  const optional: ReadOnlyCanonicalSymbol[] = ['BTCUSD'];
  const allTargets = [...required, ...optional];

  const foundMap = new Map<ReadOnlyCanonicalSymbol, DiscoveredSymbol>();

  for (const s of symbols) {
    const matched = matchCanonicalSymbol(s.symbolName);
    if (matched && !foundMap.has(matched)) {
      const entry: DiscoveredSymbol = {
        symbolId: s.symbolId,
        symbolName: s.symbolName,
        canonicalSymbol: matched,
        digits: s.digits,
        pipPosition: s.pipPosition,
      };
      foundMap.set(matched, entry);
      discovered.push(entry);
    }
  }

  const unavailable: ReadOnlyCanonicalSymbol[] = [];
  for (const target of allTargets) {
    if (!foundMap.has(target)) {
      unavailable.push(target);
    }
  }

  return { discovered, unavailable };
}

interface InternalCandleBucket {
  candle: Candle;
  bucketStart: number;
}

/**
 * Accumulates incoming tick quotes into closed M1 and M5 candles.
 * Never emits unclosed candles for decision making.
 */
export class ReadOnlyBarAccumulator {
  private readonly m1Buckets = new Map<ReadOnlyCanonicalSymbol, InternalCandleBucket>();
  private readonly m5Buckets = new Map<ReadOnlyCanonicalSymbol, InternalCandleBucket>();
  private readonly closedBarListeners = new Set<(event: { symbol: ReadOnlyCanonicalSymbol; timeframe: Timeframe; candle: Candle }) => void>();
  private lastQuoteTimestamps = new Map<ReadOnlyCanonicalSymbol, number>();

  public onBarClosed(listener: (event: { symbol: ReadOnlyCanonicalSymbol; timeframe: Timeframe; candle: Candle }) => void): () => void {
    this.closedBarListeners.add(listener);
    return () => this.closedBarListeners.delete(listener);
  }

  public ingestQuote(symbol: ReadOnlyCanonicalSymbol, bid: number, ask: number, timestamp: number): {
    closedBars: Array<{ symbol: ReadOnlyCanonicalSymbol; timeframe: Timeframe; candle: Candle }>;
    gapDetected: boolean;
  } {
    const closedBars: Array<{ symbol: ReadOnlyCanonicalSymbol; timeframe: Timeframe; candle: Candle }> = [];
    const mid = Number(((bid + ask) / 2).toFixed(5));

    const prevTs = this.lastQuoteTimestamps.get(symbol);
    const gapDetected = prevTs !== undefined && (timestamp < prevTs || timestamp - prevTs > 60000);
    this.lastQuoteTimestamps.set(symbol, timestamp);

    // M1 = 60,000 ms
    const m1Closed = this.updateBucket(symbol, '1M', 60_000, mid, timestamp, this.m1Buckets);
    if (m1Closed) {
      closedBars.push(m1Closed);
      for (const listener of this.closedBarListeners) listener(m1Closed);
    }

    // M5 = 300,000 ms
    const m5Closed = this.updateBucket(symbol, '5M', 300_000, mid, timestamp, this.m5Buckets);
    if (m5Closed) {
      closedBars.push(m5Closed);
      for (const listener of this.closedBarListeners) listener(m5Closed);
    }

    return { closedBars, gapDetected };
  }

  private updateBucket(
    symbol: ReadOnlyCanonicalSymbol,
    timeframe: Timeframe,
    bucketDurationMs: number,
    price: number,
    timestamp: number,
    store: Map<ReadOnlyCanonicalSymbol, InternalCandleBucket>
  ): { symbol: ReadOnlyCanonicalSymbol; timeframe: Timeframe; candle: Candle } | null {
    const bucketStart = Math.floor(timestamp / bucketDurationMs) * bucketDurationMs;
    const current = store.get(symbol);

    if (!current) {
      store.set(symbol, {
        bucketStart,
        candle: {
          timestamp: bucketStart,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 1,
          isClosed: false,
        },
      });
      return null;
    }

    if (bucketStart > current.bucketStart) {
      // Previous candle is closed
      const closedCandle: Candle = {
        ...current.candle,
        isClosed: true,
      };
      // Start new bucket
      store.set(symbol, {
        bucketStart,
        candle: {
          timestamp: bucketStart,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 1,
          isClosed: false,
        },
      });
      return { symbol, timeframe, candle: closedCandle };
    }

    if (bucketStart === current.bucketStart) {
      current.candle.high = Math.max(current.candle.high, price);
      current.candle.low = Math.min(current.candle.low, price);
      current.candle.close = price;
      current.candle.volume += 1;
    }

    return null;
  }

  public reset(): void {
    this.m1Buckets.clear();
    this.m5Buckets.clear();
    this.lastQuoteTimestamps.clear();
  }
}

export type ReadOnlyTransportState =
  | 'INITIAL'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'DEGRADED';

/**
 * Dedicated read-only cTrader WebSocket transport.
 * Enforces fail-closed security:
 * - Broker order execution is architecturally impossible (brokerWrites: false).
 * - Outbound message filter rejects all order/trade payload types with SAFETY_BLOCKED.
 * - Dynamic symbol discovery automatically maps broker aliases and records UNAVAILABLE_SYMBOL.
 * - Bar accumulator produces closed M1 and M5 candles only.
 */
export class CTraderReadOnlyTransport {
  public readonly brokerWrites = false as const;
  private socket: WebSocket | null = null;
  private state: ReadOnlyTransportState = 'INITIAL';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatAt: number | null = null;
  private lastQuoteAt: number | null = null;
  private readonly events: ReadOnlyEvent[] = [];
  private readonly eventListeners = new Set<(event: ReadOnlyEvent) => void>();
  private readonly accumulator = new ReadOnlyBarAccumulator();
  private discoveredSymbols: DiscoveredSymbol[] = [];
  private unavailableSymbols: ReadOnlyCanonicalSymbol[] = [];

  constructor(
    private readonly config: CTraderReadOnlyConfig,
    private readonly customSocketFactory?: (url: string) => WebSocket
  ) {
    this.accumulator.onBarClosed(bar => {
      this.emitEvent({
        type: 'BAR_CLOSED',
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        brokerWrites: false,
        symbol: bar.symbol,
        timeframe: bar.timeframe,
        candle: bar.candle,
      });
    });
  }

  public getStatus(): {
    connected: boolean;
    state: ReadOnlyTransportState;
    brokerWrites: false;
    discoveredSymbols: DiscoveredSymbol[];
    unavailableSymbols: ReadOnlyCanonicalSymbol[];
    reconnectAttempts: number;
    lastHeartbeatAt: number | null;
    lastQuoteAt: number | null;
  } {
    return {
      connected: this.socket?.readyState === 1, // WebSocket.OPEN
      state: this.state,
      brokerWrites: false,
      discoveredSymbols: [...this.discoveredSymbols],
      unavailableSymbols: [...this.unavailableSymbols],
      reconnectAttempts: this.reconnectAttempts,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastQuoteAt: this.lastQuoteAt,
    };
  }

  public getDiscoveredSymbols(): DiscoveredSymbol[] {
    return [...this.discoveredSymbols];
  }

  public getUnavailableSymbols(): ReadOnlyCanonicalSymbol[] {
    return [...this.unavailableSymbols];
  }

  public getEvents(): ReadOnlyEvent[] {
    return [...this.events];
  }

  public onEvent(listener: (event: ReadOnlyEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  public onBarClosed(listener: (event: { symbol: ReadOnlyCanonicalSymbol; timeframe: Timeframe; candle: Candle }) => void): () => void {
    return this.accumulator.onBarClosed(listener);
  }

  public emitEvent(event: ReadOnlyEvent): void {
    this.events.push(event);
    for (const listener of this.eventListeners) listener(event);
  }

  public start(): void {
    if (this.socket && this.state !== 'DISCONNECTED') return;
    this.reconnectAttempts = 0;
    this.connect();
  }

  public stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.socket?.close(1000, 'operator stop');
    this.socket = null;
    this.state = 'DISCONNECTED';
    this.emitEvent({
      type: 'DISCONNECT',
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      brokerWrites: false,
      reason: 'OPERATOR_STOPPED',
    });
  }

  /**
   * Safe outbound message dispatch.
   * STRICTLY validates payloadType against outbound allowlist.
   * Throws SAFETY_BLOCKED if an unallowlisted payload is passed.
   */
  public async send(payloadType: number, payload: Record<string, unknown> = {}): Promise<{ accepted: boolean; clientMsgId: string; error?: string }> {
    // 1. Fail-closed safety assertion BEFORE socket check
    assertOutboundMessageAllowed(payloadType);

    const clientMsgId = `ro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!this.socket || this.socket.readyState !== 1) {
      return { accepted: false, clientMsgId, error: 'SOCKET_NOT_CONNECTED' };
    }

    const envelope = {
      payloadType,
      clientMsgId,
      payload,
    };

    this.socket.send(JSON.stringify(envelope));
    return { accepted: true, clientMsgId };
  }

  public ingestQuote(symbol: ReadOnlyCanonicalSymbol, bid: number, ask: number, timestamp: number): void {
    this.lastQuoteAt = timestamp;
    const { closedBars: _, gapDetected } = this.accumulator.ingestQuote(symbol, bid, ask, timestamp);
    if (gapDetected) {
      this.emitEvent({
        type: 'GAP',
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        brokerWrites: false,
        symbol,
        reason: 'QUOTE_TIMESTAMP_GAP_OR_OUT_OF_ORDER',
      });
    }
  }

  public handleCatalogResponse(symbols: Array<{ symbolId: number; symbolName: string; digits?: number; pipPosition?: number }>): void {
    const { discovered, unavailable } = processDiscoveredSymbols(symbols);
    this.discoveredSymbols = discovered;
    this.unavailableSymbols = unavailable;

    for (const unavail of unavailable) {
      this.emitEvent({
        type: 'UNAVAILABLE_SYMBOL',
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        brokerWrites: false,
        symbol: unavail,
        reason: `${unavail} not available in broker account symbol catalog; fallback ID forbidden.`,
      });
    }

    // Subscribe spots for discovered symbols
    for (const item of discovered) {
      void this.send(2127, {
        ctidTraderAccountId: this.config.accountId,
        symbolId: item.symbolId,
        subscribeToSpotTimestamp: true,
      });
    }

    this.emitEvent({
      type: 'SUBSCRIBED',
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      brokerWrites: false,
      details: {
        discoveredCount: discovered.length,
        discovered: discovered.map(d => d.canonicalSymbol),
      },
    });
  }

  private connect(): void {
    this.state = this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING';
    const url = `wss://${this.config.host}:${this.config.port}`;

    try {
      const socket = this.customSocketFactory ? this.customSocketFactory(url) : new WebSocket(url);
      this.socket = socket;

      socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.state = 'CONNECTED';
        this.emitEvent({
          type: 'CONNECTED',
          timestamp: Date.now(),
          isoTime: new Date().toISOString(),
          brokerWrites: false,
        });

        // Step 1: Application auth
        void this.send(2100, {
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret,
        });

        this.startHeartbeat();
      };

      socket.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      socket.onerror = () => {
        this.state = 'DEGRADED';
        this.emitEvent({
          type: 'ERROR',
          timestamp: Date.now(),
          isoTime: new Date().toISOString(),
          brokerWrites: false,
          reason: 'WEBSOCKET_NETWORK_ERROR',
        });
      };

      socket.onclose = () => {
        this.socket = null;
        this.emitEvent({
          type: 'DISCONNECT',
          timestamp: Date.now(),
          isoTime: new Date().toISOString(),
          brokerWrites: false,
          reason: 'WEBSOCKET_CLOSED',
        });
        if (this.state !== 'DISCONNECTED') {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      this.state = 'DEGRADED';
      this.emitEvent({
        type: 'ERROR',
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        brokerWrites: false,
        reason: error instanceof Error ? error.message : 'FAILED_TO_INITIALIZE_WEBSOCKET',
      });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.state === 'DISCONNECTED') return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.state = 'DEGRADED';
      this.emitEvent({
        type: 'ERROR',
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        brokerWrites: false,
        reason: 'MAX_RECONNECT_ATTEMPTS_EXCEEDED',
      });
      return;
    }
    this.reconnectAttempts += 1;
    this.emitEvent({
      type: 'RECONNECT',
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      brokerWrites: false,
      details: { attempt: this.reconnectAttempts },
    });
    const backoff = Math.min(30000, 500 * 2 ** (this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => this.connect(), backoff);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.lastHeartbeatAt = Date.now();
      void this.send(51);
      this.emitEvent({
        type: 'HEARTBEAT',
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        brokerWrites: false,
      });
    }, this.config.heartbeatIntervalMs);
  }

  public handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    try {
      const msg = JSON.parse(raw) as { payloadType: number; payload?: Record<string, unknown> };
      const payload = msg.payload || {};

      // APP_AUTH_RES (2101) -> Send ACCOUNT_AUTH_REQ (2102)
      if (msg.payloadType === 2101) {
        void this.send(2102, {
          ctidTraderAccountId: this.config.accountId,
          accessToken: this.config.accessToken,
        });
        return;
      }

      // ACCOUNT_AUTH_RES (2103) -> Send SYMBOLS_LIST_REQ (2114) for dynamic discovery
      if (msg.payloadType === 2103) {
        void this.send(2114, {
          ctidTraderAccountId: this.config.accountId,
          includeArchivedSymbols: false,
        });
        return;
      }

      // SYMBOLS_LIST_RES (2115) -> dynamic symbol discovery
      if (msg.payloadType === 2115) {
        const symbolArray = Array.isArray(payload.symbol) ? (payload.symbol as Array<{ symbolId: number; symbolName: string }>) : [];
        this.handleCatalogResponse(symbolArray);
        return;
      }

      // SPOT_EVENT (2131)
      if (msg.payloadType === 2131) {
        const symbolId = Number(payload.symbolId);
        const discovered = this.discoveredSymbols.find(s => s.symbolId === symbolId);
        if (!discovered) return;

        const bid = Number(payload.bid);
        const ask = Number(payload.ask);
        if (Number.isFinite(bid) && Number.isFinite(ask)) {
          const factor = Math.pow(10, discovered.digits || 5);
          const timestamp = Number(payload.timestamp || Date.now());
          this.ingestQuote(discovered.canonicalSymbol, bid / factor, ask / factor, timestamp < 1e12 ? timestamp * 1000 : timestamp);
        }
      }
    } catch {
      // Ignored malformed messages
    }
  }
}
