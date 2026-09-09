import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import { StrategyCandidate } from '@/lib/contracts/strategy';
import { CTraderReadOnlyTransport, validateReadOnlyPreflight } from '@/lib/gateway/ctrader-readonly-transport';
import { Stage8PaperLedger } from '@/lib/research/stage8-paper-ledger';
import { Stage8AdvisorProviderKind, Stage8ProviderRegistry } from '@/lib/ai/stage8-provider-registry';
import { evaluateResearchStrategy } from '@/lib/research/strategy-rules';

export interface Stage8MonitorLogEntry {
  type:
    | 'MANIFEST'
    | 'DISCOVERY'
    | 'UNAVAILABLE_SYMBOL'
    | 'BAR_CLOSED'
    | 'STRATEGY_SIGNAL'
    | 'ADVISORY_REVIEW'
    | 'PAPER_POSITION_OPENED'
    | 'PAPER_POSITION_CLOSED'
    | 'DAILY_SUMMARY'
    | 'SHUTDOWN'
    | 'ERROR';
  timestamp: number;
  isoTime: string;
  symbol?: string;
  timeframe?: string;
  payload: Record<string, unknown>;
  readonly brokerWrites: false;
}

export class Stage8PaperForwardMonitor {
  public readonly brokerWrites = false as const;
  private readonly ledger: Stage8PaperLedger;
  private readonly symbolBars = new Map<SymbolId, Candle[]>();
  private readonly reportPath: string;
  private isRunning = false;
  private barsReceived = 0;
  private signalsFound = 0;

  constructor(
    private readonly symbols: SymbolId[],
    private readonly timeframe: Timeframe,
    private readonly provider: Stage8AdvisorProviderKind,
    reportDir: string
  ) {
    this.ledger = new Stage8PaperLedger(10000);
    const primarySymbol = symbols[0]?.toLowerCase() || 'multi';
    this.reportPath = resolve(reportDir, `${primarySymbol}-monitor-report.jsonl`);
    for (const s of symbols) {
      this.symbolBars.set(s, []);
    }
  }

  public async log(type: Stage8MonitorLogEntry['type'], payload: Record<string, unknown>, symbol?: string): Promise<void> {
    const entry: Stage8MonitorLogEntry = {
      type,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      symbol,
      timeframe: this.timeframe,
      payload,
      brokerWrites: false,
    };
    const line = JSON.stringify(entry) + '\n';
    try {
      await appendFile(this.reportPath, line, 'utf8');
    } catch {
      // Fallback to console if file write fails
      console.log(line.trim());
    }
  }

  public async init(): Promise<void> {
    const dir = resolve(this.reportPath, '..');
    await mkdir(dir, { recursive: true });
    await this.log('MANIFEST', {
      version: 'stage8-paper-forward-v1',
      symbols: this.symbols,
      timeframe: this.timeframe,
      provider: this.provider,
      initialBalance: this.ledger.initialBalance,
      rules: 'S0_SWEEP_FVG',
      brokerWrites: false,
      mode: 'READ_ONLY_PAPER_FORWARD',
    });
    this.isRunning = true;
  }

  public async onClosedBar(symbol: SymbolId, candle: Candle): Promise<void> {
    if (!this.isRunning) return;
    this.barsReceived++;

    const bars = this.symbolBars.get(symbol) || [];
    bars.push(candle);
    this.symbolBars.set(symbol, bars);

    // 1. Update ledger for open positions
    const closed = this.ledger.onBarUpdate(symbol, candle);
    for (const trade of closed) {
      await this.log('PAPER_POSITION_CLOSED', {
        tradeId: trade.id,
        direction: trade.direction,
        pnl: trade.pnl,
        pnlPips: trade.pnlPips,
        closeReason: trade.closeReason,
        closePrice: trade.closePrice,
        balance: this.ledger.getMetrics().currentBalance,
      }, symbol);
    }

    // 2. Log bar close
    await this.log('BAR_CLOSED', {
      timestamp: candle.timestamp,
      close: candle.close,
      high: candle.high,
      low: candle.low,
      volume: candle.volume,
    }, symbol);

    // Need sufficient bars for sweep and FVG evaluation (at least 20 bars)
    if (bars.length < 20) return;

    // 3. Strategy evaluation
    const candidate = evaluateResearchStrategy(bars, symbol, this.timeframe, 'S0_SWEEP_FVG');
    if (!candidate) return;
    this.signalsFound++;

    await this.log('STRATEGY_SIGNAL', {
      candidateId: candidate.id,
      direction: candidate.direction,
      entryPrice: candidate.entryPrice,
      stopLossPrice: candidate.stopLossPrice,
      takeProfitPrice: candidate.takeProfitPrice,
      riskRewardRatio: candidate.riskRewardRatio,
      evidence: candidate.evidenceIds,
    }, symbol);

    // 4. Advisory review
    const review = await Stage8ProviderRegistry.reviewCandidate({
      candidate,
      provider: this.provider,
    });

    await this.log('ADVISORY_REVIEW', {
      provider: review.provider,
      status: review.status,
      approved: review.approved,
      latencyMs: review.latencyMs,
      advisory: review.advisory,
      reason: review.reason,
    }, symbol);

    // 5. Open paper position if approved
    if (review.approved) {
      const paperTrade = this.ledger.openPosition({
        symbol,
        direction: candidate.direction,
        volumeLots: 0.1,
        entryPrice: candidate.entryPrice,
        stopLoss: candidate.stopLossPrice,
        takeProfit: candidate.takeProfitPrice,
        entryTime: candle.timestamp,
        advisorMetadata: {
          provider: review.provider,
          modelId: review.modelId,
          confidence: review.advisory?.confidence || 0.7,
          latencyMs: review.latencyMs,
          decision: review.advisory?.decision,
          rationale: review.advisory?.rationaleFa,
        },
      });

      await this.log('PAPER_POSITION_OPENED', {
        tradeId: paperTrade.id,
        direction: paperTrade.direction,
        volumeLots: paperTrade.volumeLots,
        entryPrice: paperTrade.entryPrice,
        stopLoss: paperTrade.stopLoss,
        takeProfit: paperTrade.takeProfit,
      }, symbol);
    }
  }

