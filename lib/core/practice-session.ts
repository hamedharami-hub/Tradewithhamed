import { SymbolId } from '../contracts/market';
import { SimulatedOrder, SimulatedPosition } from '../contracts/orders';

export interface PracticeSessionConfig {
  enablePartialTp: boolean;
  selectedRiskPercent: number;
}

export interface PracticeSession {
  sessionId: string;
  schemaVersion: '2.0';
  symbol: SymbolId;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: number;
  endedAt?: number;
  initialBalance: number;
  accountBalance: number;
  accountEquity: number;
  currentStepIndex: number;
  isFreezeNewEntries: boolean;
  config: PracticeSessionConfig;
  orders: SimulatedOrder[];
  positions: SimulatedPosition[];
  discardedOpenPositionsCount: number;
  lastMarketTimestamp?: number;
  orderSequence: number;
  archiveNoteFa?: string;
}

export const ACTIVE_SESSION_STORAGE_KEY = 'tradewithhamed_practice_v2_active_session';
export const ARCHIVED_SESSIONS_STORAGE_KEY = 'tradewithhamed_practice_v2_sessions_archive';

class InMemoryStorage {
  private store = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  public removeItem(key: string): void {
    this.store.delete(key);
  }
  public clear(): void {
    this.store.clear();
  }
}

const fallbackStorage = new InMemoryStorage();

function getStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return fallbackStorage;
}

export class PracticeSessionManager {
  /**
   * ایجاد نشست تمرینی جدید با مقداردهی اولیه ایزوله
   */
  public static createNewSession(
    symbol: SymbolId = 'XAUUSD',
    initialBalance = 10000,
    config: Partial<PracticeSessionConfig> = {}
  ): PracticeSession {
    const now = Date.now();
    const sessionId = `practice-${symbol.toLowerCase()}-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const initialStep = symbol === 'XAUUSD' ? 95 : 80;

    return {
      sessionId,
      schemaVersion: '2.0',
      symbol,
      status: 'ACTIVE',
      createdAt: now,
      initialBalance,
      accountBalance: initialBalance,
      accountEquity: initialBalance,
      currentStepIndex: initialStep,
      isFreezeNewEntries: false,
      config: {
        enablePartialTp: config.enablePartialTp ?? false,
        selectedRiskPercent: config.selectedRiskPercent ?? 0.25,
      },
      orders: [],
      positions: [],
      discardedOpenPositionsCount: 0,
      orderSequence: 0,
    };
  }

  /**
   * ذخیره نشست فعال با مدیریت و گزارش خطاهای احتمالی ذخیره‌سازی
   */
  public static saveActiveSession(session: PracticeSession): { success: boolean; error?: string } {
    try {
      const storage = getStorage();
      const serialized = JSON.stringify(session);
      storage.setItem(ACTIVE_SESSION_STORAGE_KEY, serialized);
      return { success: true };
    } catch (err) {
      const errorMsg = (err as Error).name === 'QuotaExceededError'
        ? 'خطای ذخیره‌سازی: حافظه محلی مرورگر پر است.'
        : `خطا در ذخیره نشست تمرینی: ${(err as Error).message}`;
      console.error('[PracticeSessionManager] saveActiveSession error:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * بارگذاری نشست فعال با اعتبارسنجی نسخه و یکپارچگی داده‌ها
   */
  public static loadActiveSession(): PracticeSession | null {
    try {
      const storage = getStorage();
      const raw = storage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);

      if (!parsed || parsed.schemaVersion !== '2.0' || !parsed.sessionId || !parsed.symbol) {
        console.warn('[PracticeSessionManager] داده‌های ذخیره‌شده نامعتبر یا قدیمی هستند؛ نشست جدید شروع می‌شود.');
        return null;
      }

      return parsed as PracticeSession;
    } catch (err) {
      console.error('[PracticeSessionManager] loadActiveSession JSON parse error:', err);
      return null;
    }
  }

  /**
   * بایگانی نشست جاری و جداسازی وضعیت معاملات باز پایان‌یافته
   */
  public static archiveSession(session: PracticeSession, noteFa?: string): PracticeSession {
    const now = Date.now();
    const openPositions = session.positions.filter(p => p.isOpen);
    const discardedCount = openPositions.length;

    // معاملات باز نشست پایان‌یافته نباید به دروغ «بسته در بازار» معرفی شوند
    const sanitizedPositions: SimulatedPosition[] = session.positions.map(p => {
      if (p.isOpen) {
        return {
          ...p,
          isOpen: false,
          closedAt: now,
          closeReason: 'SESSION_ENDED',
          exitPrice: p.currentPrice,
        };
      }
      return p;
    });

    const archivedSession: PracticeSession = {
      ...session,
      status: 'ARCHIVED',
      endedAt: now,
      positions: sanitizedPositions,
      discardedOpenPositionsCount: discardedCount,
      archiveNoteFa: noteFa || (discardedCount > 0 ? `نشست با ${discardedCount} معامله باز بایگانی شد.` : 'نشست تمرینی به صورت عادی بایگانی شد.'),
    };

    try {
      const storage = getStorage();
      const existingArchives = this.loadArchivedSessions();
      existingArchives.unshift(archivedSession);
      // نگهداری حداکثر ۲۰ نشست در آرشیو
      const trimmed = existingArchives.slice(0, 20);
      storage.setItem(ARCHIVED_SESSIONS_STORAGE_KEY, JSON.stringify(trimmed));
      storage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch (err) {
      console.error('[PracticeSessionManager] archiveSession error:', err);
    }

    return archivedSession;
  }

  /**
   * بارگذاری نشست‌های بایگانی‌شده
   */
  public static loadArchivedSessions(): PracticeSession[] {
    try {
      const storage = getStorage();
      const raw = storage.getItem(ARCHIVED_SESSIONS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * پاک‌سازی کامل برای محیط آزمون و تست
   */
  public static clearAllForTesting(): void {
    fallbackStorage.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      localStorage.removeItem(ARCHIVED_SESSIONS_STORAGE_KEY);
    }
  }
}
