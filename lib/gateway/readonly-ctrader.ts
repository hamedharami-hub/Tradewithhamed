import type { SymbolId } from '@/lib/contracts/market';

/**
 * This module is deliberately separate from the write-capable demo gateway.
 * Its outbound protocol allowlist contains only authentication and market-data
 * requests. Trading, account mutation, reconciliation and order payloads are
 * structurally unreachable from the Stage 8 monitor.
 */
export const READ_ONLY_CTRADER_HOST = 'demo.ctraderapi.com';
export const READ_ONLY_CTRADER_JSON_PORT = 5036;

export const READ_ONLY_PAYLOAD = {
  HEARTBEAT: 51,
  APPLICATION_AUTH_REQUEST: 2100,
  APPLICATION_AUTH_RESPONSE: 2101,
  ACCOUNT_AUTH_REQUEST: 2102,
  ACCOUNT_AUTH_RESPONSE: 2103,
  SYMBOLS_LIST_REQUEST: 2114,
  SYMBOLS_LIST_RESPONSE: 2115,
  SYMBOL_BY_ID_REQUEST: 2116,
  SYMBOL_BY_ID_RESPONSE: 2117,
  GET_ACCOUNTS_REQUEST: 2149,
  GET_ACCOUNTS_RESPONSE: 2150,
  SUBSCRIBE_SPOTS_REQUEST: 2127,
  SUBSCRIBE_SPOTS_RESPONSE: 2128,
  UNSUBSCRIBE_SPOTS_REQUEST: 2129,
  UNSUBSCRIBE_SPOTS_RESPONSE: 2130,
  SPOT_EVENT: 2131,
  ERROR_RESPONSE: 2142,
  /** A broker write. It is exported only so tests can prove it is rejected. */
  NEW_ORDER_REQUEST: 2106,
} as const;

const READ_ONLY_OUTBOUND = new Set<number>([
  READ_ONLY_PAYLOAD.HEARTBEAT,
  READ_ONLY_PAYLOAD.APPLICATION_AUTH_REQUEST,
  READ_ONLY_PAYLOAD.ACCOUNT_AUTH_REQUEST,
  READ_ONLY_PAYLOAD.SYMBOLS_LIST_REQUEST,
  READ_ONLY_PAYLOAD.SYMBOL_BY_ID_REQUEST,
  READ_ONLY_PAYLOAD.GET_ACCOUNTS_REQUEST,
  READ_ONLY_PAYLOAD.SUBSCRIBE_SPOTS_REQUEST,
  READ_ONLY_PAYLOAD.UNSUBSCRIBE_SPOTS_REQUEST,
]);

export type ReadOnlyGatewayState =
  | 'DISABLED'
  | 'CONNECTING'
  | 'APPLICATION_AUTHENTICATED'
  | 'ACCOUNT_AUTHENTICATED'
  | 'DISCOVERING_SYMBOLS'
  | 'SUBSCRIBED'
  | 'DEGRADED'
  | 'STOPPED';

export interface ReadOnlyCTraderConfig {
  host: typeof READ_ONLY_CTRADER_HOST;
  port: typeof READ_ONLY_CTRADER_JSON_PORT;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  accountId: number;
  requestedSymbols: SymbolId[];
  heartbeatMs: number;
  staleAfterMs: number;
}

export interface ReadOnlyConfigResult {
  configured: boolean;
  config: ReadOnlyCTraderConfig | null;
  reason?: string;
  safetyChecks: {
    demoEnvironment: boolean;
    readOnlyRunFlag: boolean;
    readOnlyRequireFlag: boolean;
    liveEnableDisabled: boolean;
    fixedJsonEndpoint: boolean;
    credentialsPresent: boolean;
  };
}

export interface DiscoveredSymbol {
  symbol: SymbolId;
  cTraderSymbolId: number;
  providerSymbol: string;
  enabled: boolean;
  description?: string;
}

export interface ReadOnlyQuote {
  symbol: SymbolId;
  bid: number;
  ask: number;
  timestamp: number;
  receivedAt: number;
  providerSymbol: string;
}

export interface ReadOnlyGatewayStatus {
  state: ReadOnlyGatewayState;
  connected: boolean;
  accountAuthorized: boolean;
  permissionScope?: 'SCOPE_VIEW';
  lastHeartbeatAt: number | null;
  lastQuoteAt: number | null;
  lastError?: string;
  discoveredSymbols: DiscoveredSymbol[];
  unavailableSymbols: SymbolId[];
  brokerWrites: false;
}

type Environment = Record<string, string | undefined>;
type CTraderMessage = { payloadType?: unknown; clientMsgId?: unknown; payload?: unknown; [key: string]: unknown };

