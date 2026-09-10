import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Candle } from '../lib/contracts/market';
import { createDatasetFromCandles } from '../lib/research/dataset';
import {
  ReadOnlyCTraderClient,
  getReadOnlyCTraderConfig,
  type CTraderHistoryPeriod,
  type ReadOnlyHistoricalBarsResponse,
  type ReadOnlyQuote,
} from '../lib/gateway/readonly-ctrader';

const MIN_GATE1_M1_BARS = 1_000;
const HISTORY_REQUEST_TIMEOUT_MS = 25_000;
const QUOTE_OBSERVATION_WINDOW_MS = 4_000;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseUtc(value: string | undefined, name: string): number {
  if (!value) throw new Error(`Missing ${name}. Use ISO-8601 UTC, e.g. 2026-08-01T00:00:00Z.`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || !value.endsWith('Z')) throw new Error(`${name} must be an ISO-8601 UTC timestamp ending in Z.`);
  return timestamp;
}

function requirePeriod(value: string | undefined): CTraderHistoryPeriod {
  if (value === 'M1' || value === 'M5') return value;
  throw new Error('--timeframe must be M1 or M5.');
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function waitForSymbolDiscovery(client: ReadOnlyCTraderClient): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('CTRADER_READ_ONLY_HISTORY_SYMBOL_DISCOVERY_TIMEOUT'));
    }, HISTORY_REQUEST_TIMEOUT_MS);
    const unsubscribe = client.onSymbolDiscovery(({ available }) => {
      if (!available.some(item => item.symbol === 'USDJPY')) {
        clearTimeout(timeout);
        unsubscribe();
        reject(new Error('CTRADER_READ_ONLY_HISTORY_USDJPY_NOT_AVAILABLE_IN_DEMO_ACCOUNT'));
        return;
      }
      clearTimeout(timeout);
      unsubscribe();
      resolvePromise();
    });
  });
}

function requestBars(client: ReadOnlyCTraderClient, input: { timeframe: CTraderHistoryPeriod; fromTimestamp: number; toTimestamp: number }): Promise<ReadOnlyHistoricalBarsResponse> {
  return new Promise((resolvePromise, reject) => {
    let requestId = '';
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`CTRADER_READ_ONLY_HISTORY_TIMEOUT:${new Date(input.fromTimestamp).toISOString()}`));
    }, HISTORY_REQUEST_TIMEOUT_MS);
    const unsubscribe = client.onHistoricalBars(response => {
      if (response.requestId !== requestId) return;
      clearTimeout(timeout);
      unsubscribe();
      resolvePromise(response);
    });
    try {
      requestId = client.requestHistoricalBars({ symbol: 'USDJPY', ...input, count: 5_000 });
    } catch (error) {
      clearTimeout(timeout);
      unsubscribe();
      reject(error);
    }
  });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const center = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[center] : (ordered[center - 1] + ordered[center]) / 2;
}

