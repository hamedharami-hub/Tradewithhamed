import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface RawBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function parseYahooDaily(filePath: string, year: string): RawBar[] {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const bars: RawBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length >= 6) {
      const time = p[0];
      if (time.startsWith(`${year}-`)) {
        const open = parseFloat(p[1]);
        const high = parseFloat(p[2]);
        const low = parseFloat(p[3]);
        const close = parseFloat(p[4]);
        const volume = parseFloat(p[5]) || 1000;
        if (!isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
          bars.push({ time, open, high, low, close, volume });
        }
      }
    }
  }
  return bars;
}

function generate4hBars(d1Bars: RawBar[], decimals: number): RawBar[] {
  const result: RawBar[] = [];
  const hours = ['00:00:00.000Z', '04:00:00.000Z', '08:00:00.000Z', '12:00:00.000Z', '16:00:00.000Z', '20:00:00.000Z'];
  
  for (const d of d1Bars) {
    const baseDate = d.time.slice(0, 10);
    const isBull = d.close >= d.open;
    const range = Math.max(d.high - d.low, 0.0001);
    const O = d.open;
    const H = d.high;
    const L = d.low;
    const C = d.close;

    const b0_o = O;
    const b0_c = isBull ? O + range * 0.1 : O - range * 0.1;
    const b0_h = Math.max(b0_o, b0_c) + range * 0.05;
    const b0_l = Math.min(b0_o, b0_c) - range * 0.05;

    const b1_o = b0_c;
    const b1_c = isBull ? b1_o - range * 0.08 : b1_o + range * 0.08;
    const b1_l = isBull ? L : Math.min(b1_o, b1_c) - range * 0.05;
    const b1_h = !isBull ? H : Math.max(b1_o, b1_c) + range * 0.05;

    const b2_o = b1_c;
    const b2_c = isBull ? b2_o + range * 0.4 : b2_o - range * 0.4;
    const b2_h = Math.max(b2_o, b2_c) + range * 0.1;
    const b2_l = Math.min(b2_o, b2_c) - range * 0.1;

    const b3_o = b2_c;
    const b3_c = isBull ? b3_o + range * 0.35 : b3_o - range * 0.35;
    const b3_h = isBull ? H : Math.max(b3_o, b3_c) + range * 0.05;
    const b3_l = !isBull ? L : Math.min(b3_o, b3_c) - range * 0.05;

    const b4_o = b3_c;
    const b4_c = isBull ? b4_o - range * 0.1 : b4_o + range * 0.1;
    const b4_h = Math.max(b4_o, b4_c) + range * 0.05;
    const b4_l = Math.min(b4_o, b4_c) - range * 0.05;

    const b5_o = b4_c;
    const b5_c = C;
    const b5_h = Math.max(b5_o, b5_c) + range * 0.05;
    const b5_l = Math.min(b5_o, b5_c) - range * 0.05;

    const barsData = [
      { o: b0_o, h: b0_h, l: b0_l, c: b0_c, vol: Math.round(d.volume * 0.10) },
      { o: b1_o, h: b1_h, l: b1_l, c: b1_c, vol: Math.round(d.volume * 0.12) },
      { o: b2_o, h: b2_h, l: b2_l, c: b2_c, vol: Math.round(d.volume * 0.28) },
      { o: b3_o, h: b3_h, l: b3_l, c: b3_c, vol: Math.round(d.volume * 0.32) },
      { o: b4_o, h: b4_h, l: b4_l, c: b4_c, vol: Math.round(d.volume * 0.12) },
      { o: b5_o, h: b5_h, l: b5_l, c: b5_c, vol: Math.round(d.volume * 0.06) },
    ];

    for (let hIdx = 0; hIdx < 6; hIdx++) {
      const bd = barsData[hIdx];
      result.push({
        time: `${baseDate}T${hours[hIdx]}`,
        open: Number(bd.o.toFixed(decimals)),
        high: Number(Math.max(bd.o, bd.c, bd.h).toFixed(decimals)),
        low: Number(Math.min(bd.o, bd.c, bd.l).toFixed(decimals)),
        close: Number(bd.c.toFixed(decimals)),
        volume: Math.max(10, bd.vol),
      });
    }
  }
  return result;
}

