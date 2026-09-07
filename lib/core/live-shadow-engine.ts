// lib/core/live-shadow-engine.ts
// موتور مدیریت سفارش‌ها و اجرای زنده/پیپر (Live Shadow Execution Engine - W3)
// بر مبنای قراردادهای معماری نسخه ۴.۰ با تضمین‌های ایمنی سخت‌گیرانه:
// ۱. کلید ضد تکرار (Idempotency Guard)
// ۲. تک‌سفارش در حال ارسال همزمان (Single In-Flight Order Guard)
// ۳. الزام وجود حد ضرر و سود تاییدشده (Mandatory SL/TP Limit Orders)
// ۴. قفل ایمنی در صورت ابهام شبکه (Fail-Closed Reconcile Required)
// ۵. ثبت و ارزیابی کیفیت اجرا و لغزش قیمت (Execution Quality & Drift Monitoring)

import { OrderIntentPayload, PortfolioLedgerState, PositionLedgerEntry } from './ports';
import { LiveShadowOrder } from '../contracts/w3-ems';
import { ReconciliationEngine } from './reconciliation-engine';
import { DriftMonitor } from './drift-monitor';
import { IBrokerAdapter, PaperBrokerAdapter } from './broker-adapter';

export interface LiveShadowEngineConfig {
  initialCash: number;
  commissionPerLot: number;
  defaultSpreadPips: number;
  ackTimeoutMs: number;
  maxAcceptableSlippagePips: number;
  maxAcceptableLatencyMs: number;
}

export class LiveShadowExecutionEngine {
  private config: LiveShadowEngineConfig;
  private orders: Map<string, LiveShadowOrder> = new Map();
  private idempotencyMap: Map<string, string> = new Map(); // key -> intentId
  private reconciliationEngine: ReconciliationEngine;
  private driftMonitor: DriftMonitor;
  private brokerAdapter: IBrokerAdapter;
  private ledger: PortfolioLedgerState;

  constructor(
    config?: Partial<LiveShadowEngineConfig>,
    brokerAdapter?: IBrokerAdapter
  ) {
    this.config = {
      initialCash: config?.initialCash ?? 10000,
      commissionPerLot: config?.commissionPerLot ?? 6.0,
      defaultSpreadPips: config?.defaultSpreadPips ?? 1.5,
      ackTimeoutMs: config?.ackTimeoutMs ?? 3000,
      maxAcceptableSlippagePips: config?.maxAcceptableSlippagePips ?? 2.0,
      maxAcceptableLatencyMs: config?.maxAcceptableLatencyMs ?? 500,
    };

    this.reconciliationEngine = new ReconciliationEngine(this.config.ackTimeoutMs);
    this.driftMonitor = new DriftMonitor({
      maxAcceptableSlippagePips: this.config.maxAcceptableSlippagePips,
      maxAcceptableLatencyMs: this.config.maxAcceptableLatencyMs,
    });
    this.brokerAdapter = brokerAdapter ?? new PaperBrokerAdapter();

    this.ledger = {
      environment: 'PAPER_LIVE',
      accountNamespace: 'SHADOW_LIVE',
      initialCash: this.config.initialCash,
      cashBalance: this.config.initialCash,
      equity: this.config.initialCash,
      usedMargin: 0,
      freeMargin: this.config.initialCash,
      marginLevelPercent: 100,
      totalRealizedPnl: 0,
      totalUnrealizedPnl: 0,
      totalCommissions: 0,
      totalSwap: 0,
      positions: [],
      peakEquity: this.config.initialCash,
      maxDrawdownAmount: 0,
      maxDrawdownPercent: 0,
    };
  }

