import { buildRiskDashboardSnapshot } from '../risk-dashboard';

export interface RiskDashboardTestResult {
  name: string;
  passed: boolean;
  details: string;
}

export function runRiskDashboardTests(): RiskDashboardTestResult[] {
  const snapshot = buildRiskDashboardSnapshot();
  const hasExecutionFields =
    typeof snapshot.execution.pendingOutbox === 'number' &&
    typeof snapshot.execution.reconciliationRequired === 'number' &&
    typeof snapshot.execution.killNewEntriesActive === 'boolean' &&
    typeof snapshot.execution.brokerOnline === 'boolean';
  const hasJournalFields =
    typeof snapshot.journal.netProfit === 'number' &&
    typeof snapshot.journal.winRatePercent === 'number' &&
    typeof snapshot.journal.maxDrawdownPercent === 'number' &&
    typeof snapshot.journal.expectancyR === 'number';
  const flagsAreSafe = snapshot.riskFlags.every(flag => /^[A-Z0-9_]+$/.test(flag));
  return [
    {
      name: 'Risk dashboard snapshot has stable execution contract',
      passed: hasExecutionFields,
      details: hasExecutionFields ? 'execution contract is valid' : 'execution contract is incomplete',
    },
    {
      name: 'Risk dashboard snapshot has stable journal contract',
      passed: hasJournalFields,
      details: hasJournalFields ? 'journal contract is valid' : 'journal contract is incomplete',
    },
    {
      name: 'Risk dashboard flags are machine-readable',
      passed: flagsAreSafe,
      details: flagsAreSafe ? 'flags use uppercase snake case' : 'flag format is invalid',
    },
  ];
}
