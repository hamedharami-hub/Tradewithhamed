import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getReadOnlyCTraderConfig } from '../lib/gateway/readonly-ctrader';

async function readRecentJsonl(path: string): Promise<{ path: string; lines: string[] }> {
  try {
    const text = await readFile(resolve(path), 'utf8');
    return { path, lines: text.split('\n').filter(Boolean).slice(-200) };
  } catch {
    return { path, lines: [] };
  }
}

async function main(): Promise<void> {
  const stage7Dir = process.env.STAGE7_REPORT_DIR || 'data/runs/stage7-gpu-30trades';
  const logCandidates = [
    process.env.MONITOR_REPORT,
    process.env.STAGE8_REPORT,
    `${stage7Dir}/ctrader-paper-events.jsonl`,
    'data/runs/stage5-hybrid-monitor-readiness.jsonl',
    'data/runs/stage8-30d/gbpusd-monitor-report.jsonl',
  ].filter((value): value is string => Boolean(value));
  const logs = await Promise.all(logCandidates.map(readRecentJsonl));
  const events = logs.flatMap(item => item.lines.map(line => {
    try { return JSON.parse(line) as Record<string, unknown>; }
    catch { return { raw: line, parseError: true }; }
  }));
  const preflight = getReadOnlyCTraderConfig();
  const forbidden = events.filter(event => event.brokerWrites === true || event.orderSubmitted === true || event.executionSent === true || event.payloadType === 2106 || event.payloadType === 'NEW_ORDER_REQUEST');
  const blocked = events.filter(event => event.status === 'BLOCKED' || event.status === 'GATEWAY_DEGRADED');
  const environment = Object.fromEntries([
    'CTRADER_CLIENT_ID', 'CTRADER_CLIENT_SECRET', 'CTRADER_ACCESS_TOKEN', 'CTRADER_ACCOUNT_ID',
    'CTRADER_ENVIRONMENT', 'CTRADER_GATEWAY_HOST', 'CTRADER_GATEWAY_PORT', 'RUN_CTRADER',
    'REQUIRE_CTRADER', 'CTRADER_LIVE_ENABLE', 'MONITOR_SYMBOLS', 'MONITOR_TIMEFRAME',
    'MONITOR_ANALYST_PROVIDER',
  ].map(key => [key, process.env[key] ? '<set>' : '<missing>']));
  const readOnlySafe = preflight.configured && forbidden.length === 0;
  const output = {
    version: 'ctrader-readonly-diagnostics-v2',
    environment,
    preflight: {
      configured: preflight.configured,
      reason: preflight.reason,
      safetyChecks: preflight.safetyChecks,
      ...(preflight.config ? { endpoint: `${preflight.config.host}:${preflight.config.port}`, requestedSymbols: preflight.config.requestedSymbols } : {}),
    },
    logFiles: logs.filter(item => item.lines.length > 0).map(item => item.path),
    recentEvents: events.slice(-20),
    blockedCount: blocked.length,
    forbiddenWriteSignals: forbidden.length,
    readOnlySafe,
    connectionReady: preflight.configured && blocked.length === 0,
  };
  console.log(JSON.stringify(output, null, 2));
  if (!preflight.configured) process.exitCode = 2;
  if (forbidden.length) process.exitCode = 4;
}

void main();