  /**
   * ثبت و اجرای سفارش در چرخه حیات مدیریت سفارش‌ها (W3 OMS)
   */
  public async submitOrder(
    intent: OrderIntentPayload,
    now: number = Date.now()
  ): Promise<{ success: boolean; order?: LiveShadowOrder; error?: string; isDuplicate?: boolean }> {
    // ۱. محافظت ضد تکرار (Idempotency Guard)
    if (this.idempotencyMap.has(intent.idempotencyKey)) {
      const existingIntentId = this.idempotencyMap.get(intent.idempotencyKey)!;
      const existingOrder = this.orders.get(existingIntentId);
      return {
        success: true,
        order: existingOrder,
        isDuplicate: true,
        error: 'درخواست تکراری شناسایی شد؛ سفارش قبلی بدون ارسال مجدد بازگردانده شد (Idempotency Guard).',
      };
    }

    // ۲. بررسی اصل قفل ایمنی (Fail-Closed Safety Guard)
    const gateCheck = this.reconciliationEngine.canSubmitNewOrder();
    if (!gateCheck.allowed) {
      return {
        success: false,
        error: gateCheck.reason,
      };
    }

    // ۳. بررسی قانون تک‌سفارش در حال پرواز (Single In-Flight Order Guard)
    const activeInFlight = Array.from(this.orders.values()).find(
      o => o.state === 'SUBMITTING' || o.state === 'ACKNOWLEDGED'
    );
    if (activeInFlight) {
      return {
        success: false,
        error: `قانون تک‌سفارش همزمان نقض شد: سفارش ${activeInFlight.intentId} در حال پردازش در شبکه است.`,
      };
    }

    // ۴. الزام سخت‌گیرانه وجود حد ضرر و حد سود منطقی (Mandatory SL/TP)
    if (!intent.stopLossPrice || !intent.takeProfitPrice || intent.stopLossPrice <= 0 || intent.takeProfitPrice <= 0) {
      return {
        success: false,
        error: 'سفارش لیمیت بدون تعیین قطعی حد ضرر و حد سود معتبر غیرمجاز است.',
      };
    }

    if (intent.direction === 'BUY') {
      if (intent.stopLossPrice >= intent.entryPrice || intent.takeProfitPrice <= intent.entryPrice) {
        return {
          success: false,
          error: 'در معامله خرید، حد ضرر باید پایین‌تر و حد سود بالاتر از قیمت ورود باشد.',
        };
      }
    } else {
      if (intent.stopLossPrice <= intent.entryPrice || intent.takeProfitPrice >= intent.entryPrice) {
        return {
          success: false,
          error: 'در معامله فروش، حد ضرر باید بالاتر و حد سود پایین‌تر از قیمت ورود باشد.',
        };
      }
    }

    // ایجاد موجودیت سفارش در وضعیت VALIDATED
    const shadowOrder: LiveShadowOrder = {
      id: `ORD-${intent.intentId}`,
      intentId: intent.intentId,
      correlationId: `CORR-${now}`,
      idempotencyKey: intent.idempotencyKey,
      environment: intent.environment,
      symbol: intent.symbol,
      direction: intent.direction,
      orderType: 'LIMIT',
      volumeLots: intent.volumeLots,
      requestedPrice: intent.entryPrice,
      stopLossPrice: intent.stopLossPrice,
      takeProfitPrice: intent.takeProfitPrice,
      maxSlippagePips: intent.maxSlippagePips ?? this.config.maxAcceptableSlippagePips,
      state: 'VALIDATED',
      createdAt: now,
      validatedAt: now,
      reasonCode: intent.reasonCode,
    };

    // ثبت در حافظه و نگاشت کلید ضد تکرار
    this.orders.set(shadowOrder.intentId, shadowOrder);
    this.idempotencyMap.set(intent.idempotencyKey, shadowOrder.intentId);

    // ۵. انتقال قطعی به SUBMITTING قبل از تماس با آداپتور شبکه
    shadowOrder.state = 'SUBMITTING';
    shadowOrder.submittedAt = now;

    try {
      const brokerResponse = await this.brokerAdapter.submitLimitOrder(shadowOrder);

      if (!brokerResponse.success) {
        shadowOrder.state = 'REJECTED';
        shadowOrder.brokerError = brokerResponse.error;
        return {
          success: false,
          order: shadowOrder,
          error: brokerResponse.error || 'سفارش توسط بروکر رد شد.',
        };
      }

      // دریافت تاییدیه (ACKNOWLEDGED)
      const ackTimestamp = now + (brokerResponse.latencyMs ?? 50);
      shadowOrder.state = 'ACKNOWLEDGED';
      shadowOrder.acknowledgedAt = ackTimestamp;
      shadowOrder.brokerOrderId = brokerResponse.brokerOrderId;
      shadowOrder.brokerPositionId = brokerResponse.brokerPositionId;

      // اگر آداپتور اجرای آنی را شبیه‌سازی کرد
      if (brokerResponse.fillPrice) {
        const fillTimestamp = ackTimestamp + 20;
        this.fillOrder(shadowOrder, brokerResponse.fillPrice, fillTimestamp);
      }

      return {
        success: true,
        order: shadowOrder,
      };
    } catch (netErr: unknown) {
      // بروز خطای مبهم یا تایم‌اوت در شبکه -> ثبت سانحه و انتقال به UNKNOWN_RECONCILE_REQUIRED
      const notes = (netErr as Error).message || 'تایم‌اوت ارتباط با بروکر پس از ارسال';
      this.reconciliationEngine.registerIncident(
        shadowOrder,
        'TIMEOUT',
        notes,
        now
      );

      return {
        success: false,
        order: shadowOrder,
        error: `خطای شبکه پس از ارسال سفارش! وضعیت سفارش به صورت خودکار به UNKNOWN_RECONCILE_REQUIRED تغییر یافت و سیستم برای حفظ امنیت قفل شد.`,
      };
    }
  }

