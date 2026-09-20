import { AppEnvironment, ENVIRONMENTS_CONFIG } from '../contracts/environment';
import { DataProvenance, isOriginAllowedForBrokerWrite, evaluateDataFreshness } from '../contracts/provenance';
import { SimulatedBroker } from './simulated-broker';
import { SymbolId } from '../contracts/market';
import { CandidateDirection } from '../contracts/strategy';
import { PartialTPConfig } from '../contracts/tactical-cockpit';

export interface EnvironmentState {
  symbol: SymbolId;
  currentStepIndex: number;
  accountBalance: number;
  accountEquity: number;
  updatedAt: number;
}

export interface EnvironmentJournalRecord {
  id: string;
  environment: AppEnvironment | 'LEGACY_UNKNOWN_ORIGIN';
  symbol: SymbolId;
  direction: CandidateDirection;
  volumeLots: number;
  entryPrice: number;
  exitPrice?: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  realizedPnl?: number;
  provenance: DataProvenance;
  timestamp: number;
  notesFa?: string;
}

export class PracticeExecutionAdapter {
  public readonly environment: AppEnvironment = 'PRACTICE';
  private broker: SimulatedBroker;

  constructor(initialBalance = 10000) {
    this.broker = new SimulatedBroker(initialBalance);
  }

  public getBroker(): SimulatedBroker {
    return this.broker;
  }

  public canExecuteBrokerOrder(): boolean {
    return false; // محیط تمرین دسترسی به نوشتن بروکر ندارد
  }

  public executeOrder(
    symbol: SymbolId,
    direction: CandidateDirection,
    volumeLots: number,
    entryPrice: number,
    stopLossPrice: number,
    takeProfitPrice: number,
    meta?: { mood?: string; propFirmId?: string }
  ) {
    return this.broker.createMarketBracketOrder(
      symbol,
      direction,
      volumeLots,
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      meta
    );
  }

  public submitToBroker(): never {
    throw new Error('SECURITY_VIOLATION: محیط تمرین مجوز ارسال سفارش به بروکر را ندارد.');
  }
}

export class ResearchExecutionAdapter {
  public readonly environment: AppEnvironment = 'RESEARCH';

  public canExecuteBrokerOrder(): boolean {
    return false; // محیط پژوهش دسترسی به نوشتن بروکر ندارد
  }

  public submitToBroker(): never {
    throw new Error('SECURITY_VIOLATION: محیط پژوهش تاریخی مجوز ارسال سفارش به بروکر را ندارد.');
  }
}

export class DemoExecutionAdapter {
  public readonly environment: AppEnvironment = 'DEMO';

  public canExecuteBrokerOrder(): boolean {
    return true;
  }

  public async submitOrder(
    provenance: DataProvenance,
    orderData: {
      intentId: string;
      idempotencyKey: string;
      symbol: SymbolId;
      direction: CandidateDirection;
      volumeLots: number;
      limitPrice: number;
      stopLossPrice: number;
      takeProfitPrice: number;
      userConfirmationTimestamp: number;
      executorSessionId?: string;
      executorEpoch?: number;
      deviceLabel?: 'windows' | 'pixel';
    }
  ) {
    // ۱. بررسی منشأ داده
    if (!isOriginAllowedForBrokerWrite(provenance.originType)) {
      throw new Error(
        `DATA_ORIGIN_INVALID: ثبت سفارش دمو با منبع «${provenance.originLabelFa}» مجاز نیست. فقط فید مستقیم بروکر مجاز است.`
      );
    }

    // ۲. بررسی تازگی داده
    const freshness = evaluateDataFreshness(provenance);
    if (freshness === 'STALE' || freshness === 'DISCONNECTED') {
      throw new Error(
        `STALE_DATA_BLOCKED: داده‌های دریافتی از بروکر قدیمی یا قطع شده‌اند (${freshness}). برای جلوگیری از معامله بر داده منقضی، ورود جدید مسدود است.`
      );
    }

    // ۳. ارسال به سرور OMS
    const response = await fetch('/api/orders/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...orderData,
        environment: 'BROKER_DEMO',
        dataProvenance: provenance,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'خطا در ثبت سفارش در سرور OMS بروکر دمو');
    }

    return data;
  }
}

/**
 * مدیریت ایزوله ذخیره‌سازی وضعیت و ژورنال برای هر محیط
 */
export class EnvironmentStorageManager {
  private static getKey(env: AppEnvironment, suffix: string): string {
    return `${ENVIRONMENTS_CONFIG[env].storageKeyPrefix}${suffix}`;
  }

  public static saveState(env: AppEnvironment, state: EnvironmentState): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.getKey(env, 'state'), JSON.stringify(state));
    } catch {}
  }

  public static loadState(env: AppEnvironment): EnvironmentState | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.getKey(env, 'state'));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public static saveJournal(env: AppEnvironment, records: EnvironmentJournalRecord[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.getKey(env, 'journal'), JSON.stringify(records));
    } catch {}
  }

  public static loadJournal(env: AppEnvironment): EnvironmentJournalRecord[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.getKey(env, 'journal'));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * بازیابی غیرمخرب داده‌های قدیمی بدون انتساب خودکار به دمو یا پژوهش
   */
  public static migrateLegacyRecords(): EnvironmentJournalRecord[] {
    if (typeof window === 'undefined') return [];
    try {
      const legacyRaw = localStorage.getItem('hamed_trading_lab_state_v2') || localStorage.getItem('hamed_trading_lab_state_v1');
      if (!legacyRaw) return [];
      const parsed = JSON.parse(legacyRaw);
      if (!parsed || !parsed.state) return [];
      
      const legacyRecord: EnvironmentJournalRecord = {
        id: `LEGACY-${parsed.exportedAt || Date.now()}`,
        environment: 'LEGACY_UNKNOWN_ORIGIN',
        symbol: parsed.state.symbol || 'XAUUSD',
        direction: 'BUY',
        volumeLots: 0.01,
        entryPrice: 0,
        stopLossPrice: 0,
        takeProfitPrice: 0,
        provenance: {
          originType: 'SAMPLE_FIXTURE',
          originLabelFa: 'قدیمی ـ منشأ نامشخص',
          datasetId: 'legacy-snapshot',
          symbol: parsed.state.symbol || 'XAUUSD',
          timeframe: '5M',
          timezone: 'UTC',
          lastReceivedAt: parsed.exportedAt || 0,
          freshnessStatus: 'UNKNOWN',
          stalenessThresholdMs: 300_000,
          isVerifiedRealData: false,
          notesFa: 'رکورد انتقال‌یافته از نسخه قدیمی سامانه بدون برچسب محیطی',
        },
        timestamp: parsed.exportedAt || Date.now(),
        notesFa: 'سوابق قدیمی با منشأ نامشخص (حفظ‌شده بدون انتساب به دمو)',
      };
      return [legacyRecord];
    } catch {
      return [];
    }
  }
}
