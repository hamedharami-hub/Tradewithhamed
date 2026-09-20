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
export const MAX_ARCHIVED_SESSIONS = 20;

export interface ArchiveSessionResult {
  success: boolean;
  archivedSession?: PracticeSession;
  error?: string;
  reason?: 'CAPACITY_EXCEEDED' | 'STORAGE_QUOTA' | 'VALIDATION_FAILED' | 'STORAGE_ERROR';
  existingArchivesCount?: number;
}

export interface PracticeSessionValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePracticeSession(data: unknown): PracticeSessionValidationResult {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['داده نامعتبر یا تهی است.'] };
  }

  const s = data as Partial<PracticeSession>;

  if (s.schemaVersion !== '2.0') {
    errors.push(`نسخه شما نامعتبر است: ${s.schemaVersion} (باید 2.0 باشد)`);
  }

  if (typeof s.sessionId !== 'string' || !s.sessionId.startsWith('practice-')) {
    errors.push('شناسه نشست نامعتبر است.');
  }

  const validSymbols: SymbolId[] = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
  if (!s.symbol || !validSymbols.includes(s.symbol)) {
    errors.push(`نماد نامعتبر است: ${s.symbol}`);
  }

  if (s.status !== 'ACTIVE' && s.status !== 'ARCHIVED') {
    errors.push(`وضعیت نشست نامعتبر است: ${s.status}`);
  }

  if (typeof s.createdAt !== 'number' || s.createdAt <= 0) {
    errors.push('زمان ایجاد نشست نامعتبر است.');
  }

  if (typeof s.initialBalance !== 'number' || s.initialBalance <= 0 || !Number.isFinite(s.initialBalance)) {
    errors.push('سرمایه اولیه نامعتبر است.');
  }

  if (typeof s.accountBalance !== 'number' || !Number.isFinite(s.accountBalance) || s.accountBalance < 0) {
    errors.push('بالانس حساب نامعتبر یا منفی است.');
  }

  if (typeof s.accountEquity !== 'number' || !Number.isFinite(s.accountEquity)) {
    errors.push('اکوئیتی حساب نامعتبر است.');
  }

  if (typeof s.currentStepIndex !== 'number' || s.currentStepIndex < 0 || !Number.isInteger(s.currentStepIndex)) {
    errors.push('ایندکس گام ریپلی نامعتبر است.');
  }

  if (!s.config || typeof s.config !== 'object') {
    errors.push('پیکربندی نشست ناموجود است.');
  } else {
    if (typeof s.config.selectedRiskPercent !== 'number' || s.config.selectedRiskPercent <= 0 || s.config.selectedRiskPercent > 10) {
      errors.push('درصد ریسک نامعتبر است.');
    }
    if (typeof s.config.enablePartialTp !== 'boolean') {
      errors.push('تنظیم خروج پله‌ای نامعتبر است.');
    }
  }

  if (!Array.isArray(s.positions)) {
    errors.push('فهرست معاملات نامعتبر است.');
  }

  if (!Array.isArray(s.orders)) {
    errors.push('فهرست سفارش‌ها نامعتبر است.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

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
  public keys(): string[] {
    return Array.from(this.store.keys());
  }
}

const fallbackStorage = new InMemoryStorage();

function getStorage(): {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
} {
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
   * ذخیره نشست فعال با اعتبارسنجی و مدیریت خطای Quota
   */
  public static saveActiveSession(session: PracticeSession): { success: boolean; error?: string } {
    const validation = validatePracticeSession(session);
    if (!validation.valid) {
      const errorMsg = `خطای اعتبارسنجی نشست قبل از ذخیره: ${validation.errors.join('; ')}`;
      console.error('[PracticeSessionManager]', errorMsg);
      return { success: false, error: errorMsg };
    }

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
   * بارگذاری نشست فعال با اعتبارسنجی کامل معنایی و قرنطینه داده‌های خراب
   */
  public static loadActiveSession(): PracticeSession | null {
    const storage = getStorage();
    let raw: string | null = null;
    try {
      raw = storage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (!raw) return null;
    } catch (err) {
      console.error('[PracticeSessionManager] Failed to read from storage:', err);
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      const validation = validatePracticeSession(parsed);

      if (!validation.valid) {
        // داده خراب است: جهت جلوگیری از حذف خاموش، آن را قرنطینه می‌کنیم
        const quarantineKey = `${ACTIVE_SESSION_STORAGE_KEY}_corrupted_${Date.now()}`;
        console.warn(`[PracticeSessionManager] داده‌های نشست فعال نامعتبر بودند. قرنطینه در ${quarantineKey}:`, validation.errors);
        storage.setItem(quarantineKey, raw);
        // کلید فعال را خالی می‌کنیم تا نشست جدید بتواند ایجاد شود، اما داده آسیب‌دیده باقی می‌ماند
        storage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        return null;
      }

      return parsed as PracticeSession;
    } catch (err) {
      // خطای JSON parse: قرنطینه داده خراب
      const quarantineKey = `${ACTIVE_SESSION_STORAGE_KEY}_corrupted_${Date.now()}`;
      console.error(`[PracticeSessionManager] خطای ساختاری JSON در نشست فعال. قرنطینه در ${quarantineKey}:`, err);
      storage.setItem(quarantineKey, raw);
      storage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      return null;
    }
  }

  /**
   * بایگانی نشست جاری با کنترل صریح سقف آرشیو و جلوگیری از حذف خاموش
   */
  public static archiveSession(session: PracticeSession, noteFa?: string): ArchiveSessionResult {
    const validation = validatePracticeSession(session);
    if (!validation.valid) {
      return {
        success: false,
        reason: 'VALIDATION_FAILED',
        error: `اعتبارسنجی نشست برای بایگانی ناموفق بود: ${validation.errors.join('; ')}`,
      };
    }

    const existingArchives = this.loadArchivedSessions();

    // بررسی سقف مجاز آرشیو: هیچ نشستی نباید بدون تصمیم کاربر حذف شود
    if (existingArchives.length >= MAX_ARCHIVED_SESSIONS) {
      return {
        success: false,
        reason: 'CAPACITY_EXCEEDED',
        existingArchivesCount: existingArchives.length,
        error: `ظرفیت آرشیو نشست‌ها تکمیل است (${existingArchives.length} از ${MAX_ARCHIVED_SESSIONS} نشست). برای حفظ امنیت داده‌ها، هیچ نشستی بدون تأیید شما حذف نمی‌شود. لطفاً از پنل آرشیو نشست‌های غیرضروری را حذف کنید.`,
      };
    }

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
      const updatedArchives = [archivedSession, ...existingArchives];
      storage.setItem(ARCHIVED_SESSIONS_STORAGE_KEY, JSON.stringify(updatedArchives));
      // فقط پس از موفقیت ذخیره آرشیو، کلید نشست فعال پاک می‌شود
      storage.removeItem(ACTIVE_SESSION_STORAGE_KEY);

      return {
        success: true,
        archivedSession,
        existingArchivesCount: updatedArchives.length,
      };
    } catch (err) {
      const isQuota = (err as Error).name === 'QuotaExceededError';
      const errorMsg = isQuota
        ? 'خطای ذخیره‌سازی: حافظه محلی مرورگر برای بایگانی این نشست کافی نیست.'
        : `خطا در ذخیره آرشیو: ${(err as Error).message}`;
      console.error('[PracticeSessionManager] archiveSession error:', errorMsg);

      // در صورت شکست، نشست فعال حذف نمی‌شود تا اطلاعات کاربر از دست نرود
      return {
        success: false,
        reason: isQuota ? 'STORAGE_QUOTA' : 'STORAGE_ERROR',
        error: errorMsg,
      };
    }
  }

  /**
   * بارگذاری نشست‌های بایگانی‌شده با اعتبارسنجی
   */
  public static loadArchivedSessions(): PracticeSession[] {
    const storage = getStorage();
    let raw: string | null = null;
    try {
      raw = storage.getItem(ARCHIVED_SESSIONS_STORAGE_KEY);
      if (!raw) return [];
    } catch {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // فیلتر کردن و نگهداری آیتم‌های معتبر
      return parsed.filter(item => validatePracticeSession(item).valid) as PracticeSession[];
    } catch (err) {
      // قرنطینه در صورت خرابی JSON آرشیو
      const quarantineKey = `${ARCHIVED_SESSIONS_STORAGE_KEY}_corrupted_${Date.now()}`;
      console.error(`[PracticeSessionManager] آرشیو دچار خرابی ساختار شد. قرنطینه در ${quarantineKey}:`, err);
      storage.setItem(quarantineKey, raw);
      return [];
    }
  }

  /**
   * حذف هدفمند یک نشست از آرشیو با شناسه (با تصمیم کاربر)
   */
  public static deleteArchivedSession(sessionId: string): boolean {
    try {
      const storage = getStorage();
      const existing = this.loadArchivedSessions();
      const filtered = existing.filter(s => s.sessionId !== sessionId);
      if (filtered.length === existing.length) return false;
      storage.setItem(ARCHIVED_SESSIONS_STORAGE_KEY, JSON.stringify(filtered));
      return true;
    } catch (err) {
      console.error('[PracticeSessionManager] deleteArchivedSession error:', err);
      return false;
    }
  }

  /**
   * برای تست: تزریق مستقیم داده به حافظه جهت شبیه‌سازی خرابی داده
   */
  public static setRawForTesting(key: string, value: string): void {
    getStorage().setItem(key, value);
  }

  public static getRawForTesting(key: string): string | null {
    return getStorage().getItem(key);
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
