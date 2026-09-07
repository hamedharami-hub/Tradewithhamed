import { NextResponse } from 'next/server';
import { runAllCoreTests } from '@/lib/core/__tests__/core.test';
import { runAllCTraderSecurityTests } from '@/lib/server/__tests__/ctrader-security.test';
import { runStage4ShadowTests } from '@/lib/core/__tests__/shadow-stage4.test';
import { runStage5ExecutionTests } from '@/lib/server/__tests__/stage5-execution.test';
import { runStage6JournalTests } from '@/lib/server/__tests__/stage6-journal.test';
import { runStage7PwaTests } from '@/lib/server/__tests__/stage7-pwa.test';
import { runStage8SecurityDRTests } from '@/lib/server/__tests__/stage8-security-dr.test';
import { runStage9Tests } from '@/lib/server/__tests__/stage9-health-smoke.test';
import { runW2AcceptanceSuite } from '@/lib/core/__tests__/w2-acceptance.test';
import { runW3AcceptanceSuite } from '@/lib/core/__tests__/w3-acceptance.test';
import { runW4AcceptanceSuite } from '@/lib/core/__tests__/w4-acceptance.test';
import { runW5AcceptanceSuite } from '@/lib/core/__tests__/w5-acceptance.test';
import { runW3BenchmarkEvaluationSuite } from '@/lib/core/__tests__/w3-benchmark.test';
import { runW4OnlineExecutionTests } from '@/lib/server/__tests__/w4-online-execution.test';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const coreResults = runAllCoreTests();
    const ctraderResults = runAllCTraderSecurityTests();
    const stage4Results = runStage4ShadowTests();
    const stage5Results = await runStage5ExecutionTests();
    const stage6Results = await runStage6JournalTests();
    const stage7Results = await runStage7PwaTests();
    const stage8Results = await runStage8SecurityDRTests();
    const stage9Results = await runStage9Tests();
    const w2Results = runW2AcceptanceSuite().map(t => ({
      name: `[W2] ${t.nameEn} - ${t.nameFa}`,
      passed: t.passed,
      details: t.details,
    }));
    const w3Raw = await runW3AcceptanceSuite();
    const w3Results = w3Raw.map(t => ({
      name: `[W3] ${t.nameEn} - ${t.nameFa}`,
      passed: t.passed,
      details: t.details,
    }));
    const w4Raw = await runW4AcceptanceSuite();
    const w4Results = w4Raw.map(t => ({
      name: `[W4] ${t.nameEn} - ${t.nameFa}`,
      passed: t.passed,
      details: t.details,
    }));
    const w5Raw = await runW5AcceptanceSuite();
    const w5Results = w5Raw.map(t => ({
      name: `[W5] ${t.nameEn} - ${t.nameFa}`,
      passed: t.passed,
      details: t.details,
    }));

    // کیت استاندارد ۱۲۰ موردی بنچمارک هوش مصنوعی نسخه ۴.۰
    const w3Bench = runW3BenchmarkEvaluationSuite();
    const w3BenchResults = w3Bench.categories.map(c => ({
      name: `[W3 Benchmark v4.0] ${c.categoryTitleFa} (${c.passedCases}/${c.totalCases})`,
      passed: c.passRate >= 90,
      details: `تعداد ${c.passedCases} از ${c.totalCases} مورد پاس شدند (دقت: ${c.passRate}٪).`,
    }));

    // مجموعه آزمون‌های جامع دروازه‌های آنلاین W4 (Gates A, B, C)
    const w4OnlineRaw = await runW4OnlineExecutionTests();
    const w4OnlineResults = w4OnlineRaw.map(t => ({
      name: `[W4 Online - ${t.gate}] ${t.name}`,
      passed: t.passed,
      details: t.details,
    }));

    const combined = [
      ...coreResults,
      ...ctraderResults,
      ...stage4Results,
      ...stage5Results,
      ...stage6Results,
      ...stage7Results,
      ...stage8Results,
      ...stage9Results,
      ...w2Results,
      ...w3Results,
      ...w3BenchResults,
      ...w4Results,
      ...w4OnlineResults,
      ...w5Results,
    ];
    const allPassed = combined.every(t => t.passed);

    return NextResponse.json(
      {
        status: allPassed ? 'SUCCESS' : 'FAILURE',
        timestamp: Date.now(),
        totalTests: combined.length,
        passedTests: combined.filter(t => t.passed).length,
        suite: 'Hamed Trading Lab Comprehensive Verification Suite (Stages 1-9 & Gates W1/W2/W3/W4/W5)',
        results: combined,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'FAILURE',
        timestamp: Date.now(),
        totalTests: 0,
        passedTests: 0,
        suite: 'Hamed Trading Lab Comprehensive Verification Suite',
        results: [],
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