  public async emitDailySummary(): Promise<void> {
    const metrics = this.ledger.getMetrics();
    await this.log('DAILY_SUMMARY', {
      barsReceived: this.barsReceived,
      signalsFound: this.signalsFound,
      metrics,
    });
  }

  public async shutdown(): Promise<void> {
    this.isRunning = false;
    const metrics = this.ledger.getMetrics();
    await this.log('SHUTDOWN', {
      finalMetrics: metrics,
      closedTradesCount: metrics.closedTrades,
      netPnl: metrics.netPnl,
    });
  }

  public getLedger(): Stage8PaperLedger {
    return this.ledger;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const symbolArg = args.find(a => a.startsWith('--symbol='))?.split('=')[1] || process.env.MONITOR_SYMBOL || 'GBPUSD';
  const symbols = symbolArg.split(',').map(s => s.trim().toUpperCase() as SymbolId);
  const timeframe = (args.find(a => a.startsWith('--timeframe='))?.split('=')[1] || process.env.MONITOR_TIMEFRAME || '5M') as Timeframe;
  const provider = (args.find(a => a.startsWith('--provider='))?.split('=')[1] || process.env.MONITOR_ANALYST_PROVIDER || 'DETERMINISTIC') as Stage8AdvisorProviderKind;
  const reportDir = args.find(a => a.startsWith('--report-dir='))?.split('=')[1] || process.env.STAGE8_REPORT_DIR || 'data/runs/stage8-30d';

  const monitor = new Stage8PaperForwardMonitor(symbols, timeframe, provider, reportDir);
  await monitor.init();
  console.log(`[STAGE8] Initialized monitor for ${symbols.join(',')} (${timeframe}) with provider ${provider}`);

  // Check if cTrader live read-only transport is requested
  const runCtrader = process.env.RUN_CTRADER === '1' || args.includes('--ctrader');
  if (runCtrader) {
    const preflight = validateReadOnlyPreflight();
    if (!preflight.valid || !preflight.config) {
      console.error(`[STAGE8 PREFLIGHT FAILED] ${preflight.reason}`);
      await monitor.log('ERROR', { reason: preflight.reason || 'PREFLIGHT_FAILED' });
      process.exit(1);
    }

    console.log(`[STAGE8] Connecting fail-closed read-only transport to ${preflight.config.host}:${preflight.config.port}...`);
    const transport = new CTraderReadOnlyTransport(preflight.config);

    transport.onEvent(async event => {
      if (event.type === 'UNAVAILABLE_SYMBOL') {
        await monitor.log('UNAVAILABLE_SYMBOL', { symbol: event.symbol, reason: event.reason });
      }
    });

    transport.onBarClosed(async bar => {
      if (bar.timeframe === timeframe && symbols.includes(bar.symbol as SymbolId)) {
        await monitor.onClosedBar(bar.symbol as SymbolId, bar.candle);
      }
    });

    transport.start();

    // Daily summary interval (every 24 hours)
    setInterval(() => {
      void monitor.emitDailySummary();
    }, 24 * 60 * 60 * 1000);

    const cleanup = async () => {
      console.log('\n[STAGE8] Shutting down monitor...');
      transport.stop();
      await monitor.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } else {
    console.log('[STAGE8] RUN_CTRADER is not active. Monitor initialized in standalone file logging mode.');
    await monitor.emitDailySummary();
    await monitor.shutdown();
  }
}

const isDirectRun = Boolean(process.argv[1] && process.argv[1].includes('run-stage8-paper-forward-monitor'));
if (isDirectRun) {
  void main();
}
