import { readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

type TestResult = { name: string; passed: boolean; details: string };
type TestSuite = { name: string; run: () => Promise<unknown> | unknown };

async function discoverTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return discoverTestFiles(path);
    return entry.name.endsWith('.test.ts') ? [path] : [];
  }));
  return files.flat();
}

async function loadSuites(): Promise<{ suites: TestSuite[]; discoveryFailures: string[] }> {
  const testRoot = resolve(process.cwd(), 'lib');
  const discovered = (await discoverTestFiles(testRoot))
    .filter(path => path.split(sep).includes('__tests__'))
    .sort();
  const suites: TestSuite[] = [];
  const discoveryFailures: string[] = [];

  for (const filePath of discovered) {
    const displayName = relative(process.cwd(), filePath).replaceAll('\\', '/');
    try {
      const loadedSuite = await import(pathToFileURL(filePath).href) as Record<string, unknown>;
      const entries = Object.entries(loadedSuite)
        .filter(([name, value]) => name.startsWith('run') && typeof value === 'function');
      if (entries.length !== 1) {
        discoveryFailures.push(`${displayName}: expected exactly one exported run* test function, found ${entries.length}.`);
        continue;
      }
      suites.push({ name: displayName, run: entries[0][1] as TestSuite['run'] });
    } catch (error) {
      discoveryFailures.push(`${displayName}: ${(error as Error).message}`);
    }
  }

  return { suites, discoveryFailures };
}

function normalizeResults(suiteName: string, output: unknown): TestResult[] {
  if (Array.isArray(output)) return output as TestResult[];

  // The W3 benchmark exports a report rather than an array of checks.  Keep it
  // in the unified runner, but turn its category summaries into explicit checks.
  if (output && typeof output === 'object' && Array.isArray((output as { categories?: unknown[] }).categories)) {
    const report = output as {
      categories: Array<{ categoryTitleFa: string; passedCases: number; totalCases: number }>;
    };
    return report.categories.map(category => ({
      name: category.categoryTitleFa,
      passed: category.passedCases === category.totalCases,
      details: `${category.passedCases}/${category.totalCases}`,
    }));
  }

  throw new Error(`${suiteName} returned an unsupported result shape.`);
}

async function main(): Promise<void> {
  const { suites, discoveryFailures } = await loadSuites();
  let failed = discoveryFailures.length;
  let total = 0;
  for (const failure of discoveryFailures) console.error(`[DISCOVERY FAIL] ${failure}`);
  for (const suite of suites) {
    let results: TestResult[];
    try {
      results = normalizeResults(suite.name, await suite.run());
    } catch (error) {
      failed++;
      console.error(`[FAIL] ${suite.name}: ${(error as Error).message}`);
      continue;
    }
    const failures = results.filter(result => !result.passed);
    total += results.length;
    failed += failures.length;
    console.log(`[${failures.length === 0 ? 'PASS' : 'FAIL'}] ${suite.name}: ${results.length - failures.length}/${results.length}`);
    for (const failure of failures) console.error(JSON.stringify(failure));
  }
  console.log(`Suites: ${suites.length}; checks: ${total}; failures: ${failed}`);
  if (failed > 0) process.exit(1);
}

void main().then(
  () => process.exit(process.exitCode ?? 0),
  error => {
    console.error(error);
    process.exit(1);
  },
);
