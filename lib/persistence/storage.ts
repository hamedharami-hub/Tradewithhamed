import { SymbolId } from '../contracts/market';

export interface BackupState {
  symbol: SymbolId;
  currentStepIndex: number;
  accountBalance: number;
  accountEquity: number;
  sessionNotes?: string;
}

export interface AppExportPayloadV1 {
  schemaVersion: 'v1.0';
  exportedAt: number;
  environment: 'demo';
  app: 'Hamed Trading Lab';
  state: BackupState;
}

export interface AppExportPayloadV2 {
  schemaVersion: 'v2.0';
  exportedAt: number;
  environment: 'demo';
  app: 'Hamed Trading Lab';
  backupKind: 'LOCAL_REPLAY_STATE';
  includes: Array<'symbol' | 'replayPosition' | 'displayedAccountSnapshot'>;
  excludes: Array<'brokerOrders' | 'brokerTokens' | 'aiModelWeights'>;
  state: BackupState;
}

export interface AppExportPayloadV21Sanitized {
  schemaVersion: 'v2.1-sanitized';
  exportedAt: number;
  environment: 'PRACTICE' | 'RESEARCH' | 'DEMO';
  app: 'Tradewithhamed';
  backupKind: 'LOCAL_STATE_SANITIZED';
  checksumSha256: string;
  includes: Array<'symbol' | 'replayPosition' | 'displayedAccountSnapshot' | 'sessionNotes'>;
  excludes: Array<
    | 'brokerOrders'
    | 'brokerTokens'
    | 'apiKeys'
    | 'liveOrderExecution'
    | 'killSwitchOverride'
  >;
  neverExecutesOrdersOnRestore: true;
  neverOverridesSafetyKillSwitch: true;
  state: BackupState;
}

export type AppExportPayload = AppExportPayloadV1 | AppExportPayloadV2 | AppExportPayloadV21Sanitized;

const STORAGE_KEY = 'tradewithhamed_state_v2_1';
const LEGACY_STORAGE_KEY_V2 = 'hamed_trading_lab_state_v2';
const LEGACY_STORAGE_KEY_V1 = 'hamed_trading_lab_state_v1';
const VALID_SYMBOLS: SymbolId[] = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];

/**
 * محاسبه خالص و همگام هش استاندارد SHA-256 منطبق با FIPS 180-4 بدون وابستگی خارجی
 */
export function computeSha256(input: string): string {
  const bytes = new TextEncoder().encode(input);

  const K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let H0 = 0x6a09e667;
  let H1 = 0xbb67ae85;
  let H2 = 0x3c6ef372;
  let H3 = 0xa54ff53a;
  let H4 = 0x510e527f;
  let H5 = 0x9b05688c;
  let H6 = 0x1f83d9ab;
  let H7 = 0x5be0cd19;

  const bitLength = bytes.length * 8;
  const newByteLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(newByteLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(newByteLen - 4, bitLength, false);

  const W = new Uint32Array(64);

  for (let i = 0; i < newByteLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 =
        ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^
        ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^
        (W[t - 15] >>> 3);
      const s1 =
        ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^
        ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^
        (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }

    let a = H0;
    let b = H1;
    let c = H2;
    let d = H3;
    let e = H4;
    let f = H5;
    let g = H6;
    let h = H7;

    for (let t = 0; t < 64; t++) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H0 = (H0 + a) | 0;
    H1 = (H1 + b) | 0;
    H2 = (H2 + c) | 0;
    H3 = (H3 + d) | 0;
    H4 = (H4 + e) | 0;
    H5 = (H5 + f) | 0;
    H6 = (H6 + g) | 0;
    H7 = (H7 + h) | 0;
  }

  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(H0) + hex(H1) + hex(H2) + hex(H3) + hex(H4) + hex(H5) + hex(H6) + hex(H7);
}

function validState(value: unknown): value is BackupState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<BackupState>;
  return (
    VALID_SYMBOLS.includes(state.symbol as SymbolId) &&
    typeof state.currentStepIndex === 'number' &&
    Number.isInteger(state.currentStepIndex) &&
    state.currentStepIndex >= 0 &&
    typeof state.accountBalance === 'number' &&
    Number.isFinite(state.accountBalance) &&
    state.accountBalance >= 0 &&
    typeof state.accountEquity === 'number' &&
    Number.isFinite(state.accountEquity) &&
    state.accountEquity >= 0 &&
    (state.sessionNotes === undefined || typeof state.sessionNotes === 'string')
  );
}

