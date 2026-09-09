import { spawn } from 'node:child_process';
import { request } from 'node:http';
import WebSocket from 'ws';

const port = Number(process.env.WEBGPU_BENCHMARK_PORT || 3105);
const debugPort = Number(process.env.WEBGPU_BENCHMARK_DEBUG_PORT || 9225);
const base = `http://127.0.0.1:${port}`;
const url = `${base}/webgpu-benchmark`;
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function ready(target) { for (let i = 0; i < 120; i++) { try { await new Promise((resolve, reject) => { const req = request(target, res => { res.resume(); res.statusCode < 500 ? resolve() : reject(new Error(String(res.statusCode))); }); req.on('error', reject); req.end(); }); return; } catch { await sleep(500); } } throw new Error(`Server did not become ready: ${target}`); }
async function json(urlText) { return new Promise((resolve, reject) => { request(urlText, res => { let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } }); }).on('error', reject).end(); }); }
function connect(urlText) { const ws = new WebSocket(urlText); return new Promise((resolve, reject) => { ws.once('open', () => resolve(ws)); ws.once('error', reject); }); }
const server = spawn('./node_modules/.bin/next', ['dev', '--webpack', '-p', String(port), '-H', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'ignore'] });
const browser = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer', `--remote-debugging-port=${debugPort}`, '--user-data-dir=/tmp/tradewithhamed-webgpu-benchmark-profile', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
let ws;
try {
  await ready(url); await ready(`http://127.0.0.1:${debugPort}/json/version`);
  const version = await json(`http://127.0.0.1:${debugPort}/json/version`);
  ws = await connect(version.webSocketDebuggerUrl);
  let nextId = 0; let pending = new Map();
  const attach = socket => { pending = new Map(); socket.on('message', raw => { const message = JSON.parse(raw); if (message.id && pending.has(message.id)) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); } }); };
  attach(ws);
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Target.createTarget', { url });
  const targets = await json(`http://127.0.0.1:${debugPort}/json/list`);
  const page = targets.find(target => target.url.includes('/webgpu-benchmark'));
  if (!page) throw new Error('WebGPU benchmark target was not created.');
  ws.close(); ws = await connect(page.webSocketDebuggerUrl); nextId = 0; attach(ws);
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await call('Runtime.enable'); await call('Network.enable');
  let status = ''; let resultText = '';
  for (let i = 0; i < 600; i++) {
    const value = await call('Runtime.evaluate', { expression: "document.querySelector('[data-testid=webgpu-benchmark-status]')?.textContent || ''", returnByValue: true });
    status = value.result?.value || '';
    if (status === 'MODEL_READY_WAITING_FOR_OFFLINE' || status === 'BLOCKED' || status === 'PASS') break;
    await sleep(1000);
  }
  if (status === 'MODEL_READY_WAITING_FOR_OFFLINE') {
    await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await call('Runtime.evaluate', { expression: 'window.__RUN_WEBGPU_BENCHMARK_OFFLINE__()', awaitPromise: true, returnByValue: true });
    for (let i = 0; i < 1200; i++) {
      const value = await call('Runtime.evaluate', { expression: "document.querySelector('[data-testid=webgpu-benchmark-status]')?.textContent || ''", returnByValue: true });
      status = value.result?.value || '';
      if (status === 'PASS' || status === 'BLOCKED') break;
      await sleep(1000);
    }
  }
  const output = await call('Runtime.evaluate', { expression: "document.querySelector('[data-testid=webgpu-benchmark-result]')?.textContent || ''", returnByValue: true });
  resultText = output.result?.value || '';
  if (!status) throw new Error(`WebGPU benchmark did not initialize: ${resultText || '(empty)'}`);
  console.log(JSON.stringify({ status, resultText }, null, 2));
  if (status === 'BLOCKED') process.exitCode = 2;
} finally { ws?.close(); browser.kill('SIGTERM'); server.kill('SIGTERM'); }
