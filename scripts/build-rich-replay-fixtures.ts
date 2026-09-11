import fs from 'fs';
import path from 'path';

interface RawCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

function parseCsvCandles(filePath: string, count = 350): RawCandle[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const candles: RawCandle[] = [];
  for (let i = 1; i < lines.length && candles.length < count; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 5) continue;
    const timestamp = new Date(parts[0]).getTime();
    const open = parseFloat(parts[1]);
    const high = parseFloat(parts[2]);
    const low = parseFloat(parts[3]);
    const close = parseFloat(parts[4]);
    const volume = parseInt(parts[5] || '1200', 10) || 1200;
    candles.push({ timestamp, open, high, low, close, volume, isClosed: true });
  }
  return candles;
}

// 1. Build Gold 350 candles
function buildGoldCandles(): RawCandle[] {
  const orig: RawCandle[] = [
    { timestamp: 1725600000000, open: 2642.5, high: 2645.0, low: 2641.0, close: 2644.2, volume: 450, isClosed: true },
    { timestamp: 1725600300000, open: 2644.2, high: 2648.5, low: 2643.0, close: 2647.8, volume: 520, isClosed: true },
    { timestamp: 1725600600000, open: 2647.8, high: 2652.0, low: 2646.5, close: 2651.0, volume: 680, isClosed: true },
    { timestamp: 1725600900000, open: 2651.0, high: 2650.0, low: 2645.2, close: 2646.0, volume: 590, isClosed: true },
    { timestamp: 1725601200000, open: 2646.0, high: 2647.5, low: 2643.0, close: 2644.0, volume: 480, isClosed: true },
    { timestamp: 1725601500000, open: 2644.0, high: 2645.0, low: 2638.0, close: 2639.5, volume: 710, isClosed: true },
    { timestamp: 1725601800000, open: 2639.5, high: 2641.0, low: 2635.0, close: 2636.2, volume: 830, isClosed: true },
    { timestamp: 1725602100000, open: 2636.2, high: 2640.0, low: 2636.0, close: 2639.0, volume: 620, isClosed: true },
    { timestamp: 1725602400000, open: 2639.0, high: 2643.0, low: 2638.5, close: 2642.5, volume: 590, isClosed: true },
    { timestamp: 1725602700000, open: 2642.5, high: 2645.0, low: 2640.0, close: 2641.0, volume: 440, isClosed: true },
    { timestamp: 1725603000000, open: 2641.0, high: 2642.0, low: 2637.0, close: 2638.5, volume: 510, isClosed: true },
    { timestamp: 1725603300000, open: 2638.5, high: 2639.0, low: 2633.8, close: 2637.5, volume: 950, isClosed: true },
    { timestamp: 1725603600000, open: 2637.5, high: 2644.0, low: 2637.0, close: 2643.0, volume: 890, isClosed: true },
    { timestamp: 1725603900000, open: 2643.0, high: 2648.5, low: 2642.0, close: 2647.5, volume: 760, isClosed: true },
    { timestamp: 1725604200000, open: 2647.5, high: 2654.0, low: 2646.5, close: 2653.2, volume: 920, isClosed: true },
    { timestamp: 1725604500000, open: 2653.2, high: 2657.0, low: 2651.0, close: 2655.8, volume: 640, isClosed: true },
    { timestamp: 1725604800000, open: 2655.8, high: 2656.5, low: 2652.0, close: 2654.0, volume: 530, isClosed: true },
    { timestamp: 1725605100000, open: 2654.0, high: 2658.0, low: 2653.5, close: 2657.2, volume: 580, isClosed: true },
    { timestamp: 1725605400000, open: 2657.2, high: 2661.0, low: 2656.0, close: 2660.5, volume: 770, isClosed: true },
    { timestamp: 1725605700000, open: 2660.5, high: 2665.0, low: 2659.0, close: 2664.2, volume: 840, isClosed: true },
  ];

  const pre: RawCandle[] = [];
  const startTs = orig[0].timestamp;
  for (let i = 80; i >= 1; i--) {
    const ts = startTs - i * 300000;
    const wave1 = Math.sin(i / 10) * 4.5;
    const wave2 = Math.cos(i / 18) * 3.0;
    const close = parseFloat((2639 + wave1 + wave2).toFixed(2));
    const open = parseFloat((close - Math.sin(i * 1.5) * 1.2).toFixed(2));
    const high = parseFloat((Math.max(open, close) + 0.6 + Math.abs(Math.cos(i) * 0.8)).toFixed(2));
    const low = parseFloat((Math.min(open, close) - 0.6 - Math.abs(Math.sin(i) * 0.8)).toFixed(2));
    pre.push({
      timestamp: ts,
      open,
      high,
      low,
      close,
      volume: 380 + Math.floor(Math.abs(Math.sin(i)) * 320),
      isClosed: true,
    });
  }

  const post: RawCandle[] = [];
  const endTs = orig[orig.length - 1].timestamp;
  let prevClose = orig[orig.length - 1].close;

  for (let i = 1; i <= 250; i++) {
    const ts = endTs + i * 300000;
    // روند کلی متناوب صعودی-اصلاحی-تثبیت
    let drift = 0;
    if (i <= 40) drift = 0.35; // New York continuation to 2678
    else if (i <= 80) drift = -0.3; // Pullback to 2666
    else if (i <= 140) drift = 0.25; // Push to 2682
    else if (i <= 200) drift = Math.sin(i / 6) * 0.4; // Asian consolidation
    else drift = 0.3; // London morning breakout to 2698

    const noise = (Math.sin(i * 2.3) * 0.8) + (Math.cos(i * 1.7) * 0.5);
    const close = parseFloat((prevClose + drift + noise).toFixed(2));
    const open = prevClose;
    const high = parseFloat((Math.max(open, close) + 0.5 + Math.abs(Math.sin(i) * 0.9)).toFixed(2));
    const low = parseFloat((Math.min(open, close) - 0.5 - Math.abs(Math.cos(i) * 0.9)).toFixed(2));
    const vol = 450 + Math.floor(Math.abs(Math.sin(i * 0.8)) * 550);
    prevClose = close;
    post.push({ timestamp: ts, open, high, low, close, volume: vol, isClosed: true });
  }

  return [...pre, ...orig, ...post];
}

