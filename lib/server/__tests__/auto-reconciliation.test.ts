import { AutoReconciliationService } from '../auto-reconciliation-service';
import { CTraderOMS } from '../ctrader-oms';

export interface AutoReconciliationTestResult { name: string; passed: boolean; details: string; }

export async function runAutoReconciliationTests(): Promise<AutoReconciliationTestResult[]> {
  const service = AutoReconciliationService.getInstance();
  service.resetForTesting();
  CTraderOMS.setBrokerConnection(false);
  const result = await service.request('STARTUP');
  const status = service.getStatus();
  return [
    {
      name: 'startup reconciliation defers while broker is disconnected',
      passed: result === null && status.running === false && status.lastError?.includes('BROKER_DISCONNECTED') === true,
      details: `result=${result === null ? 'deferred' : 'unexpected'}, running=${status.running}`,
    },
    {
      name: 'automatic reconciliation starts with no stale lock',
      passed: status.queued === false && status.consecutiveFailures === 0,
      details: `queued=${status.queued}, failures=${status.consecutiveFailures}`,
    },
  ];
}
