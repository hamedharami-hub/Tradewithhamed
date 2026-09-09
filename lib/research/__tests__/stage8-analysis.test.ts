import { analyzeStage8Events, bootstrapPnl } from '../stage8-analysis';

export interface Stage8AnalysisTestResult { name: string; passed: boolean; details: string; }

const trade = {
  paperTradeId: 'PAPER-1', candidateId: 'candidate-1', environment: 'PAPER_LIVE' as const, brokerWrites: false as const,
  symbol: 'GBPUSD' as const, timeframe: '1M' as const, direction: 'BUY' as const, volumeLots: 0.01,
  entryPrice: 1.25, stopLossPrice: 1.24, takeProfitPrice: 1.27, expiresAtTimestamp: 1_800_000_600_000,
  openedTimestamp: 1_800_000_060_000, closedTimestamp: 1_800_000_120_000, exitPrice: 1.27,
  closeReason: 'TP' as const, grossPnl: 20, realizedPnl: 19.94, commissionPaid: 0.06, isOpen: false,
};

export function runStage8AnalysisTests(): Stage8AnalysisTestResult[] {
  const events = [
    { status: 'CANDIDATE_REVIEWED', brokerWrites: false, analystProvider: 'DETERMINISTIC' },
    { status: 'CANDIDATE_APPROVED', brokerWrites: false, analystProvider: 'DETERMINISTIC' },
    { status: 'PAPER_TRADE_CLOSED', brokerWrites: false, analystProvider: 'DETERMINISTIC', paperTrade: trade },
    { status: 'FEED_GAP', brokerWrites: false },
  ];
  const analysis = analyzeStage8Events(events);
  const firstBootstrap = bootstrapPnl([1, -0.5, 2], 100, 42);
  const secondBootstrap = bootstrapPnl([1, -0.5, 2], 100, 42);
  const invalid = analyzeStage8Events([{ status: 'PAPER_TRADE_CLOSED', brokerWrites: true, payloadType: 2106, paperTrade: trade }]);
  return [
    { name: 'Stage 8 analysis reports required event counts and local PnL', passed: analysis.candidateReviews === 1 && analysis.approvals === 1 && analysis.closedTrades === 1 && analysis.feedGaps === 1 && analysis.netPnl === 19.94 && analysis.bySessionUtc.length === 1, details: JSON.stringify({ reviews: analysis.candidateReviews, approvals: analysis.approvals, trades: analysis.closedTrades, pnl: analysis.netPnl, sessions: analysis.bySessionUtc }) },
    { name: 'Stage 8 analysis labels fewer than 30 trades insufficient', passed: analysis.sampleStatus === 'INSUFFICIENT_SAMPLE', details: analysis.sampleStatus },
    { name: 'Stage 8 bootstrap is deterministic for a fixed seed', passed: JSON.stringify(firstBootstrap) === JSON.stringify(secondBootstrap), details: JSON.stringify(firstBootstrap) },
    { name: 'Stage 8 analysis invalidates any broker-write signal', passed: invalid.brokerWrites === 1 && invalid.warnings.includes('BROKER_WRITES_NONZERO_RESULT_INVALID'), details: JSON.stringify({ brokerWrites: invalid.brokerWrites, warnings: invalid.warnings }) },
  ];
}