const SYMBOL_ALIASES: Record<SymbolId, string[]> = {
  XAUUSD: ['XAUUSD', 'XAU/USD', 'GOLDUSD'],
  EURUSD: ['EURUSD', 'EUR/USD'],
  GBPUSD: ['GBPUSD', 'GBP/USD'],
  USDJPY: ['USDJPY', 'USD/JPY'],
  BTCUSD: ['BTCUSD', 'BTC/USD', 'XBTUSD', 'XBT/USD'],
};

function normaliseSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function canonicalMonitorSymbol(value: string): SymbolId | null {
  const normalized = normaliseSymbol(value);
  return (Object.keys(SYMBOL_ALIASES) as SymbolId[]).find(symbol => SYMBOL_ALIASES[symbol].some(alias => {
    const normalizedAlias = normaliseSymbol(alias);
    return normalizedAlias === normalized || normalized.startsWith(normalizedAlias);
  })) || null;
}

export function parseRequestedMonitorSymbols(value: string | undefined): SymbolId[] {
  const raw = (value || 'GBPUSD,EURUSD,USDJPY,XAUUSD,BTCUSD').split(',').map(item => item.trim()).filter(Boolean);
  const symbols = raw.map(canonicalMonitorSymbol);
  if (symbols.some(symbol => !symbol)) {
    throw new Error(`MONITOR_SYMBOLS شامل نماد پشتیبانی‌نشده است: ${raw.join(', ')}`);
  }
  return [...new Set(symbols as SymbolId[])];
}

function asEnabled(value: string | undefined): boolean {
  return value?.trim() === '1' || value?.trim().toLowerCase() === 'true';
}

export function getReadOnlyCTraderConfig(environment: Environment = process.env): ReadOnlyConfigResult {
  const environmentName = environment.CTRADER_ENVIRONMENT?.trim().toLowerCase();
  const clientId = environment.CTRADER_CLIENT_ID?.trim();
  const clientSecret = environment.CTRADER_CLIENT_SECRET?.trim();
  const accessToken = environment.CTRADER_ACCESS_TOKEN?.trim();
  const accountId = Number(environment.CTRADER_ACCOUNT_ID);
  const requestedHost = environment.CTRADER_GATEWAY_HOST?.trim() || READ_ONLY_CTRADER_HOST;
  const requestedPort = Number(environment.CTRADER_GATEWAY_PORT || READ_ONLY_CTRADER_JSON_PORT);
  const safetyChecks = {
    demoEnvironment: environmentName === 'demo',
    readOnlyRunFlag: environment.RUN_CTRADER?.trim() === '1',
    readOnlyRequireFlag: environment.REQUIRE_CTRADER?.trim() === '1',
    liveEnableDisabled: !asEnabled(environment.CTRADER_LIVE_ENABLE),
    fixedJsonEndpoint: requestedHost === READ_ONLY_CTRADER_HOST && requestedPort === READ_ONLY_CTRADER_JSON_PORT,
    credentialsPresent: Boolean(clientId && clientSecret && accessToken && Number.isInteger(accountId) && accountId > 0),
  };
  const failed = Object.entries(safetyChecks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    return {
      configured: false,
      config: null,
      reason: `CTRADER_READ_ONLY_PREFLIGHT_FAILED:${failed.join(',')}`,
      safetyChecks,
    };
  }
  try {
    return {
      configured: true,
      config: {
        host: READ_ONLY_CTRADER_HOST,
        port: READ_ONLY_CTRADER_JSON_PORT,
        clientId: clientId!,
        clientSecret: clientSecret!,
        accessToken: accessToken!,
        accountId,
        requestedSymbols: parseRequestedMonitorSymbols(environment.MONITOR_SYMBOLS),
        heartbeatMs: 10_000,
        staleAfterMs: 4_000,
      },
      safetyChecks,
    };
  } catch (error) {
    return {
      configured: false,
      config: null,
      reason: error instanceof Error ? error.message : 'MONITOR_SYMBOLS_INVALID',
      safetyChecks,
    };
  }
}

export function isReadOnlyOutboundPayload(payloadType: number): boolean {
  return READ_ONLY_OUTBOUND.has(payloadType);
}

export function assertReadOnlyOutboundPayload(payloadType: number): void {
  if (!isReadOnlyOutboundPayload(payloadType)) {
    throw new Error(`CTRADER_READ_ONLY_PAYLOAD_BLOCKED:${payloadType}`);
  }
}

