import { getStressScenario, STRESS_SCENARIOS } from '@/lib/stress/scenario-library';
import { runStressScenario } from '@/lib/stress/scenario-runner';
import { StressTestResult } from '@/lib/stress/contracts';

const MAX_HISTORY = 30;
const history: StressTestResult[] = [];

export class StressTestService {
  public static listScenarios() {
    return STRESS_SCENARIOS;
  }

  public static listResults(): StressTestResult[] {
    return [...history].sort((a, b) => b.completedAt - a.completedAt);
  }

  public static run(scenarioId: string, seed?: number): StressTestResult {
    const scenario = getStressScenario(scenarioId);
    if (!scenario) throw new Error('سناریوی تست استرس یافت نشد.');
    const result = runStressScenario(scenario, seed);
    history.unshift(result);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    return result;
  }

  public static resetForTesting(): void {
    history.length = 0;
  }
}