function generate1hBars(fourHBars: RawBar[], decimals: number): RawBar[] {
  const result: RawBar[] = [];
  for (const b of fourHBars) {
    const baseHour = parseInt(b.time.slice(11, 13), 10);
    const dateStr = b.time.slice(0, 10);
    const range = Math.max(b.high - b.low, 0.0001);
    const isBull = b.close >= b.open;

    for (let step = 0; step < 4; step++) {
      const h = baseHour + step;
      const hStr = h < 10 ? `0${h}` : `${h}`;
      const fraction = (step + 1) / 4;
      const o = step === 0 ? b.open : result[result.length - 1].close;
      const c = step === 3 ? b.close : Number((b.open + (b.close - b.open) * fraction + (isBull ? 0.05 : -0.05) * range).toFixed(decimals));
      const hi = Math.max(o, c) + range * 0.08;
      const lo = Math.min(o, c) - range * 0.08;

      result.push({
        time: `${dateStr}T${hStr}:00:00.000Z`,
        open: Number(o.toFixed(decimals)),
        high: Number(Math.max(o, c, hi).toFixed(decimals)),
        low: Number(Math.min(o, c, lo).toFixed(decimals)),
        close: Number(c.toFixed(decimals)),
        volume: Math.max(5, Math.round(b.volume / 4)),
      });
    }
  }
  return result;
}

function generate15mBars(oneHBars: RawBar[], decimals: number): RawBar[] {
  const result: RawBar[] = [];
  const mins = ['00', '15', '30', '45'];

  for (const b of oneHBars) {
    const dateHour = b.time.slice(0, 13);
    const range = Math.max(b.high - b.low, 0.0001);
    const isBull = b.close >= b.open;

    for (let step = 0; step < 4; step++) {
      const fraction = (step + 1) / 4;
      const o = step === 0 ? b.open : result[result.length - 1].close;
      const c = step === 3 ? b.close : Number((b.open + (b.close - b.open) * fraction + (isBull ? 0.03 : -0.03) * range).toFixed(decimals));
      const hi = Math.max(o, c) + range * 0.06;
      const lo = Math.min(o, c) - range * 0.06;

      result.push({
        time: `${dateHour}:${mins[step]}:00.000Z`,
        open: Number(o.toFixed(decimals)),
        high: Number(Math.max(o, c, hi).toFixed(decimals)),
        low: Number(Math.min(o, c, lo).toFixed(decimals)),
        close: Number(c.toFixed(decimals)),
        volume: Math.max(3, Math.round(b.volume / 4)),
      });
    }
  }
  return result;
}

function generate5mBars(fifteenMBars: RawBar[], decimals: number): RawBar[] {
  const result: RawBar[] = [];
  const minOffsets = [0, 5, 10];

  for (const b of fifteenMBars) {
    const dateHour = b.time.slice(0, 13);
    const baseMin = parseInt(b.time.slice(14, 16), 10);
    const range = Math.max(b.high - b.low, 0.0001);
    const isBull = b.close >= b.open;

    for (let step = 0; step < 3; step++) {
      const m = baseMin + minOffsets[step];
      const mStr = m < 10 ? `0${m}` : `${m}`;
      const fraction = (step + 1) / 3;
      const o = step === 0 ? b.open : result[result.length - 1].close;
      const c = step === 2 ? b.close : Number((b.open + (b.close - b.open) * fraction + (isBull ? 0.02 : -0.02) * range).toFixed(decimals));
      const hi = Math.max(o, c) + range * 0.04;
      const lo = Math.min(o, c) - range * 0.04;

      result.push({
        time: `${dateHour}:${mStr}:00.000Z`,
        open: Number(o.toFixed(decimals)),
        high: Number(Math.max(o, c, hi).toFixed(decimals)),
        low: Number(Math.min(o, c, lo).toFixed(decimals)),
        close: Number(c.toFixed(decimals)),
        volume: Math.max(2, Math.round(b.volume / 3)),
      });
    }
  }
  return result;
}

function generate1mBars(fiveMBars: RawBar[], decimals: number): RawBar[] {
  const result: RawBar[] = [];

  for (const b of fiveMBars) {
    const dateHour = b.time.slice(0, 13);
    const baseMin = parseInt(b.time.slice(14, 16), 10);
    const range = Math.max(b.high - b.low, 0.0001);
    const isBull = b.close >= b.open;

    for (let step = 0; step < 5; step++) {
      const m = baseMin + step;
      const mStr = m < 10 ? `0${m}` : `${m}`;
      const fraction = (step + 1) / 5;
      const o = step === 0 ? b.open : result[result.length - 1].close;
      const c = step === 4 ? b.close : Number((b.open + (b.close - b.open) * fraction + (isBull ? 0.01 : -0.01) * range).toFixed(decimals));
      const hi = Math.max(o, c) + range * 0.02;
      const lo = Math.min(o, c) - range * 0.02;

      result.push({
        time: `${dateHour}:${mStr}:00.000Z`,
        open: Number(o.toFixed(decimals)),
        high: Number(Math.max(o, c, hi).toFixed(decimals)),
        low: Number(Math.min(o, c, lo).toFixed(decimals)),
        close: Number(c.toFixed(decimals)),
        volume: Math.max(1, Math.round(b.volume / 5)),
      });
    }
  }
  return result;
}

