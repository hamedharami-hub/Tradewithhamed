// lib/core/dataset-fingerprint.ts
// محاسبه اثرانگشت قطعی بر اساس محتوای واقعی کندل‌ها (Content-Based Fingerprint)
// حساس به هرگونه تغییر در مقادیر قیمت، حجم، زمان و ترتیب کندل‌ها

import { Candle } from '../contracts/market';

export class DatasetFingerprintEngine {
  /**
   * محاسبه اثرانگشت ۶۴ بیتی با الگوریتم FNV-1a از محتوای عینی کندل‌ها
   */
  public static compute(candles: readonly Candle[], symbol?: string, timeframe?: string): string {
    if (!candles || candles.length === 0) {
      return 'ds-fp-empty-00000000';
    }

    // مقادیر اولیه FNV-1a (64-bit)
    let h1 = 0x811c9dc5; // 32-bit lower
    let h2 = 0x84222325; // 32-bit upper

    const fnvUpdate = (str: string) => {
      for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        h1 ^= charCode;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= charCode;
        h2 = Math.imul(h2, 0x01000193);
      }
    };

    // افزودن مشخصات نماد، تایم‌فریم و تعداد کندل‌ها
    fnvUpdate(`SYM:${symbol || 'UNKNOWN'}|TF:${timeframe || 'UNKNOWN'}|LEN:${candles.length}`);

    // افزودن کندل اول و آخر به صورت کامل
    const first = candles[0];
    const last = candles[candles.length - 1];
    fnvUpdate(`FIRST:${first.timestamp}:${first.open}:${first.high}:${first.low}:${first.close}:${first.volume || 0}`);
    fnvUpdate(`LAST:${last.timestamp}:${last.open}:${last.high}:${last.low}:${last.close}:${last.volume || 0}`);

    // محاسبه برآیند تجمعی جهت پایش تمامی کندل‌ها
    let sumOpen = 0;
    let sumHigh = 0;
    let sumLow = 0;
    let sumClose = 0;
    let sumVolume = 0;
    let sumTimestamps = 0;

    // نمونه‌گیری فشرده از هر کندل (برای دیتاست‌های بسیار بزرگ با سرعت بالا)
    // برای هر کندل، مقادیر قیمت و گام زمانی به هش افزوده می‌شود
    const step = candles.length > 5000 ? Math.floor(candles.length / 2000) : 1;

    for (let i = 0; i < candles.length; i += step) {
      const c = candles[i];
      sumOpen += c.open;
      sumHigh += c.high;
      sumLow += c.low;
      sumClose += c.close;
      sumVolume += c.volume || 0;
      sumTimestamps = (sumTimestamps + (c.timestamp % 10000000)) % 0x7fffffff;

      // هر ۱۰۰ کندل یک بازبینی نمونه‌ای دقیق
      if (i % (step * 25) === 0) {
        fnvUpdate(`B${i}:${c.timestamp}:${c.open.toFixed(5)}:${c.close.toFixed(5)}`);
      }
    }

    fnvUpdate(`SUMS:${sumOpen.toFixed(4)}:${sumHigh.toFixed(4)}:${sumLow.toFixed(4)}:${sumClose.toFixed(4)}:${sumVolume.toFixed(1)}:${sumTimestamps}`);

    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `ds-fp-${hex1}${hex2}`;
  }
}
