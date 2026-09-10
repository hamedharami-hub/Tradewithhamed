import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Report = { symbol: string; timeframe: string; summaries: Array<{ variant: string; totalTrades: number; winRatePercent: number; netProfit: number; profitFactor: number; maxDrawdownPercent: number; status: string }> };
async function main(): Promise<void> {
const input = JSON.parse(await readFile(resolve('data/runs/bundled-higher-timeframes-shortlist-20260910.json'), 'utf8')) as { reports: Report[] };
const rows = input.reports.flatMap(report => report.summaries.map(summary => ({ symbol: report.symbol, timeframe: report.timeframe, ...summary })));
rows.sort((a, b) => b.netProfit - a.netProfit);
const markdown = [
  '# خلاصهٔ baseline shortlist چندتایم‌فریمی',
  '',
  '| نماد | TF | روش | معاملات | Win rate | Net PnL | PF | Max DD | وضعیت |',
  '|---|---:|---|---:|---:|---:|---:|---:|---|',
  ...rows.map(row => `| ${row.symbol} | ${row.timeframe} | ${row.variant} | ${row.totalTrades} | ${row.winRatePercent.toFixed(1)}% | ${row.netProfit.toFixed(2)} | ${row.profitFactor.toFixed(2)} | ${row.maxDrawdownPercent.toFixed(2)}% | ${row.status} |`),
  '',
  'این خروجی baseline پژوهشی است؛ AI خاموش بوده، هزینهٔ spread نماد، slippage برابر ۰٫۲ پیپ و commission مدل نماد اعمال شده است. این نتایج broker-match یا تضمین عملکرد آینده نیستند.',
].join('\n');
await writeFile(resolve('docs/higher-timeframes-shortlist-baseline-fa.md'), `${markdown}\n`);
console.log(markdown);
}
void main();
