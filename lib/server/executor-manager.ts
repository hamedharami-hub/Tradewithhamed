/**
 * lib/server/executor-manager.ts
 * مدیریت تک‌مجری بین‌دستگاهی (Single Executor Manager) — الزام دروازه W4 Gate B
 * 
 * طبق منشور طرح نسخه ۴.۰:
 * - هر دو دستگاه ویندوز (Snapdragon X Plus) و اندروید (Pixel 9 Pro Fold) تحلیل و نمودار مستقل دارند.
 * - اما در هر لحظه فقط و فقط یک دستگاه (دستگاه منتخب) اجازه ارسال درخواست تراکنش به بروکر دارد.
 * - واگذاری مجری‌گری (Handoff) نیازمند افزایش اتمیک Epoch است.
 * - سفارش‌های ارسالی با Epoch قدیمی یا از دستگاه غیرمنتخب با خطای امنیتی مسدود می‌شوند.
 * - هیچ تصاحب خودکاری صرفاً با قطع هارت‌بیت مجاز نیست (No Heartbeat-Only Takeover).
 */

export interface ExecutorState {
  activeSessionId: string;
  activeDeviceLabel: 'windows' | 'pixel';
  epoch: number;
  leaseExpiresAt: number;
  status: 'ACTIVE' | 'HANDOFF_PENDING' | 'EXPIRED';
  pendingHandoffTo?: {
    deviceLabel: 'windows' | 'pixel';
    targetSessionId: string;
  } | null;
}

export interface ExecutorValidationResult {
  authorized: boolean;
  reason?: string;
  currentEpoch: number;
  activeDevice: 'windows' | 'pixel';
}

const globalForExecutor = globalThis as unknown as {
  executorState?: ExecutorState;
};

const DEFAULT_STATE: ExecutorState = {
  activeSessionId: 'default-windows-session',
  activeDeviceLabel: 'windows',
  epoch: 1,
  leaseExpiresAt: Date.now() + 3600000, // پیش‌فرض ۱ ساعت
  status: 'ACTIVE',
  pendingHandoffTo: null,
};

const sharedState: ExecutorState = globalForExecutor.executorState ?? { ...DEFAULT_STATE };

if (!globalForExecutor.executorState) {
  globalForExecutor.executorState = sharedState;
}

export class ExecutorManager {
  private static state: ExecutorState = sharedState;

  public static resetForTesting(): void {
    this.state.activeSessionId = 'test-windows-session';
    this.state.activeDeviceLabel = 'windows';
    this.state.epoch = 1;
    this.state.leaseExpiresAt = Date.now() + 3600000;
    this.state.status = 'ACTIVE';
    this.state.pendingHandoffTo = null;
  }

  public static getExecutorState(): ExecutorState {
    const now = Date.now();
    const isExpired = now > this.state.leaseExpiresAt;
    return {
      ...this.state,
      status: isExpired ? 'EXPIRED' : this.state.status,
    };
  }

  /**
   * تمدید اجاره دستگاه فعال (Lease Renewal)
   */
  public static renewLease(sessionId: string, epoch: number, durationMs = 60000): { renewed: boolean; expiresAt: number; reason?: string } {
    if (this.state.epoch !== epoch) {
      return {
        renewed: false,
        expiresAt: this.state.leaseExpiresAt,
        reason: `EPOCH_MISMATCH: کد ایپاک درخواست (${epoch}) با ایپاک جاری سرور (${this.state.epoch}) همخوانی ندارد.`,
      };
    }

    if (this.state.activeSessionId !== sessionId) {
      return {
        renewed: false,
        expiresAt: this.state.leaseExpiresAt,
        reason: 'SESSION_MISMATCH: شناسه نشست مجری با نشست فعال مطابقت ندارد.',
      };
    }

    this.state.leaseExpiresAt = Date.now() + durationMs;
    this.state.status = 'ACTIVE';
    return { renewed: true, expiresAt: this.state.leaseExpiresAt };
  }

