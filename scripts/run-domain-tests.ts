type TestSuite = { name: string; run: () => Promise<unknown[]> | unknown[] };

const suiteModules = [
  '../lib/core/__tests__/core.test',
  '../lib/core/__tests__/w2-acceptance.test',
  '../lib/core/__tests__/w3-acceptance.test',
  '../lib/core/__tests__/w4-acceptance.test',
  '../lib/core/__tests__/w5-acceptance.test',
  '../lib/server/__tests__/stage8-security-dr.test',
  '../lib/server/__tests__/stage9-health-smoke.test',
  '../lib/server/__tests__/risk-dashboard.test',
  '../lib/stress/__tests__/stress-scenarios.test',
  '../lib/gateway/__tests__/gateway.test',
  '../lib/gateway/__tests__/readonly-ctrader.test',
  '../lib/execution/__tests__/ctrader-execution.test',
  '../lib/execution/__tests__/reconciliation.test',
  '../lib/server/__tests__/auto-reconciliation.test',
  '../lib/core/__tests__/local-rag.test',
  '../lib/ai/__tests__/offline-ai-safety.test',
  '../lib/ai/__tests__/agentic-review.test',
  '../lib/core/__tests__/multi-agent-council.test',
  '../lib/core/__tests__/research-desk.test',
  '../lib/research/__tests__/research-engine.test',
  '../lib/research/__tests__/paper-forward-ledger.test',
  '../lib/research/__tests__/stage8-analysis.test',
  '../lib/research/__tests__/walk-forward.test',
  '../lib/research/__tests__/parameter-optimizer.test',
  '../lib/research/__tests__/acceptance-gate.test',
  '../lib/core/__tests__/market-microstructure.test',
  '../lib/core/__tests__/economic-calendar.test',
  '../lib/core/__tests__/equity-curve-monte-carlo.test',
  '../lib/core/__tests__/prop-firms.test',
  '../lib/core/__tests__/multi-timeframe-split.test',
  '../lib/core/__tests__/shareable-trade-card.test',
  '../lib/core/__tests__/ruler-measurement.test',
];

export {};

async function loadSuites(): Promise<TestSuite[]> {
  const suites: TestSuite[] = [];
  for (const modulePath of suiteModules) {
    const loadedSuite = await import(modulePath) as Record<string, unknown>;
    const entry = Object.entries(loadedSuite).find(([name, value]) => name.startsWith('run') && typeof value === 'function');
    if (entry) suites.push({ name: modulePath, run: entry[1] as TestSuite['run'] });
  }
  return suites;
}

async function main(): Promise<void> {
  const suites = await loadSuites();
  let failed = 0;
  let total = 0;
  for (const suite of suites) {
    const results = await suite.run();
    const failures = results.filter((result) => {
      const record = result as { passed?: boolean; pass?: boolean };
      return record.passed === false || record.pass === false;
    });
    total += results.length;
    failed += failures.length;
    console.log(`[${failures.length === 0 ? 'PASS' : 'FAIL'}] ${suite.name}: ${results.length - failures.length}/${results.length}`);
    for (const failure of failures) console.error(JSON.stringify(failure));
  }
  console.log(`Suites: ${suites.length}; checks: ${total}; failures: ${failed}`);
  if (failed > 0) process.exit(1);
}

void main();
