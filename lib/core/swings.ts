import { Candle, Timeframe } from '../contracts/market';
import { SwingPoint } from '../contracts/features';

/**
 * کشف سقف‌ها و کف‌های محلی (Swing High / Swing Low)
 * تضمین عدم نگاه به آینده:
 * یک کندل در ایندکس i تنها در صورتی پیوت است که:
 * Candle[i-2] < Candle[i] && Candle[i-1] < Candle[i] && Candle[i] > Candle[i+1] && Candle[i] > Candle[i+2]
 * و این رخداد تنها در زمان بسته شدن کندل i+2 قطعی می‌شود (confirmedAtIndex = i + 2).
 */
export function detectSwingPoints(candles: Candle[], timeframe: Timeframe = '5M'): SwingPoint[] {
  const swings: SwingPoint[] = [];
  if (candles.length < 5) return swings;

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const prev2 = candles[i - 2];
    const prev1 = candles[i - 1];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];

    // فقط کندل‌های بسته وارد اعتبارسنجی می‌شوند
    if (!c.isClosed || !next1.isClosed || !next2.isClosed) continue;

    // کشف سقف پیوت (Swing High)
    if (c.high > prev2.high && c.high > prev1.high && c.high > next1.high && c.high > next2.high) {
      swings.push({
        id: `SW-H-${timeframe}-${c.timestamp}`,
        type: 'HIGH',
        price: c.high,
        candleIndex: i,
        timestamp: c.timestamp,
        confirmedAtIndex: i + 2,
        timeframe,
        broken: false,
      });
    }

    // کشف کف پیوت (Swing Low)
    if (c.low < prev2.low && c.low < prev1.low && c.low < next1.low && c.low < next2.low) {
      swings.push({
        id: `SW-L-${timeframe}-${c.timestamp}`,
        type: 'LOW',
        price: c.low,
        candleIndex: i,
        timestamp: c.timestamp,
        confirmedAtIndex: i + 2,
        timeframe,
        broken: false,
      });
    }
  }

  return swings;
}