/**
 * فیلتر و پاک‌سازی داده‌های حساس از یادداشت‌ها و فیلدهای وضعیت قبل از تهیه پشتیبان
 */
export function sanitizeNotes(text?: string): string | undefined {
  if (!text) return undefined;
  return text
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, '[REDACTED_BEARER_TOKEN]')
    .replace(/((?:api_?key|secret|token|password|auth)[\s:=]+)[a-zA-Z0-9_\-\.]{6,}/gi, '$1[REDACTED]')
    .replace(/ctid_[a-zA-Z0-9_\-]+/gi, '[REDACTED_CTRADER_TOKEN]');
}

export class PersistenceStorage {
  /**
   * محاسبه چکسام حالت به صورت متعارف (Canonical JSON)
   */
  public static computeStateChecksum(state: BackupState): string {
    const canonical = JSON.stringify({
      symbol: state.symbol,
      currentStepIndex: state.currentStepIndex,
      accountBalance: Number(state.accountBalance.toFixed(2)),
      accountEquity: Number(state.accountEquity.toFixed(2)),
      sessionNotes: state.sessionNotes || '',
    });
    return computeSha256(canonical);
  }

  /**
   * پاک‌سازی وضعیت از اطلاعات حساس
   */
  public static sanitizeState(state: BackupState): BackupState {
    return {
      symbol: state.symbol,
      currentStepIndex: state.currentStepIndex,
      accountBalance: Number(state.accountBalance.toFixed(2)),
      accountEquity: Number(state.accountEquity.toFixed(2)),
      sessionNotes: sanitizeNotes(state.sessionNotes),
    };
  }

