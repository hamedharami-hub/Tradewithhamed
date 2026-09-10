import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseYahooChartPayload, type YahooChartPayload } from '../lib/research/dataset';

interface DatasetInput {
  sourcePath: string;
  outputName: string;
  symbol: string;
  providerSymbol: string;
  instrumentLabel: string;
  caveatFa?: string;
}

const inputs: DatasetInput[] = [
  { sourcePath: '/tmp/eurusd-yahoo-10y.json', outputName: 'yahoo-eurusd-d1-10y.csv', symbol: 'EURUSD', providerSymbol: 'EURUSD=X', instrumentLabel: 'EUR/USD spot reference' },
  { sourcePath: '/tmp/gbpusd-yahoo-10y.json', outputName: 'yahoo-gbpusd-d1-10y.csv', symbol: 'GBPUSD', providerSymbol: 'GBPUSD=X', instrumentLabel: 'GBP/USD spot reference' },
  { sourcePath: '/tmp/usdjpy-yahoo-10y.json', outputName: 'yahoo-usdjpy-d1-10y.csv', symbol: 'USDJPY', providerSymbol: 'JPY=X', instrumentLabel: 'USD/JPY spot reference' },
  { sourcePath: '/tmp/xauusd-yahoo-10y.json', outputName: 'yahoo-gcf-d1-10y.csv', symbol: 'XAUUSD', providerSymbol: 'GC=F', instrumentLabel: 'COMEX gold futures proxy', caveatFa: 'این فایل، قرارداد آتی طلا (GC=F) است و جایگزین دقیق قیمت XAUUSD بروکر نیست؛ فقط برای پژوهش ساختاری بلندمدت استفاده شود.' },
  { sourcePath: '/tmp/btcusd-yahoo-10y.json', outputName: 'yahoo-btcusd-d1-10y.csv', symbol: 'BTCUSD', providerSymbol: 'BTC-USD', instrumentLabel: 'Bitcoin USD composite reference' },
];

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main(): Promise<void> {
  const outputDirectory = resolve(process.cwd(), 'public/historical');
  await mkdir(outputDirectory, { recursive: true });
  const manifest: Array<Record<string, unknown>> = [];

  for (const input of inputs) {
    const payload = JSON.parse(await readFile(input.sourcePath, 'utf8')) as YahooChartPayload;
    const candles = parseYahooChartPayload(payload);
    if (candles.length === 0) throw new Error(`No OHLCV candles were parsed for ${input.symbol}.`);
    const rows = [
      'time,open,high,low,close,volume',
      ...candles.map(candle => [
        new Date(candle.timestamp).toISOString(),
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      ].map(csvEscape).join(',')),
    ];
    await writeFile(resolve(outputDirectory, input.outputName), `${rows.join('\n')}\n`);
    manifest.push({
      id: input.outputName.replace('.csv', ''),
      symbol: input.symbol,
      provider: 'Yahoo Finance',
      providerSymbol: input.providerSymbol,
      instrumentLabel: input.instrumentLabel,
      timeframe: 'D1',
      url: `/historical/${input.outputName}`,
      bars: candles.length,
      startUtc: new Date(candles[0].timestamp).toISOString(),
      endUtc: new Date(candles[candles.length - 1].timestamp).toISOString(),
      caveatFa: input.caveatFa || null,
      generatedFrom: 'Yahoo Finance chart payload acquired through Manus Data API',
    });
  }

  await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify({ version: 'bundled-historical-v1', datasets: manifest }, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, datasets: manifest.map(item => ({ symbol: item.symbol, bars: item.bars })) }, null, 2));
}

void main();