export function mapDiscoveredSymbols(items: unknown[], requestedSymbols: SymbolId[]): { available: DiscoveredSymbol[]; unavailable: SymbolId[] } {
  const byCanonical = new Map<SymbolId, DiscoveredSymbol>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const providerSymbol = typeof record.symbolName === 'string' ? record.symbolName : typeof record.name === 'string' ? record.name : '';
    const symbol = canonicalMonitorSymbol(providerSymbol);
    const id = Number(record.symbolId);
    const enabled = record.enabled !== false;
    if (!symbol || !Number.isInteger(id) || id <= 0 || !enabled || !requestedSymbols.includes(symbol)) continue;
    if (!byCanonical.has(symbol)) {
      byCanonical.set(symbol, {
        symbol,
        cTraderSymbolId: id,
        providerSymbol,
        enabled,
        ...(typeof record.description === 'string' ? { description: record.description } : {}),
      });
    }
  }
  const available = requestedSymbols.flatMap(symbol => {
    const item = byCanonical.get(symbol);
    return item ? [item] : [];
  });
  return { available, unavailable: requestedSymbols.filter(symbol => !byCanonical.has(symbol)) };
}

function recordPayload(message: CTraderMessage): Record<string, unknown> {
  return message.payload && typeof message.payload === 'object'
    ? message.payload as Record<string, unknown>
    : message as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isViewOnlyScope(value: unknown): boolean {
  return value === 0 || value === '0' || value === 'SCOPE_VIEW';
}

/**
 * Read-only WebSocket client for cTrader's JSON endpoint. No public generic
 * send method exists; all outbound messages pass through the static allowlist.
 */
export class ReadOnlyCTraderClient {
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private state: ReadOnlyGatewayState = 'DISABLED';
  private lastHeartbeatAt: number | null = null;
  private lastQuoteAt: number | null = null;
  private lastError: string | undefined;
  private accountAuthorized = false;
  private discovered: DiscoveredSymbol[] = [];
  private unavailable: SymbolId[] = [];
  private readonly quotes = new Map<number, ReadOnlyQuote>();
  private readonly quoteListeners = new Set<(quote: ReadOnlyQuote) => void>();
  private readonly statusListeners = new Set<(status: ReadOnlyGatewayStatus) => void>();
  private readonly discoveryListeners = new Set<(symbols: { available: DiscoveredSymbol[]; unavailable: SymbolId[] }) => void>();

  public constructor(private readonly config: ReadOnlyCTraderConfig) {}

  public onQuote(listener: (quote: ReadOnlyQuote) => void): () => void {
    this.quoteListeners.add(listener);
    return () => this.quoteListeners.delete(listener);
  }

  public onStatus(listener: (status: ReadOnlyGatewayStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public onSymbolDiscovery(listener: (symbols: { available: DiscoveredSymbol[]; unavailable: SymbolId[] }) => void): () => void {
    this.discoveryListeners.add(listener);
    return () => this.discoveryListeners.delete(listener);
  }

  public getStatus(): ReadOnlyGatewayStatus {
    return {
      state: this.state,
      connected: this.socket?.readyState === WebSocket.OPEN,
      accountAuthorized: this.accountAuthorized,
      ...(this.accountAuthorized ? { permissionScope: 'SCOPE_VIEW' as const } : {}),
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastQuoteAt: this.lastQuoteAt,
      ...(this.lastError ? { lastError: this.lastError } : {}),
      discoveredSymbols: this.discovered,
      unavailableSymbols: this.unavailable,
      brokerWrites: false,
    };
  }

  public start(): ReadOnlyGatewayStatus {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) return this.getStatus();
    this.state = 'CONNECTING';
    this.emitStatus();
    try {
      this.socket = new WebSocket(`wss://${this.config.host}:${this.config.port}`);
      this.socket.onopen = () => {
        this.lastError = undefined;
        this.sendReadOnly(READ_ONLY_PAYLOAD.APPLICATION_AUTH_REQUEST, {
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret,
        });
        this.startHeartbeat();
      };
      this.socket.onmessage = event => this.handleMessage(String(event.data));
      this.socket.onerror = () => this.fail('CTRADER_READ_ONLY_SOCKET_ERROR');
      this.socket.onclose = () => {
        if (this.state !== 'STOPPED') this.fail('CTRADER_READ_ONLY_SOCKET_CLOSED');
      };
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'CTRADER_READ_ONLY_SOCKET_CREATE_FAILED');
    }
    return this.getStatus();
  }

  public stop(): ReadOnlyGatewayStatus {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.state = 'STOPPED';
    this.socket?.close(1000, 'stage8-read-only-stop');
    this.socket = null;
    this.emitStatus();
    return this.getStatus();
  }

  private startHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      this.lastHeartbeatAt = Date.now();
      this.sendReadOnly(READ_ONLY_PAYLOAD.HEARTBEAT, {});
    }, this.config.heartbeatMs);
  }

  private sendReadOnly(payloadType: number, payload: Record<string, unknown>): void {
    assertReadOnlyOutboundPayload(payloadType);
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.fail('CTRADER_READ_ONLY_SOCKET_NOT_OPEN');
      return;
    }
    this.socket.send(JSON.stringify({
      payloadType,
      clientMsgId: `readonly_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      payload,
    }));
  }

  private handleMessage(raw: string): void {
    let message: CTraderMessage;
    try {
      message = JSON.parse(raw) as CTraderMessage;
    } catch {
      this.fail('CTRADER_READ_ONLY_INVALID_JSON');
      return;
    }
    const payloadType = Number(message.payloadType);
    const payload = recordPayload(message);
    if (payloadType === READ_ONLY_PAYLOAD.APPLICATION_AUTH_RESPONSE) {
      this.state = 'APPLICATION_AUTHENTICATED';
      this.sendReadOnly(READ_ONLY_PAYLOAD.GET_ACCOUNTS_REQUEST, { accessToken: this.config.accessToken });
      this.emitStatus();
      return;
    }
    if (payloadType === READ_ONLY_PAYLOAD.GET_ACCOUNTS_RESPONSE) {
      const accounts = asArray(payload.ctidTraderAccount);
      const authorizedDemoAccount = accounts.some(item => {
        if (!item || typeof item !== 'object') return false;
        const account = item as Record<string, unknown>;
        return Number(account.ctidTraderAccountId) === this.config.accountId && account.isLive !== true;
      });
      if (!isViewOnlyScope(payload.permissionScope) || !authorizedDemoAccount) {
        this.fail('CTRADER_READ_ONLY_SCOPE_OR_DEMO_ACCOUNT_REJECTED');
        return;
      }
      this.sendReadOnly(READ_ONLY_PAYLOAD.ACCOUNT_AUTH_REQUEST, {
        ctidTraderAccountId: this.config.accountId,
        accessToken: this.config.accessToken,
      });
      return;
    }
    if (payloadType === READ_ONLY_PAYLOAD.ACCOUNT_AUTH_RESPONSE) {
      this.accountAuthorized = true;
      this.state = 'ACCOUNT_AUTHENTICATED';
      this.sendReadOnly(READ_ONLY_PAYLOAD.SYMBOLS_LIST_REQUEST, {
        ctidTraderAccountId: this.config.accountId,
        includeArchivedSymbols: false,
      });
      this.state = 'DISCOVERING_SYMBOLS';
      this.emitStatus();
      return;
    }
    if (payloadType === READ_ONLY_PAYLOAD.SYMBOLS_LIST_RESPONSE) {
      const mapped = mapDiscoveredSymbols(asArray(payload.symbol), this.config.requestedSymbols);
      this.discovered = mapped.available;
      this.unavailable = mapped.unavailable;
      for (const listener of this.discoveryListeners) listener(mapped);
      if (!mapped.available.length) {
        this.fail('CTRADER_READ_ONLY_NO_REQUESTED_SYMBOLS_AVAILABLE');
        return;
      }
      this.sendReadOnly(READ_ONLY_PAYLOAD.SUBSCRIBE_SPOTS_REQUEST, {
        ctidTraderAccountId: this.config.accountId,
        symbolId: mapped.available.map(item => item.cTraderSymbolId),
        subscribeToSpotTimestamp: true,
      });
      this.state = 'SUBSCRIBED';
      this.emitStatus();
      return;
    }
    if (payloadType === READ_ONLY_PAYLOAD.SPOT_EVENT) {
      this.handleSpot(payload);
      return;
    }
    if (payloadType === READ_ONLY_PAYLOAD.ERROR_RESPONSE) {
      this.fail(`CTRADER_READ_ONLY_API_ERROR:${String(payload.description || payload.errorCode || 'UNKNOWN')}`);
    }
  }

  private handleSpot(payload: Record<string, unknown>): void {
    const symbolId = Number(payload.symbolId);
    const discovered = this.discovered.find(item => item.cTraderSymbolId === symbolId);
    const bid = Number(payload.bid);
    const ask = Number(payload.ask);
    if (!discovered || !Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= bid) return;
    const rawTimestamp = Number(payload.timestamp || Date.now());
    const quote: ReadOnlyQuote = {
      symbol: discovered.symbol,
      bid: bid / 100000,
      ask: ask / 100000,
      timestamp: rawTimestamp < 1e12 ? rawTimestamp * 1000 : rawTimestamp,
      receivedAt: Date.now(),
      providerSymbol: discovered.providerSymbol,
    };
    this.quotes.set(symbolId, quote);
    this.lastQuoteAt = quote.receivedAt;
    for (const listener of this.quoteListeners) listener(quote);
  }

  private fail(reason: string): void {
    this.lastError = reason;
    this.state = 'DEGRADED';
    this.emitStatus();
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) listener(status);
  }
}