  /**
   * خروجی پشتیبان نسخه‌دار v2.1-sanitized با امضای SHA-256 و اقلام مشمول/نامشمول
   */
  public static exportState(
    state: BackupState,
    environment: 'PRACTICE' | 'RESEARCH' | 'DEMO' = 'PRACTICE'
  ): string {
    const cleanState = this.sanitizeState(state);
    const checksumSha256 = this.computeStateChecksum(cleanState);

    const payload: AppExportPayloadV21Sanitized = {
      schemaVersion: 'v2.1-sanitized',
      exportedAt: Date.now(),
      environment,
      app: 'Tradewithhamed',
      backupKind: 'LOCAL_STATE_SANITIZED',
      checksumSha256,
      includes: ['symbol', 'replayPosition', 'displayedAccountSnapshot', 'sessionNotes'],
      excludes: [
        'brokerOrders',
        'brokerTokens',
        'apiKeys',
        'liveOrderExecution',
        'killSwitchOverride',
      ],
      neverExecutesOrdersOnRestore: true,
      neverOverridesSafetyKillSwitch: true,
      state: cleanState,
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * اعتبارسنجی دقیق و بدون تخریب داده‌های موجود:
   * فایل ناسازگار، دستکاری‌شده یا خراب با خطای شفاف رد می‌شود.
   * تضمین ایمنی: بازیابی هرگز سفارشی ارسال نمی‌کند و توقف اضطراری را لغو نمی‌نماید.
   */
  public static validateAndImport(jsonString: string): {
    valid: boolean;
    data?: AppExportPayload;
    error?: string;
    migratedFromV1?: boolean;
    migratedFromV2?: boolean;
    checksumVerified?: boolean;
    neverExecutesOrdersOnRestore: boolean;
    neverOverridesSafetyKillSwitch: boolean;
  } {
    const safetyGuarantees = {
      neverExecutesOrdersOnRestore: true,
      neverOverridesSafetyKillSwitch: true,
    };

    try {
      const parsed = JSON.parse(jsonString) as Partial<AppExportPayload>;
      if (!parsed || typeof parsed !== 'object') {
        return {
          valid: false,
          error: 'فرمت فایل نامعتبر است؛ فایل باید یک سند معتبر JSON باشد.',
          ...safetyGuarantees,
        };
      }

      // بررسی برنامه سازنده
      if (parsed.app !== 'Tradewithhamed' && parsed.app !== 'Hamed Trading Lab') {
        return {
          valid: false,
          error: 'فایل پشتیبان متعلق به سامانه Tradewithhamed نیست.',
          ...safetyGuarantees,
        };
      }

      if (!validState(parsed.state)) {
        return {
          valid: false,
          error: 'فیلدهای وضعیت حساب (نماد، گام ریپلی یا موجودی) نامعتبر یا ناقص هستند.',
          ...safetyGuarantees,
        };
      }

      // مهاجرت از نسخه‌های قبلی (v1.0 و v2.0)
      if (parsed.schemaVersion === 'v1.0') {
        return {
          valid: true,
          data: parsed as AppExportPayloadV1,
          migratedFromV1: true,
          checksumVerified: false,
          ...safetyGuarantees,
        };
      }

      if (parsed.schemaVersion === 'v2.0') {
        return {
          valid: true,
          data: parsed as AppExportPayloadV2,
          migratedFromV2: true,
          checksumVerified: false,
          ...safetyGuarantees,
        };
      }

      // نسخه جاری: v2.1-sanitized
      if (parsed.schemaVersion === 'v2.1-sanitized') {
        const p21 = parsed as AppExportPayloadV21Sanitized;
        if (!p21.checksumSha256 || typeof p21.checksumSha256 !== 'string') {
          return {
            valid: false,
            error: 'چکسام SHA-256 در فایل پشتیبان یافت نشد؛ خطر دستکاری فایل وجود دارد.',
            ...safetyGuarantees,
          };
        }

        const expectedChecksum = this.computeStateChecksum(p21.state);
        if (p21.checksumSha256 !== expectedChecksum) {
          return {
            valid: false,
            error: `چکسام SHA-256 مطابقت ندارد؛ فایل دستکاری شده یا آسیب دیده است (چکسام فایل: ${p21.checksumSha256.slice(0, 8)}... در برابر مقدار محاسبه‌شده: ${expectedChecksum.slice(0, 8)}...).`,
            ...safetyGuarantees,
          };
        }

        return {
          valid: true,
          data: p21,
          checksumVerified: true,
          ...safetyGuarantees,
        };
      }

      return {
        valid: false,
        error: `نسخه پشتیبان ناشناخته یا پشتیبانی‌نشده است: ${parsed.schemaVersion || 'نامشخص'}.`,
        ...safetyGuarantees,
      };
    } catch (error) {
      return {
        valid: false,
        error: `خطا در تجزیه ساختار JSON: ${(error as Error).message}`,
        ...safetyGuarantees,
      };
    }
  }

  /**
   * ذخیره ایمن در حافظه محلی مرورگر
   */
  public static saveToLocal(
    state: BackupState,
    environment: 'PRACTICE' | 'RESEARCH' | 'DEMO' = 'PRACTICE'
  ): boolean {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.setItem(STORAGE_KEY, this.exportState(state, environment));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * بارگذاری وضعیت محلی با اعتبارسنجی
   */
  public static loadFromLocal(): BackupState | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem(LEGACY_STORAGE_KEY_V2) ||
        localStorage.getItem(LEGACY_STORAGE_KEY_V1);
      if (!raw) return null;
      const result = this.validateAndImport(raw);
      return result.valid && result.data ? result.data.state : null;
    } catch {
      return null;
    }
  }

  /**
   * پاک‌سازی کلیدهای حافظه محلی
   */
  public static clearLocal(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY_V2);
      localStorage.removeItem(LEGACY_STORAGE_KEY_V1);
    } catch {}
  }
}