function writeFixtureFile(filePath: string, varName: string, candles: RawCandle[]) {
  const content = `import { Candle } from '../../contracts/market';

export const ${varName}: Candle[] = ${JSON.stringify(candles, null, 2)};
`;
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Wrote ${candles.length} candles to ${filePath}`);
}

const root = path.resolve(__dirname, '..');
const gold = buildGoldCandles();
writeFixtureFile(path.join(root, 'lib/replay/fixtures/gold-candles.ts'), 'GOLD_CANDLES_FIXTURE_5M', gold);

const eurusd = parseCsvCandles(path.join(root, 'public/historical/intraday/histdata-eurusd-5m-2024.csv'), 350);
writeFixtureFile(path.join(root, 'lib/replay/fixtures/eurusd-candles.ts'), 'EURUSD_CANDLES_FIXTURE_5M', eurusd);

const gbpusd = parseCsvCandles(path.join(root, 'public/historical/intraday/histdata-gbpusd-5m-2024.csv'), 350);
writeFixtureFile(path.join(root, 'lib/replay/fixtures/gbpusd-candles.ts'), 'GBPUSD_CANDLES_FIXTURE_5M', gbpusd);

const usdjpy = parseCsvCandles(path.join(root, 'public/historical/intraday/histdata-usdjpy-5m-2024.csv'), 350);
writeFixtureFile(path.join(root, 'lib/replay/fixtures/usdjpy-candles.ts'), 'USDJPY_CANDLES_FIXTURE_5M', usdjpy);

console.log('All 4 rich fixture files generated successfully!');
