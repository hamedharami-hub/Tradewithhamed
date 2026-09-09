import { LiveMarketFeed } from '@/lib/server/live-market-feed';
import { DemoOrderCommand, mapExecutionType, NormalizedExecutionEvent, stateForExecution } from '@/lib/execution/ctrader-execution';
import { BrokerAccountSnapshot, BrokerSnapshotOrder, BrokerSnapshotPosition } from '@/lib/execution/reconciliation';
import { getGatewayConfig } from './config';
import { CTraderJsonMessage, GatewayCommandResult, GatewayConfig, GatewayQuote, GatewayState, GatewayStatus } from './contracts';
import { GatewayMessageQueue } from './message-queue';
import { MarketDataStore } from './market-data-store';

const PAYLOAD = {
  HEARTBEAT: 51,
  APP_AUTH_REQ: 2100,
  APP_AUTH_RES: 2101,
  ACCOUNT_AUTH_REQ: 2102,
  ACCOUNT_AUTH_RES: 2103,
  NEW_ORDER_REQ: 2106,
  RECONCILE_REQ: 2124,
  RECONCILE_RES: 2125,
  EXECUTION_EVENT: 2126,
  SUBSCRIBE_SPOTS_REQ: 2127,
  SUBSCRIBE_SPOTS_RES: 2128,
  SPOT_EVENT: 2131,
  ERROR_RES: 2142,
} as const;

type GatewaySocket = WebSocket;
const globalForGateway = globalThis as unknown as { ctraderDemoGateway?: CTraderDemoGateway };

export class CTraderDemoGateway {
  private socket: GatewaySocket | null = null;
  private config: GatewayConfig | null = null;
  private state: GatewayState = 'DISABLED';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatAt: number | null = null;
  private lastQuoteAt: number | null = null;
  private reconnectAttempts = 0;
  private lastError: string | undefined;
  private readonly queue = new GatewayMessageQueue(25);
  private readonly marketStore = MarketDataStore.getInstance();
  private readonly executionListeners = new Set<(event: NormalizedExecutionEvent) => void>();
  private readonly executionWaiters = new Map<string, Array<(event: NormalizedExecutionEvent) => void>>();
  private readonly connectionListeners = new Set<(connected: boolean) => void>();
  private readonly accountReadyListeners = new Set<() => void>();
  private readonly reconnectReadyListeners = new Set<() => void>();
  private readonly reconcileWaiters = new Map<string, (snapshot: BrokerAccountSnapshot) => void>();
  private hasCompletedInitialAuth = false;

  public static getInstance(): CTraderDemoGateway {
    if (!globalForGateway.ctraderDemoGateway) globalForGateway.ctraderDemoGateway = new CTraderDemoGateway();
    return globalForGateway.ctraderDemoGateway;
  }

  public start(): GatewayStatus {
    if (this.socket && this.state !== 'DISCONNECTED') return this.getStatus();
    const resolved = getGatewayConfig();
    this.config = resolved.config;
    if (!resolved.config) {
      this.state = 'DISABLED';
      this.lastError = resolved.reason;
      return this.getStatus();
    }
    this.reconnectAttempts = 0;
    this.connect();
    return this.getStatus();
  }

  public stop(): GatewayStatus {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.queue.rejectAll('Gateway متوقف شد.');
    this.socket?.close(1000, 'operator stop');
    this.socket = null;
    this.state = 'DISCONNECTED';
    return this.getStatus();
  }

  public getStatus(): GatewayStatus {
    return {
      state: this.state,
      configured: Boolean(this.config),
      connected: this.socket?.readyState === WebSocket.OPEN,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastQuoteAt: this.lastQuoteAt,
      reconnectAttempts: this.reconnectAttempts,
      subscribedSymbols: this.config?.symbols.map(item => item.symbol) || [],
      lastError: this.lastError,
    };
  }

  public getQuotes(): Record<string, GatewayQuote> {
    return this.marketStore.getAll(this.config?.staleAfterMs || 4000);
  }

  public onExecutionEvent(listener: (event: NormalizedExecutionEvent) => void): () => void {
    this.executionListeners.add(listener);
    return () => this.executionListeners.delete(listener);
  }