async function main(): Promise<void> {
  const preflight = getReadOnlyCTraderConfig();
  if (!preflight.configured || !preflight.config) {
    console.error(JSON.stringify({
      status: 'BLOCKED',
      reason: preflight.reason || 'CTRADER_READ_ONLY_PREFLIGHT_FAILED',
      safetyChecks: preflight.safetyChecks,
      brokerWrites: false,
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (!preflight.config.requestedSymbols.includes('USDJPY')) {
    throw new Error('MONITOR_SYMBOLS must include USDJPY for the Gate 1 exporter.');
  }

  const timeframe = requirePeriod(arg('--timeframe'));
  const fromTimestamp = parseUtc(arg('--from'), '--from');
  const toTimestamp = parseUtc(arg('--to'), '--to');
  const outputDir = resolve(arg('--output-dir') || 'data/gate1/ctrader-demo-usdjpy');
  const chunkHours = Number(arg('--chunk-hours') || '72');
  if (!Number.isInteger(chunkHours) || chunkHours < 1 || chunkHours > 72) throw new Error('--chunk-hours must be a whole number between 1 and 72.');
  if (toTimestamp <= fromTimestamp) throw new Error('--to must be later than --from.');
  if (toTimestamp - fromTimestamp > 45 * 24 * 60 * 60 * 1000) throw new Error('Gate 1 exporter accepts at most 45 calendar days per invocation. Use multiple non-overlapping files for longer coverage.');

  const client = new ReadOnlyCTraderClient(preflight.config);
  const quotes: ReadOnlyQuote[] = [];
  const unsubscribeQuotes = client.onQuote(quote => {
    if (quote.symbol === 'USDJPY' && Number.isFinite(quote.ask - quote.bid) && quote.ask > quote.bid) quotes.push(quote);
  });
  try {
    client.start();
    await waitForSymbolDiscovery(client);
    const chunks: ReadOnlyHistoricalBarsResponse[] = [];
    const chunkMilliseconds = chunkHours * 60 * 60 * 1000;
    for (let chunkStart = fromTimestamp; chunkStart < toTimestamp; chunkStart += chunkMilliseconds) {
      const chunkEnd = Math.min(chunkStart + chunkMilliseconds, toTimestamp);
      const response = await requestBars(client, { timeframe, fromTimestamp: chunkStart, toTimestamp: chunkEnd });
      if (response.hasMore) throw new Error(`CTRADER_READ_ONLY_HISTORY_RESPONSE_TRUNCATED:${new Date(chunkStart).toISOString()}; reduce --chunk-hours.`);
      chunks.push(response);
      await sleep(250);
    }
    await sleep(QUOTE_OBSERVATION_WINDOW_MS);

    const providerSymbol = chunks[0]?.providerSymbol;
    if (!providerSymbol) throw new Error('CTRADER_READ_ONLY_HISTORY_USDJPY_RESPONSE_EMPTY');
    const bars = [...new Map(chunks.flatMap(chunk => chunk.bars).map(bar => [bar.timestamp, bar])).values()].sort((left, right) => left.timestamp - right.timestamp);
    const candles: Candle[] = bars.map(bar => ({ timestamp: bar.timestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, isClosed: true }));
    const hash = createHash('sha256').update(JSON.stringify(candles.map(candle => [candle.timestamp, candle.open, candle.high, candle.low, candle.close, candle.volume]))).digest('hex');
    const dataset = createDatasetFromCandles({
      candles,
      provider: 'cTrader Demo Open API',
      providerSymbol,
      canonicalSymbol: 'USDJPY',
      instrumentLabel: `USDJPY cTrader Demo ${timeframe} historical trendbars`,
      timeframe: timeframe === 'M1' ? '1M' : '5M',
      rawSourcePath: 'cTrader Open API ProtoOAGetTrendbarsRes',
      contentSha256: hash,
      sourceLicense: 'cTrader Open API data from the authorised Demo account; local research use only.',
    });
    const spreadsInPips = quotes.map(quote => (quote.ask - quote.bid) / 0.01);
    const quoteSummary = {
      samples: quotes.length,
      firstTimestamp: quotes[0]?.timestamp || null,
      lastTimestamp: quotes.at(-1)?.timestamp || null,
      medianPips: median(spreadsInPips),
      minimumPips: spreadsInPips.length ? Math.min(...spreadsInPips) : null,
      maximumPips: spreadsInPips.length ? Math.max(...spreadsInPips) : null,
    };
    dataset.manifest.notes.unshift(
      'Gate 1 data was retrieved by the application from cTrader Demo Open API using the SCOPE_VIEW read-only path.',
      `cTrader provider symbol: ${providerSymbol}; cTrader account ID intentionally omitted from artifact.`,
      `Requested interval: ${new Date(fromTimestamp).toISOString()} to ${new Date(toTimestamp).toISOString()}; chunks=${chunks.length}; timeframe=${timeframe}.`,
      `Observed live USDJPY bid/ask samples after discovery: ${quoteSummary.samples}; median spread in pips: ${quoteSummary.medianPips ?? 'NOT_OBSERVED'}.`,
    );
    const gatePassed = dataset.manifest.status === 'READY'
      && dataset.manifest.acceptedBars >= (timeframe === 'M1' ? MIN_GATE1_M1_BARS : Math.ceil(MIN_GATE1_M1_BARS / 5))
      && dataset.manifest.gapsDetected === 0
      && dataset.manifest.duplicateBars === 0
      && quoteSummary.samples >= 1;
    const basename = `usdjpy-ctrader-demo-${timeframe.toLowerCase()}-${new Date(fromTimestamp).toISOString().slice(0, 10)}-${new Date(toTimestamp).toISOString().slice(0, 10)}`;
    await mkdir(outputDir, { recursive: true });
    const csvPath = resolve(outputDir, `${basename}.csv`);
    const datasetPath = resolve(outputDir, `${basename}.dataset.json`);
    const reportPath = resolve(outputDir, `${basename}.gate1-report.json`);
    const csv = ['time,open,high,low,close,volume', ...dataset.candles.map(candle => `${new Date(candle.timestamp).toISOString()},${candle.open},${candle.high},${candle.low},${candle.close},${candle.volume}`)].join('\n').concat('\n');
    const report = {
      version: 'ctrader-demo-usdjpy-gate1-v1',
      generatedAt: new Date().toISOString(),
      status: gatePassed ? 'PASS' : 'HOLD',
      gate: 'GATE_1_BROKER_MATCHED_DATA',
      brokerWrites: false,
      endpoint: 'demo.ctraderapi.com:5036',
      scope: 'SCOPE_VIEW',
      requested: { canonicalSymbol: 'USDJPY', timeframe, fromTimestamp, toTimestamp, chunkHours },
      providerSymbol,
      datasetManifest: dataset.manifest,
      quoteSummary,
      criteria: {
        expectedProvider: 'cTrader Demo Open API',
        canonicalSymbol: 'USDJPY',
        minimumAcceptedBars: timeframe === 'M1' ? MIN_GATE1_M1_BARS : Math.ceil(MIN_GATE1_M1_BARS / 5),
        maximumNonWeekendGaps: 0,
        maximumDuplicateBars: 0,
        minimumObservedBidAskSamples: 1,
      },
      artifacts: { csvPath, datasetPath, reportPath },
      nextAction: gatePassed
        ? 'Run Gate 2 Walk-Forward and cost stress with the resulting dataset. Do not optimize strategy parameters.'
        : 'Resolve the failed criterion, export a fresh timestamped file, and re-run this script. Do not treat a template or public third-party CSV as broker-matched data.',
    };
    await writeFile(csvPath, csv, 'utf8');
    await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: report.status, brokerWrites: false, providerSymbol, acceptedBars: dataset.manifest.acceptedBars, gapsDetected: dataset.manifest.gapsDetected, duplicateBars: dataset.manifest.duplicateBars, quoteSummary, artifacts: report.artifacts }, null, 2));
    if (!gatePassed) process.exitCode = 3;
  } finally {
    unsubscribeQuotes();
    client.stop();
  }
}

void main();
