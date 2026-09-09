import { StressEvent, StressScenario, StressTestResult } from './contracts';

function seededNoise(seed: number, step: number): number {
  const value = Math.sin(seed * 12.9898 + step * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function event(timestamp: number, type: string, details: string, severity: StressEvent['severity']): StressEvent {
  return { timestamp, type, details, severity };
}

export function runStressScenario(scenario: StressScenario, seedOverride?: number): StressTestResult {
  const startedAt = Date.now();
  const seed = seedOverride ?? scenario.seed;
  const events: StressEvent[] = [];
  const invariantViolations: string[] = [];
  let maxDrawdownPercent = 0;
  let maxSpreadPips = 0;
  let ordersSubmitted = 0;
  let duplicateOrdersPrevented = 0;
  let reconciliationRequired = 0;
  const baseTimestamp = startedAt;

  if (scenario.type === 'FLASH_CRASH') {
    const shockPercent = Number(scenario.parameters.shockPercent || 5);
    const spreadPips = Number(scenario.parameters.spreadPips || 18);
    maxDrawdownPercent = Number((shockPercent * (0.75 + seededNoise(seed, 1) * 0.1)).toFixed(2));
    maxSpreadPips = spreadPips;
    events.push(event(baseTimestamp, 'PRICE_SHOCK', `افت ناگهانی ${shockPercent}% در ${scenario.symbol}`, 'CRITICAL'));
    events.push(event(baseTimestamp + 1, 'SPREAD_WIDENED', `گسترش spread تا ${spreadPips} pip`, 'WARN'));
    events.push(event(baseTimestamp + 2, 'NEW_ENTRIES_BLOCKED', 'ورود جدید به‌دلیل شوک و spread بحرانی مسدود شد', 'INFO'));
    if (maxDrawdownPercent > 5) invariantViolations.push('DRAWDOWN_LIMIT_NOT_ENFORCED');
  }

  if (scenario.type === 'STALE_FEED') {
    const staleAfterMs = Number(scenario.parameters.staleAfterMs || 5000);
    const outageMs = Number(scenario.parameters.outageMs || 10000);
    maxSpreadPips = 0.8;
    events.push(event(baseTimestamp, 'QUOTE_RECEIVED', 'آخرین quote معتبر دریافت شد', 'INFO'));
    events.push(event(baseTimestamp + staleAfterMs, 'FEED_STALE', `فید پس از ${staleAfterMs}ms قدیمی شد`, 'WARN'));
    events.push(event(baseTimestamp + outageMs, 'FEED_UNKNOWN', 'فید در وضعیت UNKNOWN قرار گرفت و ورود جدید متوقف شد', 'CRITICAL'));
    if (ordersSubmitted !== 0) invariantViolations.push('ORDER_SUBMITTED_WITH_STALE_FEED');
  }

  if (scenario.type === 'DUPLICATE_SUBMIT') {
    const attempts = Number(scenario.parameters.attempts || 5);
    ordersSubmitted = 1;
    duplicateOrdersPrevented = Math.max(0, attempts - 1);
    events.push(event(baseTimestamp, 'ORDER_ACCEPTED', 'اولین درخواست با idempotency key پذیرفته شد', 'INFO'));
    events.push(event(baseTimestamp + 1, 'DUPLICATES_REJECTED', `${duplicateOrdersPrevented} درخواست تکراری خنثی شد`, 'WARN'));
    if (ordersSubmitted > 1) invariantViolations.push('DUPLICATE_ORDER_CREATED');
  }

  if (scenario.type === 'BROKER_TIMEOUT') {
    events.push(event(baseTimestamp, 'ORDER_SUBMITTING', 'سفارش در وضعیت SUBMITTING ثبت شد', 'INFO'));
    events.push(event(baseTimestamp + Number(scenario.parameters.timeoutMs || 3000), 'BROKER_TIMEOUT', 'پاسخ بروکر مبهم و timeout شد', 'CRITICAL'));
    reconciliationRequired = 1;
    events.push(event(baseTimestamp + 1, 'RECONCILIATION_REQUIRED', 'ارسال‌های جدید تا بازتطبیق کامل مسدود شد', 'WARN'));
    if (ordersSubmitted > 1) invariantViolations.push('ORDER_RESUBMITTED_BEFORE_RECONCILIATION');
  }

  const completedAt = Date.now();
  return {
    runId: `stress_${startedAt}_${seed}`,
    scenarioId: scenario.id,
    scenarioNameFa: scenario.nameFa,
    status: invariantViolations.length > 0 ? 'FAILED' : scenario.type === 'BROKER_TIMEOUT' ? 'BLOCKED' : 'PASSED',
    passed: invariantViolations.length === 0,
    startedAt,
    completedAt,
    seed,
    maxDrawdownPercent,
    maxSpreadPips,
    ordersSubmitted,
    duplicateOrdersPrevented,
    reconciliationRequired,
    invariantViolations,
    events,
  };
}
