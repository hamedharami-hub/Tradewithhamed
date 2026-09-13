import { SymbolId } from '../contracts/market';

export interface BackupState {
  symbol: SymbolId;
  currentStepIndex: number;
  accountBalance: number;
  accountEquity: number;
  sessionNotes?: string;
}

export interface AppExportPayloadV1 { schemaVersion: 'v1.0'; exportedAt: number; environment: 'demo'; app: 'Hamed Trading Lab'; state: BackupState; }
export interface AppExportPayloadV2 {
  schemaVersion: 'v2.0'; exportedAt: number; environment: 'demo'; app: 'Hamed Trading Lab'; backupKind: 'LOCAL_REPLAY_STATE';
  includes: Array<'symbol' | 'replayPosition' | 'displayedAccountSnapshot'>;
  excludes: Array<'brokerOrders' | 'brokerTokens' | 'aiModelWeights'>;
  state: BackupState;
}
export type AppExportPayload = AppExportPayloadV1 | AppExportPayloadV2;
const STORAGE_KEY = 'hamed_trading_lab_state_v2';
const VALID_SYMBOLS: SymbolId[] = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];

function validState(value: unknown): value is BackupState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<BackupState>;
  return VALID_SYMBOLS.includes(state.symbol as SymbolId)
    && typeof state.currentStepIndex === 'number' && Number.isInteger(state.currentStepIndex) && state.currentStepIndex >= 0
    && typeof state.accountBalance === 'number' && Number.isFinite(state.accountBalance) && state.accountBalance >= 0
    && typeof state.accountEquity === 'number' && Number.isFinite(state.accountEquity) && state.accountEquity >= 0
    && (state.sessionNotes === undefined || typeof state.sessionNotes === 'string');
}

export class PersistenceStorage {
  public static exportState(state: BackupState): string {
    const payload: AppExportPayloadV2 = {
      schemaVersion: 'v2.0', exportedAt: Date.now(), environment: 'demo', app: 'Hamed Trading Lab', backupKind: 'LOCAL_REPLAY_STATE',
      includes: ['symbol', 'replayPosition', 'displayedAccountSnapshot'], excludes: ['brokerOrders', 'brokerTokens', 'aiModelWeights'], state,
    };
    return JSON.stringify(payload, null, 2);
  }

  public static validateAndImport(jsonString: string): { valid: boolean; data?: AppExportPayload; error?: string; migratedFromV1?: boolean } {
    try {
      const parsed = JSON.parse(jsonString) as Partial<AppExportPayload>;
      if (!parsed || typeof parsed !== 'object') return { valid: false, error: 'فرمت فایل JSON نامعتبر است.' };
      if (parsed.app !== 'Hamed Trading Lab') return { valid: false, error: 'فایل پشتیبان متعلق به سامانه Hamed Trading Lab نیست.' };
      if (!validState(parsed.state)) return { valid: false, error: 'نماد، گام ریپلی یا مقادیر حساب در فایل پشتیبان نامعتبر است.' };
      if (parsed.schemaVersion === 'v1.0') return { valid: true, data: parsed as AppExportPayloadV1, migratedFromV1: true };
      if (parsed.schemaVersion !== 'v2.0' || parsed.backupKind !== 'LOCAL_REPLAY_STATE') return { valid: false, error: `نسخه یا نوع پشتیبان پشتیبانی نمی‌شود: ${parsed.schemaVersion || 'نامشخص'}.` };
      return { valid: true, data: parsed as AppExportPayloadV2 };
    } catch (error) { return { valid: false, error: `خطا در خواندن JSON: ${(error as Error).message}` }; }
  }

  public static saveToLocal(state: BackupState): boolean {
    if (typeof window === 'undefined') return false;
    try { localStorage.setItem(STORAGE_KEY, this.exportState(state)); return true; } catch { return false; }
  }

  public static loadFromLocal(): BackupState | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('hamed_trading_lab_state_v1');
      if (!raw) return null;
      const result = this.validateAndImport(raw);
      return result.valid && result.data ? result.data.state : null;
    } catch { return null; }
  }

  public static clearLocal(): void {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem('hamed_trading_lab_state_v1'); } catch { /* optional browser storage */ }
  }
}
