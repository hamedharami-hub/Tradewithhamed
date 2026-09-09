import { mapExecutionType, stateForExecution } from '../ctrader-execution';

export interface ExecutionTestResult { name: string; passed: boolean; details: string; }

export function runExecutionContractTests(): ExecutionTestResult[] {
  const cases = [
    ['accepted maps to ACKNOWLEDGED', 2, 'ACKNOWLEDGED'],
    ['filled maps to FILLED', 3, 'FILLED'],
    ['partial maps to PARTIALLY_FILLED', 11, 'PARTIALLY_FILLED'],
    ['rejected maps to REJECTED_BY_BROKER', 7, 'REJECTED_BY_BROKER'],
    ['cancelled maps to CANCELLED', 5, 'CANCELLED'],
  ] as const;
  return cases.map(([name, numeric, expected]) => {
    const actual = stateForExecution(mapExecutionType(numeric));
    return { name, passed: actual === expected, details: `actual=${actual}, expected=${expected}` };
  });
}
