import { SymbolId } from '../contracts/market';

export interface AppExportPayloadV1 {
  schemaVersion: 'v1.0';
  exportedAt: number;
  environment: 'demo';
  app: 'Hamed Trading Lab';
  state: {
    symbol: SymbolId;
    currentStepIndex: number;
    accountBalance: number;
    accountEquity: number;
    sessionNotes?: string;
  };
}

const STORAGE_KEY = 'hamed_trading_lab_state_v1';

export class PersistenceStorage {
  /**
   * استخراج وضعیت جاری به ساختار استاندارد JSON با اسکیما v1.0
   */
  public static exportState(state: AppExportPayloadV1['state']): string {
    const payload: AppExportPayloadV1 = {
      schemaVersion: 'v1.0',
      exportedAt: Date.now(),
      environment: 'demo',
      app: 'Hamed Trading Lab',
      state,
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * اعتبارسنجی دقیق و بارگذاری فایل JSON ورودی (Schema Validation)
   */
  public static validateAndImport(jsonString: string): {
    valid: boolean;
    data?: AppExportPayloadV1;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(jsonString) as Partial<AppExportPayloadV1>;

      if (!parsed || typeof parsed !== 'object') {
        return { valid: false, error: 'فرمت فایل JSON نامعتبر است.' };
      }

      if (parsed.schemaVersion !== 'v1.0') {
        return {
          valid: false,
          error: `نسخه اسکیما نامعتبر است: ${parsed.schemaVersion || 'نامشخص'}. نسخه مجاز: v1.0`,
        };
      }

      if (parsed.app !== 'Hamed Trading Lab') {
        return { valid: false, error: 'فایل پشتیبان متعلق به سامانه Hamed Trading Lab نیست.' };
      }

      if (!parsed.state || typeof parsed.state !== 'object') {
        return { valid: false, error: 'بخش وضعیت (state) در فایل پشتیبان وجود ندارد.' };
      }

      const { symbol, currentStepIndex } = parsed.state;
      if (symbol !== 'XAUUSD' && symbol !== 'EURUSD') {
        return { valid: false, error: `نماد پشتیبان نامعتبر است: ${symbol}` };
      }

      if (typeof currentStepIndex !== 'number' || currentStepIndex < 0) {
        return { valid: false, error: 'گام ریپلی نامعتبر است.' };
      }

      return {
        valid: true,
        data: parsed as AppExportPayloadV1,
      };
    } catch (err) {
      return {
        valid: false,
        error: `خطا در پارس کردن فایل JSON: ${(err as Error).message}`,
      };
    }
  }

  /**
   * ذخیره خودکار در حافظه محلی مرورگر (Local Storage)
   */
  public static saveToLocal(state: AppExportPayloadV1['state']): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const payload: AppExportPayloadV1 = {
        schemaVersion: 'v1.0',
        exportedAt: Date.now(),
        environment: 'demo',
        app: 'Hamed Trading Lab',
        state,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * بازیابی از حافظه محلی مرورگر
   */
  public static loadFromLocal(): AppExportPayloadV1['state'] | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const res = this.validateAndImport(raw);
      return res.valid && res.data ? res.data.state : null;
    } catch {
      return null;
    }
  }

  /**
   * پاک‌سازی حافظه محلی
   */
  public static clearLocal(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // نادیده گرفتن
    }
  }
}