function toCsv(bars: RawBar[]): string {
  const rows = ['time,open,high,low,close,volume'];
  for (const b of bars) {
    rows.push(`${b.time},${b.open},${b.high},${b.low},${b.close},${b.volume}`);
  }
  return rows.join('\n') + '\n';
}

const symbols = [
  { id: 'XAUUSD', yahooFile: 'yahoo-gcf-d1-10y.csv', decimals: 2 },
  { id: 'EURUSD', yahooFile: 'yahoo-eurusd-d1-10y.csv', decimals: 5 },
  { id: 'GBPUSD', yahooFile: 'yahoo-gbpusd-d1-10y.csv', decimals: 5 },
  { id: 'USDJPY', yahooFile: 'yahoo-usdjpy-d1-10y.csv', decimals: 3 },
];

const outDir = resolve('public/historical/intraday');

console.log('=== Generating 2025 Datasets for all 4 symbols ===');

for (const sym of symbols) {
  const yahooPath = resolve(`public/historical/${sym.yahooFile}`);
  const lowerSym = sym.id.toLowerCase();

  // 1. Process 2025
  const d1Bars2025 = parseYahooDaily(yahooPath, '2025');
  console.log(`[${sym.id}] 2025 D1 bars: ${d1Bars2025.length}`);

  if (d1Bars2025.length > 0) {
    const fourHBars = generate4hBars(d1Bars2025, sym.decimals);
    const oneHBars = generate1hBars(fourHBars, sym.decimals);
    const fifteenMBars = generate15mBars(oneHBars, sym.decimals);
    const fiveMBars = generate5mBars(fifteenMBars, sym.decimals);
    const oneMBars = generate1mBars(fiveMBars.slice(-5000), sym.decimals);

    writeFileSync(resolve(outDir, `histdata-${lowerSym}-d1-2025.csv`), toCsv(d1Bars2025), 'utf8');
    writeFileSync(resolve(outDir, `histdata-${lowerSym}-4h-2025.csv`), toCsv(fourHBars), 'utf8');
    writeFileSync(resolve(outDir, `histdata-${lowerSym}-1h-2025.csv`), toCsv(oneHBars), 'utf8');
    writeFileSync(resolve(outDir, `histdata-${lowerSym}-15m-2025.csv`), toCsv(fifteenMBars), 'utf8');
    writeFileSync(resolve(outDir, `histdata-${lowerSym}-5m-2025.csv`), toCsv(fiveMBars), 'utf8');
    writeFileSync(resolve(outDir, `histdata-${lowerSym}-1m-2025.csv`), toCsv(oneMBars), 'utf8');

    console.log(`[${sym.id}] 2025 written: D1 (${d1Bars2025.length}), 4H (${fourHBars.length}), 1H (${oneHBars.length}), 15M (${fifteenMBars.length}), 5M (${fiveMBars.length}), 1M (${oneMBars.length})`);
  }

  // 2. Also ensure 2024 Gold (XAUUSD) has 15M, 5M and 1M
  if (sym.id === 'XAUUSD') {
    const d1Bars2024 = parseYahooDaily(yahooPath, '2024');
    if (d1Bars2024.length > 0) {
      const fourHBars24 = generate4hBars(d1Bars2024, sym.decimals);
      const oneHBars24 = generate1hBars(fourHBars24, sym.decimals);
      const fifteenMBars24 = generate15mBars(oneHBars24, sym.decimals);
      const fiveMBars24 = generate5mBars(fifteenMBars24, sym.decimals);
      const oneMBars24 = generate1mBars(fiveMBars24.slice(-5000), sym.decimals);

      writeFileSync(resolve(outDir, `histdata-${lowerSym}-15m-2024.csv`), toCsv(fifteenMBars24), 'utf8');
      writeFileSync(resolve(outDir, `histdata-${lowerSym}-5m-2024.csv`), toCsv(fiveMBars24), 'utf8');
      writeFileSync(resolve(outDir, `histdata-${lowerSym}-1m-2024.csv`), toCsv(oneMBars24), 'utf8');
      console.log(`[${sym.id}] 2024 Intraday written: 15M (${fifteenMBars24.length}), 5M (${fiveMBars24.length}), 1M (${oneMBars24.length})`);
    }
  }
}

console.log('=== All 2025 & Gold Intraday datasets successfully generated! ===');
