import { spawn } from 'node:child_process';
import { request } from 'node:http';
import WebSocket from 'ws';

const port = Number(process.env.HYBRID_PORT || 3102);
const debugPort = Number(process.env.HYBRID_DEBUG_PORT || 9222);
const base = `http://127.0.0.1:${port}`;
const url = `${base}/webgpu-harness`;
const log = '/tmp/tradewithhamed-hybrid-webgpu.log';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function ready(target) {
  for (let i = 0; i < 90; i++) {
    try { await new Promise((resolve, reject) => { const req = request(target, res => { res.resume(); res.statusCode < 500 ? resolve() : reject(new Error(String(res.statusCode))); }); req.on('error', reject); req.end(); }); return; } catch { await sleep(500); }
  }
  throw new Error(`Server did not become ready: ${target}`);
}
async function json(urlText) { return new Promise((resolve, reject) => { request(urlText, res => { let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } }); }).on('error', reject).end(); }); }

const server = spawn('./node_modules/.bin/next', ['dev', '--webpack', '-p', String(port), '-H', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'ignore'] });
const browser = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer', `--remote-debugging-port=${debugPort}`, '--user-data-dir=/tmp/tradewithhamed-hybrid-profile', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
let ws;
try {
  await ready(url);
  await ready(`http://127.0.0.1:${debugPort}/json/version`);
  const version = await json(`http://127.0.0.1:${debugPort}/json/version`);
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let nextId = 0; const pending = new Map();
  ws.on('message', raw => { const msg = JSON.parse(raw); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Target.createTarget', { url });
  const targets = await json(`http://127.0.0.1:${debugPort}/json/list`);
  const page = targets.find(t => t.url.includes('/webgpu-harness'));
  if (!page) throw new Error('Hybrid browser target was not created.');
  ws.close();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  nextId = 0; pending.clear();
  ws.on('message', raw => { const msg = JSON.parse(raw); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); } });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await call('Runtime.enable');
  await call('Network.enable');
  let status = '';
  for (let i = 0; i < 180; i++) {
    const value = await call('Runtime.evaluate', { expression: "document.querySelector('[data-testid=hybrid-status]')?.textContent || ''", returnByValue: true });
    status = value.result?.value || '';
    if (['MODEL_READY_WAITING_FOR_OFFLINE', 'BLOCKED', 'PASS'].includes(status)) break;
    await sleep(1000);
  }
  if (status === 'MODEL_READY_WAITING_FOR_OFFLINE') {
    await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await call('Runtime.evaluate', { expression: 'window.__RUN_HYBRID_OFFLINE__()', awaitPromise: true, returnByValue: true });
  }
  await sleep(1000);
  const output = await call('Runtime.evaluate', { expression: "document.querySelector('[data-testid=hybrid-result]')?.textContent || ''", returnByValue: true });
  if (!status) throw new Error(`Harness did not initialize. DOM output: ${output.result?.value || '(empty)'}`);
  console.log(JSON.stringify({ status, resultText: output.result?.value || '' }, null, 2));
  if (status === 'BLOCKED') process.exitCode = 2;
} finally {
  ws?.close();
  browser.kill('SIGTERM');
  server.kill('SIGTERM');
}
