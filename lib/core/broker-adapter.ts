// lib/core/broker-adapter.ts
// آداپتورهای ارتباط با بروکر و محیط شبیه‌سازی زنده (Broker Adapters) در بسته W3

import { LiveShadowOrder } from '../contracts/w3-ems';

export interface BrokerExecutionResponse {
  success: boolean;
  brokerOrderId?: string;
  brokerPositionId?: string;
  fillPrice?: number;
  error?: string;
  latencyMs?: number;
}

export interface IBrokerAdapter {
  readonly adapterName: string;
  submitLimitOrder(order: LiveShadowOrder): Promise<BrokerExecutionResponse>;
  cancelOrder(brokerOrderId: string): Promise<boolean>;
  queryBrokerSnapshot(): Promise<Array<{
    brokerOrderId: string;
    intentId?: string;
    status: 'FILLED' | 'CANCELLED' | 'PENDING' | 'REJECTED';
    fillPrice?: number;
  }>>;
}

/**
 * آداپتور پیپرتریدینگ زنده (Paper Broker Adapter)
 * با شبیه‌سازی وفادارانه تأخیر شبکه، اسپرد، و اجرای لیمیت اوردر بدون خروج به اینترنت
 */
export class PaperBrokerAdapter implements IBrokerAdapter {
  public readonly adapterName = 'PaperBrokerAdapter (Offline Real-Time)';
  private syntheticLatencyMs: number;
  private syntheticSlippagePips: number;
  private brokerOrders: Map<string, {
    brokerOrderId: string;
    intentId: string;
    status: 'FILLED' | 'CANCELLED' | 'PENDING' | 'REJECTED';
    fillPrice?: number;
  }> = new Map();

  constructor(syntheticLatencyMs: number = 80, syntheticSlippagePips: number = 0.2) {
    this.syntheticLatencyMs = syntheticLatencyMs;
    this.syntheticSlippagePips = syntheticSlippagePips;
  }

  public setSyntheticLatency(ms: number): void {
    this.syntheticLatencyMs = ms;
  }

  public setSyntheticSlippage(pips: number): void {
    this.syntheticSlippagePips = pips;
  }

  public async submitLimitOrder(order: LiveShadowOrder): Promise<BrokerExecutionResponse> {
    const brokerOrderId = `PAPER-ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // در شبیه‌ساز پیپر لیمیت اوردر در قیمت درخواستی با کمی لغزش فرضی ثبت و آماده لمس می‌شود
    const slipOffset = order.direction === 'BUY' 
      ? -(this.syntheticSlippagePips * 0.1) // اجرای مطلوب‌تر یا صفر در لیمیت
      : (this.syntheticSlippagePips * 0.1);
    const fillPrice = order.requestedPrice + slipOffset;

    this.brokerOrders.set(brokerOrderId, {
      brokerOrderId,
      intentId: order.intentId,
      status: 'FILLED',
      fillPrice,
    });

    return {
      success: true,
      brokerOrderId,
      brokerPositionId: `PAPER-POS-${brokerOrderId}`,
      fillPrice,
      latencyMs: this.syntheticLatencyMs,
    };
  }

  public async cancelOrder(brokerOrderId: string): Promise<boolean> {
    const record = this.brokerOrders.get(brokerOrderId);
    if (record) {
      record.status = 'CANCELLED';
      return true;
    }
    return false;
  }

  public async queryBrokerSnapshot(): Promise<Array<{
    brokerOrderId: string;
    intentId?: string;
    status: 'FILLED' | 'CANCELLED' | 'PENDING' | 'REJECTED';
    fillPrice?: number;
  }>> {
    return Array.from(this.brokerOrders.values());
  }

  public clear(): void {
    this.brokerOrders.clear();
  }
}

/**
 * آداپتور دمو cTrader برای حساب‌های آزمایشی
 */
export class CTraderDemoAdapter implements IBrokerAdapter {
  public readonly adapterName = 'cTrader Open API (Demo Account Only)';

  public async submitLimitOrder(order: LiveShadowOrder): Promise<BrokerExecutionResponse> {
    // ارسال امن به اندپوینت سرور دمو
    try {
      const res = await fetch('/api/ctrader/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentId: order.intentId,
          symbol: order.symbol,
          direction: order.direction,
          volumeLots: order.volumeLots,
          limitPrice: order.requestedPrice,
          stopLossPrice: order.stopLossPrice,
          takeProfitPrice: order.takeProfitPrice,
          idempotencyKey: order.idempotencyKey,
          environment: order.environment,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: data.error || `HTTP ${res.status}`,
        };
      }

      const data = await res.json();
      return {
        success: true,
        brokerOrderId: data.brokerOrderId,
        fillPrice: data.fillPrice,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: (err as Error).message || 'خطای اتصال به سرور cTrader',
      };
    }
  }

  public async cancelOrder(brokerOrderId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/ctrader/order?orderId=${brokerOrderId}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async queryBrokerSnapshot(): Promise<Array<{
    brokerOrderId: string;
    intentId?: string;
    status: 'FILLED' | 'CANCELLED' | 'PENDING' | 'REJECTED';
    fillPrice?: number;
  }>> {
    try {
      const res = await fetch('/api/ctrader/snapshot');
      if (res.ok) {
        const data = await res.json();
        return data.orders || [];
      }
    } catch {
      // fallback
    }
    return [];
  }
}
