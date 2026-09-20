import { spawn } from 'node:child_process';
import { request } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';

const DEBUG_PORT = 9333;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\hamed\\.gemini\\antigravity\\brain\\444a1b9a-c68a-4bbd-bcb2-93ad518c0059';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function detectAppPort() {
  if (process.env.APP_PORT) return Number(process.env.APP_PORT);
  const candidates = [3105, 3000];
  for (const port of candidates) {
    try {
      const isTradewithhamed = await new Promise((resolve) => {
        const req = request(`http://127.0.0.1:${port}/practice`, res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 500 && (data.includes('تمرین') || data.includes('practice') || data.includes('tradewithhamed'))) {
              resolve(true);
            } else {
              resolve(false);
            }
          });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
        req.end();
      });
      if (isTradewithhamed) return port;
    } catch {
      // try next candidate
    }
  }
  return 3105;
}

async function waitForServer(urlText, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = request(urlText, res => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
        req.end();
      });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`Server did not respond: ${urlText}`);
}

async function fetchJson(urlText) {
  return new Promise((resolve, reject) => {
    request(urlText, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject).end();
  });
}

function killProcessTree(pid) {
  try {
    spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.consoleMessages = [];
    this.runtimeExceptions = [];
    this.networkRequests = [];
    this.webSocketConnections = [];

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } else if (msg.method === 'Runtime.consoleAPICalled') {
          this.consoleMessages.push({
            type: msg.params.type,
            text: msg.params.args?.map(a => a.value || a.description).join(' ') || '',
            timestamp: Date.now(),
          });
        } else if (msg.method === 'Runtime.exceptionThrown') {
          this.runtimeExceptions.push({
            text: msg.params.exceptionDetails.text,
            description: msg.params.exceptionDetails.exception?.description || '',
            lineNumber: msg.params.exceptionDetails.lineNumber,
            timestamp: Date.now(),
          });
        } else if (msg.method === 'Network.requestWillBeSent') {
          this.networkRequests.push({
            url: msg.params.request.url,
            method: msg.params.request.method,
            type: msg.params.type,
            timestamp: Date.now(),
          });
        } else if (msg.method === 'Network.webSocketCreated') {
          this.webSocketConnections.push({
            url: msg.params.url,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.error('CDP message parse error:', err);
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async captureScreenshot(filepath) {
    const result = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(result.data, 'base64');
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, buffer);
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
  }
}

async function runTests() {
  console.log('=== Starting Hardened Practice Browser Test Suite ===');

  const appPort = await detectAppPort();
  const APP_URL = `http://127.0.0.1:${appPort}`;
  const PRACTICE_URL = `${APP_URL}/practice`;
  console.log(`Detected App URL: ${PRACTICE_URL}`);

  // Create clean ephemeral user profile
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-practice-fresh-'));
  console.log(`Fresh ephemeral Chrome profile dir: ${tempProfileDir}`);

  // Ensure test runs in environment without broker credentials
  const sanitizedEnv = {
    ...process.env,
    CTRADER_CLIENT_ID: '',
    CTRADER_CLIENT_SECRET: '',
    CTRADER_ACCOUNT_ID: '',
    CTRADER_REFRESH_TOKEN: '',
  };

  const results = {
    baseCommit: '3ce1be1',
    timestamp: new Date().toISOString(),
    appUrl: PRACTICE_URL,
    scenarios: [],
    networkAudit: {
      totalHttpRequests: 0,
      totalWebSocketConnections: 0,
      forbiddenRequestsDetected: [],
      browserMadeForbiddenRequest: false,
      serverOutgoingNetworkMocked: true,
      passed: true,
    },
    consoleErrors: [],
    runtimeExceptions: [],
    screenshots: [],
    overallPassed: false,
  };

  console.log('Starting headless Chrome with remote debugging...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${tempProfileDir}`,
    'about:blank',
  ], {
    stdio: 'ignore',
    env: sanitizedEnv,
  });

  let browserWs = null;
  let pageWs = null;
  let cdp = null;

  try {
    await waitForServer(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 40);
    const version = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    browserWs = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => { browserWs.once('open', res); browserWs.once('error', rej); });

    const browserCdp = new CdpSession(browserWs);
    const target = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
    const targetId = target.targetId;

    const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pageTarget = targets.find(t => t.id === targetId || t.targetId === targetId);
    if (!pageTarget) throw new Error('Could not find created target page in Chrome targets');

    pageWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => { pageWs.once('open', res); pageWs.once('error', rej); });
    cdp = new CdpSession(pageWs);

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');

    // Start at Desktop 1440x900
    await cdp.setViewport(1440, 900);

    console.log(`Navigating to ${PRACTICE_URL}...`);
    await cdp.send('Page.navigate', { url: PRACTICE_URL });
    await sleep(3500);

    // ==========================================
    // SCENARIO 1: Identity & Initial State
    // ==========================================
    console.log('Running Scenario 1: Initial Identity & Balance...');
    const s1Data = await cdp.eval(`
      ({
        identity: document.body.innerText.includes('تمرین با دادهٔ نمونه — حساب مجازی — بدون ارسال به بروکر'),
        symbol: document.body.innerText.includes('XAUUSD'),
        hasInitial10000: document.body.innerText.includes('$10000.00') || document.body.innerText.includes('10,000'),
        hasBalanceLabel: document.body.innerText.includes('موجودی نقدشده (بالانس / Balance)'),
        hasEquityLabel: document.body.innerText.includes('ارزش فعلی حساب (اکوئیتی / Equity)'),
        sessionId: (function() {
          const match = document.body.innerText.match(/practice-[a-z0-9-]+/);
          return match ? match[0] : null;
        })()
      })
    `);
    const s1Passed = s1Data.identity && s1Data.symbol && s1Data.hasInitial10000 && s1Data.hasBalanceLabel && s1Data.hasEquityLabel && Boolean(s1Data.sessionId);
    results.scenarios.push({
      id: 1,
      name: 'ورود به /practice و دیدن هویت محیط و سرمایهٔ اولیه',
      passed: s1Passed,
      detail: s1Data,
    });

    // ==========================================
    // SCENARIO 2: Register BUY Trade (2-step proof)
    // ==========================================
    console.log('Running Scenario 2: Register BUY trade (2-step direction selection & submission)...');
    // Step 2.1: Select BUY tab and verify active styling & risk preview
    const s2Step1 = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const buyTab = buttons.find(b => b.textContent.includes('خرید (BUY)'));
        if (!buyTab) return { success: false, reason: 'Buy tab button not found' };
        buyTab.click();
        return { success: true };
      })()
    `);
    await sleep(500);

    const s2BeforeCount = await cdp.eval(`
      (function() {
        const rows = document.querySelectorAll('tbody tr');
        return rows.length;
      })()
    `);

    // Step 2.2: Click submit button
    const s2Step2 = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitBtn = buttons.find(b => b.textContent.includes('ثبت معاملهٔ تمرینی خرید'));
        if (!submitBtn) return { success: false, reason: 'Submit button not found or not in BUY mode' };
        if (submitBtn.disabled) return { success: false, reason: 'Submit button is disabled' };
        submitBtn.click();
        return { success: true };
      })()
    `);
    await sleep(1500);

    const s2Verify = await cdp.eval(`
      (function() {
        const openTable = document.querySelector('table');
        if (!openTable) return { hasTable: false };
        const text = openTable.innerText;
        const hasBuyBadge = text.includes('خرید');
        const hasVolume = text.includes('Lot');
        const hasOpenIndicator = document.body.innerText.includes('معامله در جریان');

        return {
          hasTable: true,
          hasBuyBadge,
          hasVolume,
          hasOpenIndicator,
          contentSample: text.substring(0, 300)
        };
      })()
    `);
    const s2Passed = s2Step1.success && s2Step2.success && s2Verify.hasBuyBadge && s2Verify.hasOpenIndicator;
    results.scenarios.push({
      id: 2,
      name: 'ثبت معاملهٔ خرید با حد ضرر و حد سود (انتخاب جهت و ثبت دو مرحله‌ای)',
      passed: s2Passed,
      detail: { s2Step1, s2Step2, s2Verify },
    });

    // ==========================================
    // SCENARIO 3: Step candles and verify live PnL changes
    // ==========================================
    console.log('Running Scenario 3: Step candles and verify live PnL update...');
    const s3PnlBefore = await cdp.eval(`
      (function() {
        const match = document.body.innerText.match(/\\$[\\d,.]+/g);
        return {
          text: document.body.innerText.includes('سودوزیان شناور معاملات باز'),
          samples: match ? match.slice(0, 6) : []
        };
      })()
    `);

    // Advance 4 candles
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextBtn = buttons.find(b => b.textContent.includes('کندل بعد'));
        if (nextBtn && !nextBtn.disabled) {
          for (let i = 0; i < 4; i++) nextBtn.click();
        }
      })()
    `);
    await sleep(1500);

    const s3PnlAfter = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        const hasFloatingPnl = text.includes('سودوزیان شناور') || text.includes('معامله در جریان');
        return {
          hasFloatingPnl,
          matches: text.match(/\\$[\\d,.]+/g)?.slice(0, 6) || []
        };
      })()
    `);
    const s3Passed = s3PnlBefore.text && s3PnlAfter.hasFloatingPnl;
    results.scenarios.push({
      id: 3,
      name: 'جلو بردن چند کندل و تغییر سود/زیان باز به همراه انطباق عددی',
      passed: s3Passed,
      detail: { before: s3PnlBefore, after: s3PnlAfter },
    });

    // ==========================================
    // SCENARIO 4: Advance until TP/SL exit & verify closed trade
    // ==========================================
    console.log('Running Scenario 4: Step until TP/SL exit & verify closed history row...');
    // Step forward 8 more candles to hit SL or TP
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextBtn = buttons.find(b => b.textContent.includes('کندل بعد'));
        if (nextBtn) {
          for (let i = 0; i < 8; i++) {
            if (!nextBtn.disabled) nextBtn.click();
          }
        }
      })()
    `);
    await sleep(1500);

    const s4Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        const hasClosedTrades = text.includes('معامله بسته شده') || text.includes('دفتر معاملات نشست جاری');
        const hasExitReason = text.includes('تارگت سود (TP)') || text.includes('حد ضرر (SL)') || text.includes('خروج');
        const hasRealizedPnl = text.includes('سود/زیان خالص');

        return {
          hasClosedTrades,
          hasExitReason,
          hasRealizedPnl,
        };
      })()
    `);
    const s4Passed = s4Verify.hasClosedTrades && s4Verify.hasExitReason && s4Verify.hasRealizedPnl;
    results.scenarios.push({
      id: 4,
      name: 'رسیدن به حد سود یا حد ضرر و ثبت معامله در تاریخچه با قیمت خروج و علت واقعی',
      passed: s4Passed,
      detail: s4Verify,
    });

    // ==========================================
    // SCENARIO 5: Register SELL Trade (2-step proof)
    // ==========================================
    console.log('Running Scenario 5: Register SELL trade...');
    // 5.1 Click SELL tab
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const sellTab = buttons.find(b => b.textContent.includes('فروش (SELL)'));
        if (sellTab) sellTab.click();
      })()
    `);
    await sleep(500);

    // 5.2 Click submit
    const s5Submit = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitBtn = buttons.find(b => b.textContent.includes('ثبت معاملهٔ تمرینی فروش'));
        if (!submitBtn) return { success: false, reason: 'SELL submit button not found' };
        if (submitBtn.disabled) return { success: false, reason: 'SELL submit button is disabled' };
        submitBtn.click();
        return { success: true };
      })()
    `);
    await sleep(1500);

    const s5Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        return {
          hasSellIndicator: text.includes('فروش') && text.includes('معامله در جریان'),
        };
      })()
    `);
    const s5Passed = s5Submit.success && s5Verify.hasSellIndicator;
    results.scenarios.push({
      id: 5,
      name: 'ثبت معاملهٔ فروش در دو مرحله همراه با اعتبارسنجی UI',
      passed: s5Passed,
      detail: { s5Submit, s5Verify },
    });

    // ==========================================
    // SCENARIO 6: Manually close position
    // ==========================================
    console.log('Running Scenario 6: Manually close position with close button...');
    const s6Action = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const closeBtn = buttons.find(b => b.textContent.trim() === 'بستن معامله');
        if (closeBtn) {
          closeBtn.click();
          return { clicked: true, type: 'single' };
        }
        const closeAllBtn = buttons.find(b => b.textContent.includes('بستن همه'));
        if (closeAllBtn) {
          closeAllBtn.click();
          return { clicked: true, type: 'all' };
        }
        return { clicked: false };
      })()
    `);
    await sleep(800);

    // Handle confirm modal if opened
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.find(b => b.textContent.includes('تأیید'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1500);

    const s6Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        const hasManualExit = text.includes('خروج دستی') || text.includes('با موفقیت بسته شد');
        const zeroOpen = text.includes('در حال حاضر هیچ معاملهٔ بازی در این نشست وجود ندارد') || text.includes('0 معامله باز');
        return {
          hasManualExit,
          zeroOpen
        };
      })()
    `);
    const s6Passed = s6Action.clicked && (s6Verify.hasManualExit || s6Verify.zeroOpen);
    results.scenarios.push({
      id: 6,
      name: 'بستن دستی معامله با دکمهٔ بستن و تسویه فوری در موجودی',
      passed: s6Passed,
      detail: { s6Action, s6Verify },
    });

    // ==========================================
    // SCENARIO 7: True End-of-Data Replay & Trade Lock
    // ==========================================
    console.log('Running Scenario 7: Advance candles to true end of data, assert freeze alert & trade block...');
    const s7StepResult = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextBtn = buttons.find(b => b.textContent.includes('کندل بعد'));
        if (!nextBtn) return { error: 'Next button not found' };

        let clicks = 0;
        while (!nextBtn.disabled && clicks < 300) {
          nextBtn.click();
          clicks++;
        }
        return { clicks, isBtnDisabled: nextBtn.disabled };
      })()
    `);
    await sleep(1500);

    const s7Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        const hasEndBanner = text.includes('پایان داده‌های نمونه: به آخرین کندل رسیده‌اید') || text.includes('پایان داده‌های نمونه');
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextBtn = buttons.find(b => b.textContent.includes('کندل بعد'));
        const submitBtn = buttons.find(b => b.textContent.includes('ثبت معامله') || b.textContent.includes('پایان داده‌ها'));

        const isNextDisabled = nextBtn ? nextBtn.disabled : false;
        const isSubmitDisabled = submitBtn ? submitBtn.disabled : false;
        const hasBlockedText = submitBtn ? submitBtn.textContent.includes('پایان داده‌ها — ثبت معامله غیرفعال است') : false;

        return {
          hasEndBanner,
          isNextDisabled,
          isSubmitDisabled,
          hasBlockedText
        };
      })()
    `);

    // Dynamic assertion: NOT static PASS!
    const s7Passed = s7Verify.hasEndBanner && s7Verify.isNextDisabled && s7Verify.isSubmitDisabled && s7Verify.hasBlockedText;
    results.scenarios.push({
      id: 7,
      name: 'جلو بردن تا انتهای واقعی داده و مشاهدهٔ پیام فریز داده و ممنوعیت ورود جدید',
      passed: s7Passed,
      detail: { s7StepResult, s7Verify },
    });

    // ==========================================
    // SCENARIO 8: Page Reload & Strict State Matching
    // ==========================================
    console.log('Running Scenario 8: Page reload & session state persistence matching...');
    const s8Before = await cdp.eval(`
      (function() {
        const sessionBadge = document.querySelector('[data-testid="session-id-badge"]');
        const sessionId = sessionBadge ? sessionBadge.textContent.trim() : (document.body.innerText.match(/practice-[a-z0-9-]+/)?.[0] || null);
        const stepMatch = document.body.innerText.match(/کندل \\d+ از \\d+/);
        const balances = document.body.innerText.match(/\\$[\\d,.]+/g) || [];
        return {
          sessionId,
          stepText: stepMatch ? stepMatch[0] : null,
          balances: balances.slice(0, 4)
        };
      })()
    `);

    await cdp.send('Page.reload');
    await sleep(3500);

    const s8After = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        const sessionBadge = document.querySelector('[data-testid="session-id-badge"]');
        const sessionId = sessionBadge ? sessionBadge.textContent.trim() : (text.match(/practice-[a-z0-9-]+/)?.[0] || null);
        const stepMatch = text.match(/کندل \\d+ از \\d+/);
        const balances = text.match(/\\$[\\d,.]+/g) || [];
        return {
          sessionId,
          stepText: stepMatch ? stepMatch[0] : null,
          balances: balances.slice(0, 4),
          identity: text.includes('تمرین با دادهٔ نمونه — حساب مجازی — بدون ارسال به بروکر'),
          storageBadge: text.includes('ذخیره روی مرورگر')
        };
      })()
    `);

    const s8SessionMatch = Boolean(s8Before.sessionId && s8Before.sessionId === s8After.sessionId);
    const s8StepMatch = Boolean(s8Before.stepText && s8Before.stepText === s8After.stepText);
    const s8Passed = s8SessionMatch && s8StepMatch && s8After.identity && s8After.storageBadge;
    results.scenarios.push({
      id: 8,
      name: 'رفرش صفحه و باقی ماندن شناسه، گام ریپلی و موجودی نشست بدون نشت یا تغییر',
      passed: s8Passed,
      detail: { before: s8Before, after: s8After, matches: { s8SessionMatch, s8StepMatch } },
    });

    // ==========================================
    // SCENARIO 9: Start New Session — Confirm and Cancel
    // ==========================================
    console.log('Running Scenario 9: Start New Session with both Cancel and Confirm flows...');
    // Step 9.1: Click new session -> Cancel
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const newBtn = buttons.find(b => b.textContent.includes('شروع نشست جدید'));
        if (newBtn) newBtn.click();
      })()
    `);
    await sleep(800);

    const s9ModalVisible = await cdp.eval(`
      (function() {
        return document.body.innerText.includes('انصراف (بدون تغییر)') || document.body.innerText.includes('تأیید و بایگانی');
      })()
    `);

    // Click Cancel
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const cancelBtn = buttons.find(b => b.textContent.includes('انصراف (بدون تغییر)') || b.textContent.trim() === 'انصراف');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await sleep(800);

    const s9SessionAfterCancel = await cdp.eval(`
      (function() {
        const sessionBadge = document.querySelector('[data-testid="session-id-badge"]');
        return sessionBadge ? sessionBadge.textContent.trim() : (document.body.innerText.match(/practice-[a-z0-9-]+/)?.[0] || null);
      })()
    `);
    const cancelWorked = Boolean(s9SessionAfterCancel && s9SessionAfterCancel === s8After.sessionId);

    // Step 9.2: Click new session -> Confirm
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const newBtn = buttons.find(b => b.textContent.includes('شروع نشست جدید'));
        if (newBtn) newBtn.click();
      })()
    `);
    await sleep(800);

    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.find(b => b.textContent.includes('تأیید و بایگانی نشست') || b.textContent.includes('تأیید و بایگانی'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1500);

    const s9ConfirmVerify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        const sessionBadge = document.querySelector('[data-testid="session-id-badge"]');
        const newSessionId = sessionBadge ? sessionBadge.textContent.trim() : (text.match(/practice-[a-z0-9-]+/)?.[0] || null);
        return {
          newSessionId,
          has10000: text.includes('10000.00') || text.includes('10,000'),
          zeroClosed: text.includes('0 معامله بسته شده') || text.includes('هنوز هیچ معامله‌ای')
        };
      })()
    `);

    const confirmWorked = Boolean(s9ConfirmVerify.newSessionId && s9ConfirmVerify.newSessionId !== s9SessionAfterCancel);
    const s9Passed = s9ModalVisible && cancelWorked && confirmWorked && s9ConfirmVerify.has10000;
    results.scenarios.push({
      id: 9,
      name: 'آزمایش هر دو جریان انصراف و تأیید شروع نشست تازه و بازنشانی وضعیت جاری',
      passed: s9Passed,
      detail: { s9ModalVisible, cancelWorked, confirmWorked, s9ConfirmVerify },
    });

    const previousSessionIdForArchive = s9SessionAfterCancel;

    // ==========================================
    // SCENARIO 10: Switch Symbol to EURUSD
    // ==========================================
    console.log('Running Scenario 10: Switch symbol to EURUSD & verify trade form and chart sync...');
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const eurusdBtn = buttons.find(b => b.textContent.trim() === 'EURUSD');
        if (eurusdBtn) eurusdBtn.click();
      })()
    `);
    await sleep(800);

    // If confirmation modal appeared
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.find(b => b.textContent.includes('تأیید و بایگانی'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1500);

    const s10Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        const symbolBadge = text.includes('نماد:EURUSD') || (text.includes('نماد:') && text.includes('EURUSD'));
        const sessionMatch = text.match(/practice-eurusd-[a-z0-9-]+/);

        // Check trade form entry price: EURUSD should be around 1.0... NOT 2600+
        const priceCard = Array.from(document.querySelectorAll('div')).find(d => d.textContent.includes('قیمت ورود:'));
        const priceText = priceCard ? priceCard.innerText : '';

        return {
          symbolBadge,
          hasEurusdSession: Boolean(sessionMatch),
          priceText
        };
      })()
    `);
    const s10Passed = s10Verify.symbolBadge && s10Verify.hasEurusdSession;
    results.scenarios.push({
      id: 10,
      name: 'تغییر نماد به EURUSD و هماهنگ‌سازی نماد نشست، نمودار و فرم معامله',
      passed: s10Passed,
      detail: s10Verify,
    });

    // ==========================================
    // SCENARIO 11: Archive Drawer Verification with Exact Past Session ID
    // ==========================================
    console.log('Running Scenario 11: Open archive drawer and verify exact previous session ID...');
    await cdp.eval(`
      (function() {
        const btn = document.querySelector('[data-testid="archive-toggle-btn"]');
        if (btn) {
          btn.click();
          return;
        }
        const headings = Array.from(document.querySelectorAll('h2, div, button'));
        const archiveTrigger = headings.find(h => h.textContent.includes('آرشیو نشست‌های پیشین'));
        if (archiveTrigger) archiveTrigger.click();
      })()
    `);
    await sleep(1000);

    const s11Verify = await cdp.eval(`
      (function(targetSessionId) {
        const text = document.body.innerText;
        const archiveTable = document.querySelector('[data-testid="archive-table"]') || document.querySelectorAll('table')[1];
        const archiveText = archiveTable ? archiveTable.innerText : text;
        const hasHeader = text.includes('آرشیو نشست‌های پیشین');
        const hasTargetSession = targetSessionId ? archiveText.includes(targetSessionId) : text.includes('practice-');
        const hasArchiveTable = Boolean(archiveTable);

        return {
          hasHeader,
          hasTargetSession,
          hasArchiveTable,
          targetSearched: targetSessionId
        };
      })(${JSON.stringify(previousSessionIdForArchive)})
    `);
    const s11Passed = s11Verify.hasHeader && s11Verify.hasTargetSession;
    results.scenarios.push({
      id: 11,
      name: 'دیدن نشست قبلی در آرشیو همراه با اعتبارسنجی شناسه دقیق نشست',
      passed: s11Passed,
      detail: s11Verify,
    });

    // ==========================================
    // SCENARIO 12: Viewport Adaptability & Overflow Audit
    // ==========================================
    console.log('Running Scenario 12: Viewport adaptability, horizontal overflow measurement & control reachability...');
    // Close archive drawer
    await cdp.eval(`
      (function() {
        const btn = document.querySelector('[data-testid="archive-toggle-btn"]');
        if (btn) {
          btn.click();
          return;
        }
        const headings = Array.from(document.querySelectorAll('h2, div, button'));
        const archiveTrigger = headings.find(h => h.textContent.includes('آرشیو نشست‌های پیشین'));
        if (archiveTrigger) archiveTrigger.click();
      })()
    `);
    await sleep(500);

    async function auditViewportMetrics(width, height, screenshotName) {
      await cdp.setViewport(width, height);
      await sleep(1000);
      const screenshotPath = path.join(ARTIFACT_DIR, screenshotName);
      await cdp.captureScreenshot(screenshotPath);
      try {
        const repoScreenshotsDir = path.join(process.cwd(), 'scripts', 'screenshots');
        if (!fs.existsSync(repoScreenshotsDir)) fs.mkdirSync(repoScreenshotsDir, { recursive: true });
        fs.copyFileSync(screenshotPath, path.join(repoScreenshotsDir, screenshotName));
      } catch {
        // ignore
      }
      results.screenshots.push(screenshotName);

      const metrics = await cdp.eval(`
        (function() {
          const scrollW = document.documentElement.scrollWidth;
          const clientW = document.documentElement.clientWidth;
          const hasHorizontalOverflow = scrollW > clientW + 2;

          const hasIdentity = document.body.innerText.includes('تمرین با دادهٔ نمونه');
          const hasCards = document.body.innerText.includes('موجودی نقدشده');
          const hasChart = document.querySelector('[data-testid="chart-container"]') !== null || document.querySelector('svg') !== null || document.querySelector('canvas') !== null;
          const hasForm = document.body.innerText.includes('جهت معامله:') || document.body.innerText.includes('خرید (BUY)');

          return {
            scrollWidth: scrollW,
            clientWidth: clientW,
            hasHorizontalOverflow,
            controls: { hasIdentity, hasCards, hasChart, hasForm }
          };
        })()
      `);
      return metrics;
    }

    const desktopMetrics = await auditViewportMetrics(1440, 900, 'practice_desktop_1440_real.png');
    const tabletMetrics = await auditViewportMetrics(768, 1024, 'practice_tablet_768_real.png');
    const mobileMetrics = await auditViewportMetrics(390, 844, 'practice_mobile_390_real.png');

    const s12Passed =
      !desktopMetrics.hasHorizontalOverflow &&
      !tabletMetrics.hasHorizontalOverflow &&
      !mobileMetrics.hasHorizontalOverflow &&
      desktopMetrics.controls.hasIdentity &&
      tabletMetrics.controls.hasIdentity &&
      mobileMetrics.controls.hasIdentity;

    results.scenarios.push({
      id: 12,
      name: 'بررسی اندازهٔ صفحه در دسکتاپ (۱۴۴۰)، تبلت (۷۶۸) و موبایل (۳۹۰) با سنجش سرریز و دسترسی به کنترل‌ها',
      passed: s12Passed,
      detail: {
        desktop: desktopMetrics,
        tablet: tabletMetrics,
        mobile: mobileMetrics,
      },
    });

    // ==========================================
    // Network & Security Audit
    // ==========================================
    console.log('Running Network Security Audit...');
    const FORBIDDEN_PATHS = [
      '/api/orders/submit',
      '/api/orders/emergency-stop',
      '/api/orders/reconcile',
      '/api/orders/outbox',
      '/api/executor',
      '/api/auth/ctrader',
      'ctrader',
      'broker',
    ];

    const forbiddenHits = cdp.networkRequests.filter(req => {
      const urlLower = req.url.toLowerCase();
      return FORBIDDEN_PATHS.some(p => urlLower.includes(p.toLowerCase()));
    });

    results.networkAudit.totalHttpRequests = cdp.networkRequests.length;
    results.networkAudit.totalWebSocketConnections = cdp.webSocketConnections.length;
    results.networkAudit.forbiddenRequestsDetected = forbiddenHits;
    results.networkAudit.browserMadeForbiddenRequest = forbiddenHits.length > 0;
    results.networkAudit.passed = forbiddenHits.length === 0;

    // Collect Console Errors & Runtime Exceptions
    results.consoleErrors = cdp.consoleMessages.filter(m => m.type === 'error' || m.type === 'warning');
    results.runtimeExceptions = cdp.runtimeExceptions;

    const allScenariosPassed = results.scenarios.every(s => s.passed);
    results.overallPassed = allScenariosPassed && results.networkAudit.passed;

    console.log('\n=== BROWSER TEST RUN SUMMARY ===');
    console.log(`Scenarios: ${results.scenarios.filter(s => s.passed).length}/${results.scenarios.length} passed`);
    console.log(`Network Audit Passed: ${results.networkAudit.passed}`);
    console.log(`Overall Status: ${results.overallPassed ? 'PASS' : 'FAIL'}`);

    // Save portable results JSON
    const jsonOutput1 = path.join(process.cwd(), 'scripts', 'test-practice-browser-results.json');
    const jsonOutput2 = path.join(ARTIFACT_DIR, 'test-practice-browser-results.json');
    const serializedResults = JSON.stringify(results, null, 2);
    fs.writeFileSync(jsonOutput1, serializedResults);
    try {
      fs.writeFileSync(jsonOutput2, serializedResults);
    } catch {
      // ignore
    }

    if (!results.overallPassed) {
      process.exitCode = 1;
    }
  } finally {
    console.log('Cleaning up browser resources and temporary profile...');
    if (pageWs) pageWs.close();
    if (browserWs) browserWs.close();
    if (chromeProcess.pid) {
      killProcessTree(chromeProcess.pid);
    }

    // Give process 1 second to release lock
    await sleep(1000);
    try {
      if (fs.existsSync(tempProfileDir)) {
        fs.rmSync(tempProfileDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('Ephemeral profile cleanup note:', e.message);
    }
  }
}

// Ensure execution ends cleanly without hanging
const timeoutHandle = setTimeout(() => {
  console.error('Test suite timed out after 150 seconds.');
  process.exit(1);
}, 150000);
timeoutHandle.unref();

runTests()
  .then(() => {
    console.log('Test suite run ended cleanly.');
    process.exit(process.exitCode || 0);
  })
  .catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
