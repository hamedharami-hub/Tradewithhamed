import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { DataWorkbench } from '../lib/core/data-workbench';
import type { HistoricalDataset } from '../lib/research/contracts';
import type { Candle, SymbolId, Timeframe } from '../lib/contracts/market';

const symbols = ['EURUSD','GBPUSD','USDJPY','XAUUSD'] as SymbolId[];
const timeframes = ['1M','5M','15M','1H','4H','D1'] as Timeframe[];
const root = resolve('data');
const rawDir = resolve('data/raw/histdata/multi-year');
const outDir = resolve('data/datasets/histdata/multi-year');
const years = process.argv.slice(2).filter(value => /^20\d\d$/.test(value));

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (const symbol of symbols) {
    const all: Candle[] = [];
    for (const year of years) {
      const files = (await readdir(rawDir)).filter(file => file.includes(`_${symbol}_M1_${year}.zip`));
      if (!files.length) continue;
      const { execFileSync } = await import('node:child_process');
      const text = execFileSync('unzip', ['-p', join(rawDir, files[0])], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
      for (const line of text.split(/\r?\n/)) {
        const parts = line.trim().split(';'); if (parts.length !== 6) continue;
        const m = /^(\d{8})\s+(\d{6})$/.exec(parts[0]); if (!m) continue;
        const d=m[1], t=m[2]; const ts=Date.UTC(Number(d.slice(0,4)),Number(d.slice(4,6))-1,Number(d.slice(6,8)),Number(t.slice(0,2))+5,Number(t.slice(2,4)),Number(t.slice(4,6)));
        const [open,high,low,close,volume]=parts.slice(1).map(Number); if (![ts,open,high,low,close,volume].every(Number.isFinite)) continue;
        all.push({timestamp:ts,open,high,low,close,volume,isClosed:true});
      }
    }
    const unique = [...new Map(all.sort((a,b)=>a.timestamp-b.timestamp).map(c=>[c.timestamp,c])).values()];
    if (unique.length === 0) {
      console.log(JSON.stringify({ symbol, status: 'SKIPPED_NO_RAW_FILES', years }));
      continue;
    }
    const sourceHash = createHash('sha256').update(JSON.stringify(unique.map(c=>[c.timestamp,c.open,c.high,c.low,c.close,c.volume]))).digest('hex');
    const base = createDatasetFromCandles({ candles: unique, provider: 'HistData multi-year', providerSymbol: symbol, canonicalSymbol: symbol, instrumentLabel: `${symbol} multi-year HistData M1`, timeframe: '1M', rawSourcePath: `data/raw/histdata/multi-year/${symbol}`, contentSha256: sourceHash, sourceLicense: 'HistData public historical data; research use; verify redistribution terms before publication.' });
    base.manifest.notes.unshift(`Merged years: ${years.join(',')}; fixed EST (UTC-05:00) converted to UTC.`);
    await writeFile(resolve(outDir, `histdata-${symbol.toLowerCase()}-1m-${years[0]}-${years.at(-1)}.dataset.json`), JSON.stringify(base));
    console.log(JSON.stringify({symbol,timeframe:'1M',bars:base.candles.length,start:base.manifest.startTime,end:base.manifest.endTime,status:base.manifest.status}));
    for (const timeframe of timeframes.slice(1)) {
      const aggregated = DataWorkbench.aggregateCandles(unique, timeframe).filter(c=>c.isClosed);
      const derived = createDatasetFromCandles({ candles: aggregated, provider: 'HistData multi-year aggregated', providerSymbol: symbol, canonicalSymbol: symbol, instrumentLabel: `${symbol} multi-year HistData ${timeframe}`, timeframe, rawSourcePath: `data/raw/histdata/multi-year/${symbol}`, contentSha256: createHash('sha256').update(`${sourceHash}:${timeframe}:${aggregated.length}`).digest('hex'), sourceLicense: base.manifest.sourceLicense });
      derived.manifest.notes.unshift(`Derived from merged M1 dataset ${base.manifest.datasetId}; complete closed buckets only.`);
      await writeFile(resolve(outDir, `histdata-${symbol.toLowerCase()}-${timeframe.toLowerCase()}-${years[0]}-${years.at(-1)}.dataset.json`), JSON.stringify(derived));
      console.log(JSON.stringify({symbol,timeframe,bars:derived.candles.length,start:derived.manifest.startTime,end:derived.manifest.endTime,status:derived.manifest.status}));
    }
  }
}
void main();
