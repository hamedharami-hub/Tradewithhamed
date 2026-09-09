import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeStage8Events, type Stage8Event } from '../lib/research/stage8-analysis';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const input = arg('--input') || process.env.STAGE8_REPORT;
  const output = arg('--output') || process.env.STAGE8_ANALYSIS_OUTPUT;
  if (!input || !output) throw new Error('Usage: tsx scripts/analyze-stage8-paper-forward.ts --input <events.jsonl> --output <analysis.json>');
  const lines = (await readFile(resolve(input), 'utf8')).split('\n').map(line => line.trim()).filter(Boolean);
  const events: Stage8Event[] = lines.map((line, index) => {
    try { return JSON.parse(line) as Stage8Event; }
    catch { throw new Error(`STAGE8_EVENT_JSON_INVALID_LINE_${index + 1}`); }
  });
  const analysis = analyzeStage8Events(events);
  await writeFile(resolve(output), `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ input: resolve(input), output: resolve(output), closedTrades: analysis.closedTrades, brokerWrites: analysis.brokerWrites, sampleStatus: analysis.sampleStatus }, null, 2));
  if (analysis.brokerWrites > 0) process.exitCode = 4;
}

void main();
