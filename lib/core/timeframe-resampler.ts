import { Candle, SymbolId } from '../contracts/market';
import { MultiTimeframeLevel } from '../contracts/monte-carlo';

/**
 * ابزار بازنمونه‌گیری (Resampling) دقیق کندل‌های M5 به تایم‌فریم‌های بالاتر (M15, H1, H4, D1)
 * و استخراج سطوح نقدینگی و ساختار واقعی چندتایم‌فریمه بدون استفاده از آفست‌های ساختگی و دلخواه
 */
export class TimeframeResampler {
  private static readonly TF_INTERVALS_MS: Record<'15M' | '1H' | '4H' | 'D1', number> = {
    '15M': 15 * 60 * 1000,
    '1H': 60 * 60 * 1000,
    '4H': 4 * 60 * 60 * 1000,
    'D1': 24 * 60 * 60 * 1000,
  };

  /**
   * تجمیع و بازنمونه‌گیری کندل‌های M5 به تایم‌فریم مقصد
   */
  public static resample(candles: Candle[], targetTf: '15M' | '1H' | '4H' | 'D1'): Candle[] {
    if (!candles || candles.length === 0) return [];

    const interval = this.TF_INTERVALS_MS[targetTf];
    const grouped = new Map<number, Candle[]>();

    for (const c of candles) {
      const bucketTimestamp = Math.floor(c.timestamp / interval) * interval;
      let list = grouped.get(bucketTimestamp);
      if (!list) {
        list = [];
        grouped.set(bucketTimestamp, list);
      }
      list.push(c);
    }

    const resampled: Candle[] = [];
    const sortedBuckets = Array.from(grouped.keys()).sort((a, b) => a - b);

    for (const bucket of sortedBuckets) {
      const bucketCandles = grouped.get(bucket)!;
      bucketCandles.sort((a, b) => a.timestamp - b.timestamp);

      const open = bucketCandles[0].open;
      const close = bucketCandles[bucketCandles.length - 1].close;
      let high = -Infinity;
      let low = Infinity;
      let volume = 0;

      for (const c of bucketCandles) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
        volume += c.volume || 0;
      }

      const expectedCandles = Math.max(1, Math.floor(interval / (5 * 60 * 1000)));
      const isClosed = bucketCandles.length >= expectedCandles;

      resampled.push({
        timestamp: bucket,
        open,
        high,
        low,
        close,
        volume,
        isClosed,
      });
    }

    return resampled;
  }

  /**
   * استخراج سطوح کلان و معتبر چندتایم‌فریمه (PDH, PDL, Asia High/Low, Equilibrium) از داده‌های واقعی کندل‌ها
   */
  public static extractMultiTimeframeLevels(candles: Candle[], symbol: SymbolId = 'XAUUSD'): MultiTimeframeLevel[] {
    if (!candles || candles.length === 0) return [];

    const digits = symbol === 'XAUUSD' ? 2 : 5;
    const currentPrice = candles[candles.length - 1].close;

    // ۱. استخراج کندل‌های روزانه (D1) برای تشخیص دقیق PDH و PDL
    const dailyCandles = this.resample(candles, 'D1');
    let pdh = 0;
    let pdl = 0;

    if (dailyCandles.length >= 2) {
      // روز قبل تکمیل‌شده
      const prevDay = dailyCandles[dailyCandles.length - 2];
      pdh = prevDay.high;
      pdl = prevDay.low;
    } else {
      // اگر کمتر از دو روز دیتا بود، بیشینه و کمینه ۲۴ ساعت اخیر (تا قبل از کندل‌های اخیر)
      const windowCandles = candles.slice(0, Math.max(1, candles.length - 12));
      pdh = Math.max(...windowCandles.map(c => c.high));
      pdl = Math.min(...windowCandles.map(c => c.low));
    }

    // ۲. استخراج سشن آسیا (ساعت ۰۰:۰۰ تا ۰۸:۰۰ به وقت UTC)
    const asiaCandles = candles.filter(c => {
      const hour = new Date(c.timestamp).getUTCHours();
      return hour >= 0 && hour < 8;
    });

    let asiaHigh = 0;
    let asiaLow = 0;
    if (asiaCandles.length > 0) {
      // آخرین سشن آسیای ثبت‌شده
      const recentAsia = asiaCandles.slice(-96); // حداکثر ۸ ساعت کندل ۵ دقیقه‌ای
      asiaHigh = Math.max(...recentAsia.map(c => c.high));
      asiaLow = Math.min(...recentAsia.map(c => c.low));
    } else {
      // فال‌بک بر اساس بازه محلی M15
      const m15 = this.resample(candles, '15M');
      const recentM15 = m15.slice(-8);
      asiaHigh = Math.max(...recentM15.map(c => c.high));
      asiaLow = Math.min(...recentM15.map(c => c.low));
    }

    // ۳. محاسبه نقطه تعادل (Equilibrium 50%)
    const eqPrice = (pdh + pdl) / 2;

    const levels: MultiTimeframeLevel[] = [
      {
        id: 'pdh',
        labelFa: 'سقف روز قبل (PDH)',
        labelEn: 'PDH (Previous Day High)',
        price: Number(pdh.toFixed(digits)),
        timeframe: 'H4',
        type: 'PDH',
        color: '#ef4444',
      },
      {
        id: 'asia_h',
        labelFa: 'سقف آسیا (Asia High)',
        labelEn: 'Asia High',
        price: Number(asiaHigh.toFixed(digits)),
        timeframe: 'M15',
        type: 'ASIA_HIGH',
        color: '#f59e0b',
      },
      {
        id: 'equilibrium',
        labelFa: 'نقطه تعادل ۵۰٪ (Equilibrium)',
        labelEn: 'Equilibrium (50%)',
        price: Number(eqPrice.toFixed(digits)),
        timeframe: 'H1',
        type: 'EQUILIBRIUM',
        color: '#a855f7',
      },
      {
        id: 'asia_l',
        labelFa: 'کف آسیا (Asia Low)',
        labelEn: 'Asia Low',
        price: Number(asiaLow.toFixed(digits)),
        timeframe: 'M15',
        type: 'ASIA_LOW',
        color: '#3b82f6',
      },
      {
        id: 'pdl',
        labelFa: 'کف روز قبل (PDL)',
        labelEn: 'PDL (Previous Day Low)',
        price: Number(pdl.toFixed(digits)),
        timeframe: 'H4',
        type: 'PDL',
        color: '#10b981',
      },
    ];

    return levels;
  }
}
