import { Candle } from '../contracts/market';

export function calculateWilderATR(candles: Candle[], period = 14): number[] {
  if (candles.length < 2) return [];

  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const hl = current.high - current.low;
    const hpc = Math.abs(current.high - prev.close);
    const lpc = Math.abs(current.low - prev.close);
    tr.push(Math.max(hl, hpc, lpc));
  }

  if (tr.length < period) return [];

  const atrs: number[] = [];
  let firstATR = 0;
  for (let i = 0; i < period; i++) {
    firstATR += tr[i];
  }
  firstATR /= period;
  atrs.push(firstATR);

  for (let i = period; i < tr.length; i++) {
    const currentATR = (atrs[atrs.length - 1] * (period - 1) + tr[i]) / period;
    atrs.push(currentATR);
  }

  return atrs;
}
