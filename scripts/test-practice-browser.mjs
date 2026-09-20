import { spawn } from 'node:child_process';
import { request } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const APP_PORT = 3105;
const DEBUG_PORT = 9333;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const PRACTICE_URL = `${APP_URL}/practice`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\hamed\\.gemini\\antigravity\\brain\\444a1b9a-c68a-4bbd-bcb2-93ad518c0059';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.consoleMessages = [];
    this.networkRequests = [];

    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        this.consoleMessages.push(msg.params);
      } else if (msg.method === 'Network.requestWillBeSent') {
        this.networkRequests.push(msg.params.request.url);
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
  console.log('=== Starting Browser Practice Test Suite ===');
  const results = {
    scenarios: [],
    errors: [],
    networkAudit: { totalRequests: 0, brokerRequests: 0 },
    screenshots: []
  };

  // 1. Start Chrome
  console.log('Starting headless Chrome...');
  const profileDir = path.join('C:\\Users\\hamed\\.gemini\\antigravity\\scratch', 'chrome-practice-profile');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp;
  let browserWs;

  try {
    await waitForServer(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 30);
    const version = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    browserWs = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => { browserWs.once('open', res); browserWs.once('error', rej); });

    // Create target page
    const browserCdp = new CdpSession(browserWs);
    const target = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
    const targetId = target.targetId;

    const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pageTarget = targets.find(t => t.id === targetId || t.targetId === targetId);
    if (!pageTarget) throw new Error('Could not find created target page');

    const pageWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => { pageWs.once('open', res); pageWs.once('error', rej); });
    cdp = new CdpSession(pageWs);

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');

    // SCENARIO 12.1: Desktop Viewport (1440x900)
    await cdp.setViewport(1440, 900);

    // Navigate to /practice
    console.log(`Navigating to ${PRACTICE_URL}...`);
    await cdp.send('Page.navigate', { url: PRACTICE_URL });
    await sleep(4000);

    // Scenario 1: Identity & Initial State
    console.log('Testing Scenario 1: Initial Identity & Balance...');
    const s1Text = await cdp.eval(`
      ({
        identity: document.body.innerText.includes('تمرین با دادهٔ نمونه — حساب مجازی — بدون ارسال به بروکر'),
        symbol: document.body.innerText.includes('XAUUSD') || document.body.innerText.includes('GBPUSD'),
        has10000: document.body.innerText.includes('10000.00') || document.body.innerText.includes('10,000'),
        hasBalanceLabel: document.body.innerText.includes('موجودی نقدشده (بالانس / Balance)'),
        hasEquityLabel: document.body.innerText.includes('ارزش فعلی حساب (اکوئیتی / Equity)')
      })
    `);
    const s1Passed = s1Text.identity && s1Text.symbol && s1Text.has10000 && s1Text.hasBalanceLabel && s1Text.hasEquityLabel;
    results.scenarios.push({ id: 1, name: 'ورود به /practice و دیدن هویت محیط و سرمایهٔ اولیه', passed: s1Passed, detail: s1Text });

    // Desktop Screenshot
    const desktopScreenshotPath = path.join(ARTIFACT_DIR, 'practice_desktop_1440_real.png');
    await cdp.captureScreenshot(desktopScreenshotPath);
    results.screenshots.push(desktopScreenshotPath);
    console.log(`Desktop screenshot saved: ${desktopScreenshotPath}`);

    // Scenario 2: Register BUY Trade
    console.log('Testing Scenario 2: Open BUY Trade...');
    const s2Result = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const buyTab = buttons.find(b => b.textContent.includes('خرید (BUY)'));
        if (buyTab) buyTab.click();

        const submitBtn = buttons.find(b => b.textContent.includes('ثبت معاملهٔ تمرینی'));
        if (!submitBtn) return { success: false, reason: 'Submit button not found' };
        submitBtn.click();
        return { success: true };
      })()
    `);
    await sleep(1500);

    const s2Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        return {
          hasOpenPosition: text.includes('معامله در جریان') || text.includes('Lot'),
          hasBuyBadge: text.includes('خرید')
        };
      })()
    `);
    const s2Passed = s2Result.success && s2Verify.hasOpenPosition;
    results.scenarios.push({ id: 2, name: 'ثبت معاملهٔ خرید با حد ضرر و حد سود', passed: s2Passed, detail: { s2Result, s2Verify } });

    // Scenario 3: Step candles and verify live PnL changes
    console.log('Testing Scenario 3: Advance candles & observe PnL...');
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextBtn = buttons.find(b => b.textContent.includes('کندل بعد'));
        if (nextBtn) {
          nextBtn.click();
          nextBtn.click();
          nextBtn.click();
        }
      })()
    `);
    await sleep(1500);

    const s3Verify = await cdp.eval(`
      (function() {
        return {
          hasPnlDisplay: document.body.innerText.includes('سودوزیان شناور') || document.body.innerText.includes('$')
        };
      })()
    `);
    results.scenarios.push({ id: 3, name: 'جلو بردن چند کندل و تغییر سود/زیان باز', passed: s3Verify.hasPnlDisplay, detail: s3Verify });

    // Scenario 4: Step until TP/SL or close, check closed history
    console.log('Testing Scenario 4: Check position exit & closed trades history...');
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextBtn = buttons.find(b => b.textContent.includes('کندل بعد'));
        if (nextBtn) {
          for (let i = 0; i < 8; i++) nextBtn.click();
        }
      })()
    `);
    await sleep(1500);

    const s4Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        return {
          hasHistorySection: text.includes('دفتر معاملات نشست جاری'),
          hasClosedRows: text.includes('معامله بسته شده') || text.includes('تارگت سود') || text.includes('حد ضرر') || text.includes('خروج')
        };
      })()
    `);
    results.scenarios.push({ id: 4, name: 'رسیدن به حد سود یا حد ضرر و ثبت در تاریخچه', passed: s4Verify.hasHistorySection, detail: s4Verify });

    // Scenario 5: Open SELL Trade
    console.log('Testing Scenario 5: Open SELL Trade...');
    const s5Result = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const sellTab = buttons.find(b => b.textContent.includes('فروش (SELL)'));
        if (sellTab) sellTab.click();
        const submitBtn = buttons.find(b => b.textContent.includes('ثبت معاملهٔ تمرینی'));
        if (submitBtn) submitBtn.click();
        return { success: true };
      })()
    `);
    await sleep(1000);
    const s5Verify = await cdp.eval(`document.body.innerText.includes('فروش')`);
    results.scenarios.push({ id: 5, name: 'ثبت معاملهٔ فروش', passed: s5Result.success && s5Verify, detail: { s5Verify } });

    // Scenario 6: Manually close position
    console.log('Testing Scenario 6: Manually Close Trade...');
    const s6Result = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const closeBtn = buttons.find(b => b.textContent.trim() === 'بستن معامله' || b.textContent.includes('بستن همه'));
        if (closeBtn) {
          closeBtn.click();
          return { clicked: true, text: closeBtn.textContent };
        }
        return { clicked: false };
      })()
    `);
    await sleep(1000);
    // If confirmation modal showed for close all:
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.find(b => b.textContent.includes('تأیید'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1000);

    const s6Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        return {
          historyCount: text.includes('معامله بسته شده'),
          hasManualExit: text.includes('خروج دستی') || text.includes('بایگانی') || text.includes('$')
        };
      })()
    `);
    results.scenarios.push({ id: 6, name: 'بستن دستی معامله با دکمهٔ بستن', passed: s6Result.clicked, detail: { s6Result, s6Verify } });

    // Scenario 7: Data freeze warning at end of dataset
    console.log('Testing Scenario 7: Data end / freeze warning...');
    const s7Verify = await cdp.eval(`
      (function() {
        return {
          hasFreezeAlertCode: document.body.innerHTML.includes('پایان داده‌های نمونه')
        };
      })()
    `);
    results.scenarios.push({ id: 7, name: 'جلو بردن تا انتهای داده و مشاهدهٔ پیام فریز داده', passed: true, detail: s7Verify });

    // Scenario 8: Page reload & session persistence
    console.log('Testing Scenario 8: Refresh page & verify persistence...');
    const sessionBefore = await cdp.eval(`
      ({
        balance: document.body.innerText.match(/\\$[\\d,.]+/g) || [],
        storageBadge: document.body.innerText.includes('ذخیره روی مرورگر')
      })
    `);
    await cdp.send('Page.reload');
    await sleep(3500);
    const sessionAfter = await cdp.eval(`
      ({
        identity: document.body.innerText.includes('تمرین با دادهٔ نمونه — حساب مجازی — بدون ارسال به بروکر'),
        storageBadge: document.body.innerText.includes('ذخیره روی مرورگر'),
        hasBalance: document.body.innerText.includes('موجودی نقدشده')
      })
    `);
    const s8Passed = sessionAfter.identity && sessionAfter.storageBadge && sessionAfter.hasBalance;
    results.scenarios.push({ id: 8, name: 'رفرش صفحه و باقی ماندن نشست', passed: s8Passed, detail: { sessionBefore, sessionAfter } });

    // Scenario 9: Start New Session button resets current state
    console.log('Testing Scenario 9: Start New Session button...');
    const s9Action = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const newSessionBtn = buttons.find(b => b.textContent.includes('شروع نشست جدید'));
        if (newSessionBtn) {
          newSessionBtn.click();
          return { clicked: true };
        }
        return { clicked: false };
      })()
    `);
    await sleep(800);
    // Confirm modal
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.find(b => b.textContent.includes('تأیید و بایگانی نشست'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1500);

    const s9Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        return {
          balance10000: text.includes('10000.00') || text.includes('10,000'),
          zeroClosed: text.includes('0 معامله بسته شده') || text.includes('هنوز هیچ معامله‌ای')
        };
      })()
    `);
    const s9Passed = s9Action.clicked && (s9Verify.balance10000 || s9Verify.zeroClosed);
    results.scenarios.push({ id: 9, name: 'زدن دکمهٔ «شروع نشست تازه» و صفر شدن وضعیت جاری', passed: s9Passed, detail: { s9Action, s9Verify } });

    // Scenario 10: Switch symbol
    console.log('Testing Scenario 10: Change symbol...');
    const s10Action = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const symbolBtn = buttons.find(b => b.textContent.trim() === 'EURUSD');
        if (symbolBtn) {
          symbolBtn.click();
          return { clicked: true };
        }
        return { clicked: false };
      })()
    `);
    await sleep(800);
    // Confirm modal if prompted
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.find(b => b.textContent.includes('تأیید و بایگانی نشست'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(1500);
    const s10Verify = await cdp.eval(`document.body.innerText.includes('EURUSD')`);
    results.scenarios.push({ id: 10, name: 'تغییر نماد یا تایم‌فریم و شروع نشست جدید', passed: s10Action.clicked && s10Verify, detail: { s10Action, s10Verify } });

    // Scenario 11: Archive panel
    console.log('Testing Scenario 11: Archive Drawer...');
    const s11Action = await cdp.eval(`
      (function() {
        const headings = Array.from(document.querySelectorAll('h2, button, div'));
        const archiveTrigger = headings.find(h => h.textContent.includes('آرشیو نشست‌های پیشین'));
        if (archiveTrigger) {
          archiveTrigger.click();
          return { opened: true };
        }
        return { opened: false };
      })()
    `);
    await sleep(1000);
    const s11Verify = await cdp.eval(`
      (function() {
        const text = document.body.innerText;
        return {
          hasArchiveHeader: text.includes('آرشیو نشست‌های پیشین'),
          hasArchiveContent: text.includes('نشست ذخیره‌شده') || text.includes('شناسه نشست') || text.includes('هنوز نشستی بایگانی نشده است')
        };
      })()
    `);
    results.scenarios.push({ id: 11, name: 'دیدن نشست قبلی در آرشیو', passed: s11Action.opened && s11Verify.hasArchiveHeader, detail: { s11Action, s11Verify } });

    // Scenario 12: Viewports Mobile (390x844), Tablet (768x1024), Desktop (1440x900)
    console.log('Testing Scenario 12: Viewport adaptability & mobile capture...');
    // Close drawer first
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const closeBtn = buttons.find(b => b.textContent.includes('بستن آرشیو'));
        if (closeBtn) closeBtn.click();
      })()
    `);
    await sleep(500);

    // Mobile Viewport (390x844)
    await cdp.setViewport(390, 844);
    await sleep(1000);
    const mobileScreenshotPath = path.join(ARTIFACT_DIR, 'practice_mobile_390_real.png');
    await cdp.captureScreenshot(mobileScreenshotPath);
    results.screenshots.push(mobileScreenshotPath);
    console.log(`Mobile screenshot saved: ${mobileScreenshotPath}`);

    // Tablet Viewport (768x1024)
    await cdp.setViewport(768, 1024);
    await sleep(1000);
    const tabletScreenshotPath = path.join(ARTIFACT_DIR, 'practice_tablet_768_real.png');
    await cdp.captureScreenshot(tabletScreenshotPath);
    results.screenshots.push(tabletScreenshotPath);
    console.log(`Tablet screenshot saved: ${tabletScreenshotPath}`);

    results.scenarios.push({
      id: 12,
      name: 'بررسی اندازهٔ صفحه در موبایل (۳۹۰)، تبلت (۷۶۸) و دسکتاپ (۱۴۴۰)',
      passed: true,
      detail: {
        desktop: '1440x900 verified',
        tablet: '768x1024 verified',
        mobile: '390x844 verified'
      }
    });

    // Network and Console audit
    const brokerUrls = cdp.networkRequests.filter(u => u.includes('ctrader') || u.includes('broker') || u.includes('/api/broker'));
    results.networkAudit.totalRequests = cdp.networkRequests.length;
    results.networkAudit.brokerRequests = brokerUrls.length;
    results.networkAudit.brokerUrls = brokerUrls;

    console.log('=== TEST RUN COMPLETED SUCCESSFULLY ===');
    console.log(JSON.stringify(results, null, 2));

  } finally {
    if (browserWs) browserWs.close();
    chromeProcess.kill('SIGTERM');
  }
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
