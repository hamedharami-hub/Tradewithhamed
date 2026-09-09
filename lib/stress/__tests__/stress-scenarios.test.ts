import { getStressScenario } from '../scenario-library';
import { runStressScenario } from '../scenario-runner';

export interface StressScenarioTestResult { name: string; passed: boolean; details: string; }

export function runStressScenarioTests(): StressScenarioTestResult[] {
  const cases = [
    ['xauusd-flash-crash-5pct', 'flash crash blocks critical market safely'],
    ['eurusd-stale-feed-10s', 'stale feed prevents new orders'],
    ['xauusd-duplicate-submit', 'duplicate submits remain idempotent'],
    ['eurusd-broker-timeout', 'broker timeout requires reconciliation'],
  ] as const;
  return cases.map(([scenarioId, name]) => {
    const scenario = getStressScenario(scenarioId);
    const result = scenario ? runStressScenario(scenario, 12345) : undefined;
    const passed = Boolean(result && result.passed && result.invariantViolations.length === 0);
    return { name, passed, details: passed ? `status=${result?.status}` : `violations=${result?.invariantViolations.join(',') || 'scenario missing'}` };
  });
}