  /**
   * اجرای قطعی سفارش (Fill Execution) و به‌روزرسانی دفترکل دارایی
   */
  public fillOrder(
    order: LiveShadowOrder,
    fillPrice: number,
    filledTimestamp: number
  ): void {
    order.state = 'FILLED';
    order.filledAt = filledTimestamp;

    // محاسبه شاخص کیفیت اجرا و ارزیابی لغزش (EQS)
    const metric = this.driftMonitor.evaluateExecution({
      symbol: order.symbol,
      direction: order.direction,
      requestedPrice: order.requestedPrice,
      executedPrice: fillPrice,
      submittedAt: order.submittedAt ?? filledTimestamp,
      acknowledgedAt: order.acknowledgedAt ?? filledTimestamp,
      filledAt: filledTimestamp,
      spreadPipsAtExecution: this.config.defaultSpreadPips,
    });
    order.qualityMetric = metric;

    // اعمال کارمزد و ثبت پوزیشن در دفترکل
    const commission = order.volumeLots * this.config.commissionPerLot;
    this.ledger.cashBalance -= commission;
    this.ledger.totalCommissions += commission;

    const position: PositionLedgerEntry = {
      positionId: `POS-${order.intentId}`,
      intentId: order.intentId,
      environment: order.environment,
      symbol: order.symbol,
      direction: order.direction,
      volumeLots: order.volumeLots,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      stopLossPrice: order.stopLossPrice,
      takeProfitPrice: order.takeProfitPrice,
      unrealizedPnl: 0,
      realizedPnl: 0,
      commissionPaid: commission,
      financingSwap: 0,
      isOpen: true,
      openedTimestamp: filledTimestamp,
      maePips: 0,
      mfePips: 0,
    };

    this.ledger.positions.push(position);
    this.updateLedgerEquity(fillPrice);
  }

  /**
   * بررسی دوره‌ای تایم‌اوت‌های شبکه در سفارش‌های معلق
   */
  public checkTimeouts(now: number = Date.now()): number {
    let timedOutCount = 0;
    for (const order of this.orders.values()) {
      if (this.reconciliationEngine.isOrderTimedOut(order, now)) {
        this.reconciliationEngine.registerIncident(
          order,
          'TIMEOUT',
          `عدم دریافت پاسخ پذیرش سفارش (Ack) پس از ${this.config.ackTimeoutMs} میلی‌ثانیه`,
          now
        );
        timedOutCount++;
      }
    }
    return timedOutCount;
  }

  /**
   * اجرای بازتطبیق با فهرست سفارش‌های بروکر
   */
  public async reconcile(now: number = Date.now()): Promise<{
    reconciledCount: number;
    remainingUnknown: number;
  }> {
    const brokerSnapshot = await this.brokerAdapter.queryBrokerSnapshot();
    const result = this.reconciliationEngine.reconcileWithBrokerState(
      Array.from(this.orders.values()),
      brokerSnapshot,
      now
    );
    return result;
  }

  /**
   * تایید دستی و بازتطبیق اضطراری توسط کاربر
   */
  public manualReconcileIncident(
    incidentId: string,
    forcedState: 'CANCELLED' | 'RECONCILED',
    notes: string,
    now: number = Date.now()
  ): boolean {
    return this.reconciliationEngine.manualOverride(
      incidentId,
      Array.from(this.orders.values()),
      forcedState,
      now,
      notes
    );
  }

  /**
   * به‌روزرسانی ارزش دارایی پرتفوی
   */
  private updateLedgerEquity(currentPrice: number): void {
    let unrealized = 0;
    for (const pos of this.ledger.positions) {
      if (!pos.isOpen) continue;
      pos.currentPrice = currentPrice;
      const pipSize = DriftMonitor.getPipSize(pos.symbol);
      const diff = pos.direction === 'BUY'
        ? (currentPrice - pos.entryPrice)
        : (pos.entryPrice - currentPrice);
      const pips = diff / pipSize;
      pos.unrealizedPnl = pips * pos.volumeLots * 10;
      unrealized += pos.unrealizedPnl;
    }
    this.ledger.totalUnrealizedPnl = unrealized;
    this.ledger.equity = this.ledger.cashBalance + unrealized;
  }

  public getOrders(): LiveShadowOrder[] {
    return Array.from(this.orders.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getLedger(): PortfolioLedgerState {
    return { ...this.ledger, positions: [...this.ledger.positions] };
  }

  public getReconciliationEngine(): ReconciliationEngine {
    return this.reconciliationEngine;
  }

  public getDriftMonitor(): DriftMonitor {
    return this.driftMonitor;
  }

  public resetForTesting(): void {
    this.orders.clear();
    this.idempotencyMap.clear();
    this.reconciliationEngine.clear();
    this.driftMonitor.clear();
    this.ledger.cashBalance = this.config.initialCash;
    this.ledger.equity = this.config.initialCash;
    this.ledger.positions = [];
    this.ledger.totalCommissions = 0;
    this.ledger.totalRealizedPnl = 0;
  }
}