  public onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  public onAccountReady(listener: () => void): () => void {
    this.accountReadyListeners.add(listener);
    return () => this.accountReadyListeners.delete(listener);
  }

  public onReconnectReady(listener: () => void): () => void {
    this.reconnectReadyListeners.add(listener);
    return () => this.reconnectReadyListeners.delete(listener);
  }

  public waitForExecution(clientOrderId: string, timeoutMs = 15000): Promise<NormalizedExecutionEvent> {
    return new Promise((resolve, reject) => {
      const waiters = this.executionWaiters.get(clientOrderId) || [];
      waiters.push(resolve);
      this.executionWaiters.set(clientOrderId, waiters);
      setTimeout(() => {
        const current = this.executionWaiters.get(clientOrderId) || [];
        const index = current.indexOf(resolve);
        if (index >= 0) current.splice(index, 1);
        if (current.length === 0) this.executionWaiters.delete(clientOrderId);
        if (index >= 0) reject(new Error(`EXECUTION_EVENT_TIMEOUT: برای ${clientOrderId} رویداد اجرایی دریافت نشد.`));
      }, timeoutMs);
    });
  }

  public async requestReconcile(timeoutMs = 15000): Promise<BrokerAccountSnapshot> {
    const clientMsgId = `reconcile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.config) {
      throw new Error('BROKER_DISCONNECTED: Gateway برای reconciliation متصل نیست.');
    }
    const message: CTraderJsonMessage = {
      payloadType: PAYLOAD.RECONCILE_REQ,
      clientMsgId,
      payload: { ctidTraderAccountId: this.config.accountId, returnProtectionOrders: false },
    };
    return new Promise((resolve, reject) => {
      this.reconcileWaiters.set(clientMsgId, resolve);
      void this.queue.enqueue(message, outgoing => this.socket?.send(JSON.stringify(outgoing))).then(result => {
        if (!result.accepted) {
          this.reconcileWaiters.delete(clientMsgId);
          reject(new Error(result.error || 'RECONCILE_REQUEST_FAILED'));
        }
      });
      setTimeout(() => {
        if (this.reconcileWaiters.delete(clientMsgId)) reject(new Error('RECONCILE_TIMEOUT: پاسخ snapshot از بروکر دریافت نشد.'));
      }, timeoutMs);
    });
  }

  public async submitDemoLimitOrder(command: DemoOrderCommand): Promise<GatewayCommandResult> {
    return this.send(PAYLOAD.NEW_ORDER_REQ, {
      ctidTraderAccountId: command.accountId,
      symbolId: command.symbolId,
      orderType: 2,
      tradeSide: command.direction === 'BUY' ? 1 : 2,
      volume: Math.round(command.volumeLots * 100),
      limitPrice: command.limitPrice,
      stopLoss: command.stopLossPrice,
      takeProfit: command.takeProfitPrice,
      timeInForce: 2,
      label: 'hamed-trading-demo',
      clientOrderId: command.clientOrderId,
    });
  }

  public async send(payloadType: number, body: Record<string, unknown> = {}): Promise<GatewayCommandResult> {
    const clientMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const message: CTraderJsonMessage = { payloadType, clientMsgId, payload: body };
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return { accepted: false, clientMsgId, error: 'Gateway متصل نیست.' };
    }
    return this.queue.enqueue(message, outgoing => this.socket?.send(JSON.stringify(outgoing)));
  }

  private connect(): void {
    if (!this.config) return;
    this.state = this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING';
    const url = `wss://${this.config.host}:${this.config.port}`;
    try {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.lastError = undefined;
        this.state = 'CONNECTING';
        for (const listener of this.connectionListeners) listener(true);
        void this.send(PAYLOAD.APP_AUTH_REQ, {
          clientId: this.config?.clientId,
          clientSecret: process.env.CTRADER_CLIENT_SECRET,
        });
        this.startHeartbeat();
      };
      socket.onmessage = event => this.handleMessage(event.data);
      socket.onerror = () => {
        this.lastError = 'خطای شبکه در اتصال cTrader Gateway.';
        this.state = 'DEGRADED';
      };
      socket.onclose = () => {
        this.socket = null;
        for (const listener of this.connectionListeners) listener(false);
        if (this.state !== 'DISCONNECTED') this.scheduleReconnect();
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'ساخت اتصال WebSocket ناموفق بود.';
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.config || this.state === 'DISCONNECTED') return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.state = 'DEGRADED';
      this.lastError = 'حداکثر تلاش reconnect انجام شد.';
      return;
    }
    this.reconnectAttempts += 1;
    const backoff = Math.min(30000, 500 * 2 ** (this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => this.connect(), backoff);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.lastHeartbeatAt = Date.now();
      void this.send(PAYLOAD.HEARTBEAT);
    }, this.config?.heartbeatMs || 10000);
  }

  private handleMessage(raw: unknown): void {
    let message: CTraderJsonMessage;
    try {
      if (typeof raw !== 'string') {
        this.lastError = 'پیام باینری دریافت شد؛ codec Protobuf هنوز فعال نشده است.';
        this.state = 'DEGRADED';
        return;
      }
      message = JSON.parse(raw) as CTraderJsonMessage;
    } catch {
      this.lastError = 'پیام دریافتی cTrader JSON معتبر نیست.';
      this.state = 'DEGRADED';
      return;
    }
    const payload = message.payload || message;
    if (message.payloadType === PAYLOAD.HEARTBEAT) {
      this.lastHeartbeatAt = Date.now();
      return;
    }
    if (message.payloadType === PAYLOAD.APP_AUTH_RES) {
      this.state = 'APP_AUTHENTICATED';
      void this.send(PAYLOAD.ACCOUNT_AUTH_REQ, { ctidTraderAccountId: this.config?.accountId, accessToken: this.config?.accessToken });
      return;
    }
    if (message.payloadType === PAYLOAD.ACCOUNT_AUTH_RES) {
      this.state = 'ACCOUNT_AUTHENTICATED';
      for (const item of this.config?.symbols || []) {
        void this.send(PAYLOAD.SUBSCRIBE_SPOTS_REQ, { ctidTraderAccountId: this.config?.accountId, symbolId: item.symbolId, subscribeToSpotTimestamp: true });
      }
      this.state = 'SUBSCRIBED';
      if (this.hasCompletedInitialAuth) {
        for (const listener of this.reconnectReadyListeners) listener();
      } else {
        this.hasCompletedInitialAuth = true;
        for (const listener of this.accountReadyListeners) listener();
      }
      return;
    }
    if (message.payloadType === PAYLOAD.SPOT_EVENT) {
      this.handleSpotEvent(payload, message);
      return;
    }
    if (message.payloadType === PAYLOAD.EXECUTION_EVENT) {
      this.handleExecutionEvent(payload, message);
      return;
    }
    if (message.payloadType === PAYLOAD.RECONCILE_RES) {
      this.handleReconcileResponse(payload, message);
      return;
    }
    if (message.payloadType === PAYLOAD.ERROR_RES) {
      this.lastError = String(payload.description || payload.errorCode || 'خطای cTrader');
      this.state = 'DEGRADED';
    }
  }

  private handleSpotEvent(payload: Record<string, unknown>, envelope: CTraderJsonMessage): void {
    const symbolId = Number(payload.symbolId);
    const item = this.config?.symbols.find(symbol => symbol.symbolId === symbolId);
    const bid = Number(payload.bid);
    const ask = Number(payload.ask);
    if (!item || !Number.isFinite(bid) || !Number.isFinite(ask)) return;
    const timestamp = Number(payload.timestamp || Date.now());
    const quote: GatewayQuote = {
      symbol: item.symbol,
      bid: bid / 100000,
      ask: ask / 100000,
      timestamp: timestamp < 1e12 ? timestamp * 1000 : timestamp,
      receivedAt: Date.now(),
      quality: 'LIVE',
      source: 'CTRADER_DEMO',
      messageId: typeof envelope.clientMsgId === 'string' ? envelope.clientMsgId : undefined,
    };
    const normalized = this.marketStore.upsertQuote(quote);
    if (normalized.quality === 'LIVE') {
      this.lastQuoteAt = normalized.receivedAt;
      LiveMarketFeed.getInstance().injectLiveQuote({ symbol: normalized.symbol, bid: normalized.bid, ask: normalized.ask, spreadPips: Number(((normalized.ask - normalized.bid) * (normalized.symbol === 'XAUUSD' ? 10 : 10000)).toFixed(1)), timestamp: normalized.timestamp, quality: 'LIVE' });
    }
  }

  private handleReconcileResponse(payload: Record<string, unknown>, envelope: CTraderJsonMessage): void {
    const orders: BrokerSnapshotOrder[] = Array.isArray(payload.order) ? payload.order.map(item => {
      const order = item as Record<string, unknown>;
      return {
        brokerOrderId: String(order.orderId || ''),
        clientOrderId: typeof order.clientOrderId === 'string' ? order.clientOrderId : undefined,
        brokerPositionId: order.positionId !== undefined ? String(order.positionId) : undefined,
        state: 'ACKNOWLEDGED' as const,
        stopLossConfirmed: order.stopLoss !== undefined,
        takeProfitConfirmed: order.takeProfit !== undefined,
        raw: order,
      };
    }).filter(order => order.brokerOrderId) : [];
    const positions: BrokerSnapshotPosition[] = Array.isArray(payload.position) ? payload.position.map(item => {
      const position = item as Record<string, unknown>;
      return {
        brokerPositionId: String(position.positionId || ''),
        brokerOrderId: position.orderId !== undefined ? String(position.orderId) : undefined,
        stopLossConfirmed: position.stopLoss !== undefined,
        takeProfitConfirmed: position.takeProfit !== undefined,
        raw: position,
      };
    }).filter(position => position.brokerPositionId) : [];
    const snapshot: BrokerAccountSnapshot = {
      accountId: Number(payload.ctidTraderAccountId || this.config?.accountId || 0),
      receivedAt: Date.now(),
      orders,
      positions,
    };
    const waiter = envelope.clientMsgId ? this.reconcileWaiters.get(envelope.clientMsgId) : undefined;
    if (waiter && envelope.clientMsgId) {
      this.reconcileWaiters.delete(envelope.clientMsgId);
      waiter(snapshot);
    }
  }

  private handleExecutionEvent(payload: Record<string, unknown>, envelope: CTraderJsonMessage): void {
    const order = (payload.order || {}) as Record<string, unknown>;
    const position = (payload.position || {}) as Record<string, unknown>;
    const deal = (payload.deal || {}) as Record<string, unknown>;
    const executionType = mapExecutionType(payload.executionType);
    const event: NormalizedExecutionEvent = {
      accountId: Number(payload.ctidTraderAccountId || this.config?.accountId || 0),
      clientMsgId: envelope.clientMsgId,
      clientOrderId: typeof order.clientOrderId === 'string' ? order.clientOrderId : undefined,
      brokerOrderId: order.orderId !== undefined ? String(order.orderId) : undefined,
      brokerPositionId: position.positionId !== undefined ? String(position.positionId) : undefined,
      brokerDealId: deal.dealId !== undefined ? String(deal.dealId) : undefined,
      executionType,
      state: stateForExecution(executionType),
      fillPrice: deal.executionPrice !== undefined ? Number(deal.executionPrice) : undefined,
      filledVolumeUnits: deal.volume !== undefined ? Number(deal.volume) / 100 : undefined,
      stopLossConfirmed: order.stopLoss !== undefined || position.stopLoss !== undefined,
      takeProfitConfirmed: order.takeProfit !== undefined || position.takeProfit !== undefined,
      errorCode: typeof payload.errorCode === 'string' ? payload.errorCode : undefined,
      receivedAt: Date.now(),
      isServerEvent: payload.isServerEvent === true,
    };
    if (event.clientOrderId) {
      for (const resolve of this.executionWaiters.get(event.clientOrderId) || []) resolve(event);
      this.executionWaiters.delete(event.clientOrderId);
    }
    for (const listener of this.executionListeners) listener(event);
  }

  public resetForTesting(): void {
    this.stop();
    this.config = null;
    this.state = 'DISABLED';
    this.lastHeartbeatAt = null;
    this.lastQuoteAt = null;
    this.reconnectAttempts = 0;
    this.lastError = undefined;
    this.hasCompletedInitialAuth = false;
    this.marketStore.resetForTesting();
  }
}