  /**
   * واگذاری عامدانه و هماهنگ مجری‌گری از یک دستگاه به دستگاه دیگر (Graceful Handoff)
   */
  public static initiateHandoff(
    fromSessionId: string,
    fromEpoch: number,
    toDevice: 'windows' | 'pixel',
    toSessionId: string
  ): { initiated: boolean; reason?: string } {
    if (this.state.epoch !== fromEpoch) {
      return { initiated: false, reason: 'EPOCH_MISMATCH: ایپاک منسوخ شده است.' };
    }
    if (this.state.activeSessionId !== fromSessionId) {
      return { initiated: false, reason: 'UNAUTHORIZED: تنها مجری فعال فعلی می‌تواند درخواست واگذاری دهد.' };
    }

    this.state.status = 'HANDOFF_PENDING';
    this.state.pendingHandoffTo = {
      deviceLabel: toDevice,
      targetSessionId: toSessionId,
    };

    return { initiated: true };
  }

  /**
   * پذیرش نهایی واگذاری توسط دستگاه مقصد با افزایش اتمیک Epoch
   */
  public static completeHandoff(
    toSessionId: string,
    targetDevice: 'windows' | 'pixel'
  ): { completed: boolean; newEpoch: number; reason?: string } {
    if (!this.state.pendingHandoffTo) {
      return {
        completed: false,
        newEpoch: this.state.epoch,
        reason: 'NO_PENDING_HANDOFF_INITIATED: هیچ فرآیند واگذاری در جریان نیست.',
      };
    }

    if (
      this.state.pendingHandoffTo.targetSessionId !== toSessionId ||
      this.state.pendingHandoffTo.deviceLabel !== targetDevice
    ) {
      return {
        completed: false,
        newEpoch: this.state.epoch,
        reason: 'HANDOFF_TARGET_MISMATCH: دستگاه مقصد با درخواست واگذاری ثبت‌شده همخوانی ندارد.',
      };
    }

    // افزایش قطعی و اتمیک Epoch
    this.state.epoch += 1;
    this.state.activeSessionId = toSessionId;
    this.state.activeDeviceLabel = targetDevice;
    this.state.leaseExpiresAt = Date.now() + 3600000;
    this.state.status = 'ACTIVE';
    this.state.pendingHandoffTo = null;

    return { completed: true, newEpoch: this.state.epoch };
  }

  /**
   * انتخاب صریح دستگاه مجری توسط کاربر حامد از رابط کاربری (Manual Override Handoff)
   */
  public static forceSwitchExecutor(
    targetDevice: 'windows' | 'pixel',
    targetSessionId: string
  ): { switched: boolean; newEpoch: number } {
    this.state.epoch += 1;
    this.state.activeSessionId = targetSessionId;
    this.state.activeDeviceLabel = targetDevice;
    this.state.leaseExpiresAt = Date.now() + 3600000;
    this.state.status = 'ACTIVE';
    this.state.pendingHandoffTo = null;

    return { switched: true, newEpoch: this.state.epoch };
  }

  /**
   * اعتبارسنجی قطعی دسترسی مجری قبل از ثبت هرگونه درخواست سفارش به بروکر
   */
  public static validateExecutor(
    sessionId?: string,
    epoch?: number,
    deviceLabel?: 'windows' | 'pixel'
  ): ExecutorValidationResult {
    const current = this.state;

    // الزامی بودن شناسه نشست و ایپاک برای جلوگیری از دور زدن اعتبارسنجی
    if (!sessionId || epoch === undefined) {
      return {
        authorized: false,
        reason: 'MISSING_EXECUTOR_CREDENTIALS: شناسه نشست (sessionId) و کد ایپاک (epoch) برای ارسال سفارش الزامی است.',
        currentEpoch: current.epoch,
        activeDevice: current.activeDeviceLabel,
      };
    }

    // ۱. بررسی تطابق Epoch
    if (epoch !== current.epoch) {
      return {
        authorized: false,
        reason: `STALE_EPOCH_REJECTED: سفارش با ایپاک ${epoch} ارسال شده است، اما ایپاک جاری سرور ${current.epoch} است (تغییر مجری صورت گرفته).`,
        currentEpoch: current.epoch,
        activeDevice: current.activeDeviceLabel,
      };
    }

    // ۲. بررسی تطابق شناسه نشست و برچسب دستگاه
    if (sessionId !== current.activeSessionId) {
      return {
        authorized: false,
        reason: `DEVICE_NOT_AUTHORIZED_EXECUTOR: دستگاه ${deviceLabel || 'ناشناس'} مجری منتخب نیست. دستگاه مجری فعال: ${current.activeDeviceLabel}.`,
        currentEpoch: current.epoch,
        activeDevice: current.activeDeviceLabel,
      };
    }

    return {
      authorized: true,
      currentEpoch: current.epoch,
      activeDevice: current.activeDeviceLabel,
    };
  }
}
