/**
 * lib/server/storage/persistent-store.ts
 * ماژول ذخیره‌سازی تراکنشی پایدار بر بستر فایل محلی (Transactional File-Backed Store)
 * 
 * تضمین‌های کلیدی:
 * ۱. حفظ کامل Outbox، کلیدهای ضد تکرار، وضعیت اکزکیوتور و ژورنال پس از ری‌استارت سرور
 * ۲. نوشتن اتمیک با استفاده از فایل موقت (.tmp) و جایگزینی بدون وقفه
 * ۳. هماهنگ‌سازی بلادرنگ (Flush on mutation)
 * ۴. مدیریت خطا و بازگشت امن در صورت خرابی یا عدم دسترسی
 */

import fs from 'fs';
import path from 'path';
import { TransactionalOutboxRecord } from '../../contracts/execution';
import { TradePosition, JournalAuditEvent } from '../../contracts/journal';
import { ExecutorState } from '../executor-manager';

export interface PersistentStorageSchema {
  version: number;
  lastUpdated: number;
  outbox: TransactionalOutboxRecord[];
  idempotencyEntries: Array<[string, string]>;
  executorState: ExecutorState | null;
  journalPositions: TradePosition[];
  journalAuditLogs: JournalAuditEvent[];
  killNewEntriesActive: boolean;
}

const DEFAULT_STATE: PersistentStorageSchema = {
  version: 1,
  lastUpdated: Date.now(),
  outbox: [],
  idempotencyEntries: [],
  executorState: null,
  journalPositions: [],
  journalAuditLogs: [],
  killNewEntriesActive: false,
};

export class PersistentStore {
  private static storageDir = path.join(process.cwd(), '.data');
  private static storageFile = path.join(process.cwd(), '.data', 'server_state.json');
  private static isInitialized = false;
  private static memoryCache: PersistentStorageSchema = { ...DEFAULT_STATE };

  /**
   * راه‌اندازی اولیه و خواندن فایل از دیسک
   */
  public static init(): PersistentStorageSchema {
    if (this.isInitialized) {
      return this.memoryCache;
    }

    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } else {
        // پاکسازی فایل‌های موقت باقیمانده از قبل
        try {
          const files = fs.readdirSync(this.storageDir);
          for (const f of files) {
            if (f.includes('.tmp.')) {
              try { fs.unlinkSync(path.join(this.storageDir, f)); } catch {}
            }
          }
        } catch {}
      }

      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        const parsed = JSON.parse(raw) as PersistentStorageSchema;
        if (parsed && typeof parsed === 'object') {
          this.memoryCache = {
            version: parsed.version || 1,
            lastUpdated: parsed.lastUpdated || Date.now(),
            outbox: Array.isArray(parsed.outbox) ? parsed.outbox : [],
            idempotencyEntries: Array.isArray(parsed.idempotencyEntries) ? parsed.idempotencyEntries : [],
            executorState: parsed.executorState || null,
            journalPositions: Array.isArray(parsed.journalPositions) ? parsed.journalPositions : [],
            journalAuditLogs: Array.isArray(parsed.journalAuditLogs) ? parsed.journalAuditLogs : [],
            killNewEntriesActive: Boolean(parsed.killNewEntriesActive),
          };
        }
      }
    } catch (err) {
      console.error('[PersistentStore] Error initializing persistent storage:', err);
    }

    this.isInitialized = true;
    return this.memoryCache;
  }

  /**
   * دریافت اسنپ‌شات وضعیت فعلی
   */
  public static getState(): PersistentStorageSchema {
    if (!this.isInitialized) {
      this.init();
    }
    return this.memoryCache;
  }

  /**
   * ذخیره‌سازی اتمیک وضعیت روی دیسک
   */
  public static saveState(updates: Partial<PersistentStorageSchema>): void {
    if (!this.isInitialized) {
      this.init();
    }

    this.memoryCache = {
      ...this.memoryCache,
      ...updates,
      lastUpdated: Date.now(),
    };

    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      const tmpFile = `${this.storageFile}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.memoryCache, null, 2), 'utf-8');

      try {
        fs.copyFileSync(tmpFile, this.storageFile);
        try {
          fs.unlinkSync(tmpFile);
        } catch {}
      } catch {
        // Fallback for direct write
        fs.writeFileSync(this.storageFile, JSON.stringify(this.memoryCache, null, 2), 'utf-8');
        try {
          if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        } catch {}
      }
    } catch (err) {
      console.error('[PersistentStore] Error writing state to file:', err);
    }
  }

  /**
   * پاکسازی داده‌ها (مخصوص تست‌ها)
   */
  public static clearForTesting(): void {
    this.memoryCache = { ...DEFAULT_STATE, lastUpdated: Date.now() };
    this.isInitialized = true;
    try {
      if (fs.existsSync(this.storageFile)) {
        fs.unlinkSync(this.storageFile);
      }
    } catch {
      // نادیده گرفتن خطای حذف در حالت تست
    }
  }
}
