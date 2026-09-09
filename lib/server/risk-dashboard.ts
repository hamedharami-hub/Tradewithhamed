import { CTraderOMS } from './ctrader-oms';
import { JournalService } from './journal-service';
import { RateLimiter } from './rate-limiter';

export interface RiskDashboardSnapshot {
  generatedAt: number;
  execution: {
    pendingOutbox: number;
    reconciliationRequired: number;
    killNewEntriesActive: boolean;
    brokerOnline: boolean;
  };
  journal: {
    openPositions: number;
    closedTrades: number;
    netProfit: number;
    winRatePercent: number;
    maxDrawdownPercent: number;
    expectancyR: number;
  };
  security: {
    rateLimitedRequests: number;
    trackedClients: number;
  };
  riskFlags: string[];
}

export function buildRiskDashboardSnapshot(): RiskDashboardSnapshot {
  const positions = JournalService.getAllPositions();
  const stats = JournalService.getStatistics();
  const records = CTraderOMS.getAllRecords();
  const blocking = CTraderOMS.hasBlockingState();
  const rateLimit = RateLimiter.getMetrics();
  const openPositions = positions.filter(position => position.status === 'OPEN').length;
  const pendingOutbox = records.filter(record => ['SUBMITTING', 'ACKNOWLEDGED'].includes(record.state)).length;
  const reconciliationRequired = records.filter(record => record.state === 'UNKNOWN_RECONCILE_REQUIRED').length;
  const riskFlags: string[] = [];

  if (blocking.blocked) riskFlags.push('EXECUTION_BLOCKED');
  if (CTraderOMS.isKillNewEntriesActive()) riskFlags.push('KILL_SWITCH_ACTIVE');
  if (reconciliationRequired > 0) riskFlags.push('RECONCILIATION_REQUIRED');
  if (stats.maxDrawdownPercent >= 5) riskFlags.push('DRAWDOWN_ABOVE_5_PERCENT');
  if (openPositions >= 3) riskFlags.push('OPEN_POSITION_LIMIT_REVIEW');

  return {
    generatedAt: Date.now(),
    execution: {
      pendingOutbox,
      reconciliationRequired,
      killNewEntriesActive: CTraderOMS.isKillNewEntriesActive(),
      brokerOnline: CTraderOMS.isBrokerOnline(),
    },
    journal: {
      openPositions,
      closedTrades: stats.totalTrades,
      netProfit: stats.totalNetProfit,
      winRatePercent: stats.winRatePercent,
      maxDrawdownPercent: stats.maxDrawdownPercent,
      expectancyR: stats.expectancyR,
    },
    security: {
      rateLimitedRequests: rateLimit.totalBlocked,
      trackedClients: rateLimit.activeTrackedIps,
    },
    riskFlags,
  };
}
