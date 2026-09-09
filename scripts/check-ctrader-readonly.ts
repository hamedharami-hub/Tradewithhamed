import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const logDir = resolve(process.env.STAGE7_REPORT_DIR || 'data/runs/stage7-gpu-30trades');
  const logCandidates = [process.env.MONITOR_REPORT, `${logDir}/ctrader-paper-events.jsonl`, 'data/runs/stage5-hybrid-monitor-readiness.jsonl', 'data/runs/stage8-30d/gbpusd-monitor-report.jsonl'].filter(Boolean) as string[];
  const logs: Array<{ path: string; lines: string[] }> = [];
  for (const path of logCandidates) { try { const text = await readFile(resolve(path), 'utf8'); logs.push({ path, lines: text.split('\n').filter(Boolean).slice(-20) }); } catch { /* absent artifact */ } }
  const envPresence = Object.fromEntries(['CTRADER_CLIENT_ID','CTRADER_ACCESS_TOKEN','CTRADER_ACCOUNT_ID','CTRADER_ENVIRONMENT','RUN_CTRADER','REQUIRE_CTRADER','MONITOR_ANALYST_PROVIDER'].map(key => [key, process.env[key] ? '<set>' : '<missing>']));
  const events = logs.flatMap(item => item.lines.map(line => { try { return JSON.parse(line); } catch { return { raw: line }; } }));
  const forbidden = events.filter(event => event.brokerWrites === true || event.orderSubmitted === true || event.executionSent === true);
  const blocked = events.filter(event => event.status === 'BLOCKED');
  console.log(JSON.stringify({ version: 'ctrader-readonly-diagnostics-v1', environment: envPresence, logFiles: logs.map(item => item.path), recentEvents: events.slice(-20), blockedCount: blocked.length, forbiddenWriteSignals: forbidden.length, readOnlySafe: forbidden.length === 0, connectionReady: !blocked.length && envPresence.CTRADER_CLIENT_ID === '<set>' && envPresence.CTRADER_ACCESS_TOKEN === '<set>' && envPresence.CTRADER_ACCOUNT_ID === '<set>' }, null, 2));
  if (forbidden.length) process.exitCode = 4;
}
void main();
