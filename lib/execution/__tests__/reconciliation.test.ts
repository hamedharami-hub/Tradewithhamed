import { CTraderOMS } from '@/lib/server/ctrader-oms';
import { BrokerAccountSnapshot } from '../reconciliation';

export interface ReconciliationTestResult { name: string; passed: boolean; details: string; }

export function runReconciliationTests(): ReconciliationTestResult[] {
  const snapshot: BrokerAccountSnapshot = { accountId: 1001, receivedAt: Date.now(), orders: [], positions: [] };
  const report = CTraderOMS.reconcileSnapshot(snapshot);
  return [
    {
      name: 'empty broker snapshot never fabricates an order state',
      passed: report.matchedIntentIds.length === 0 && report.updatedStates.length === 0,
      details: `matched=${report.matchedIntentIds.length}, updated=${report.updatedStates.length}`,
    },
    {
      name: 'empty broker snapshot is structurally reconciled when no blocking record exists',
      passed: report.reconciled === true && report.accountId === 1001,
      details: `reconciled=${report.reconciled}, account=${report.accountId}`,
    },
  ];
}
