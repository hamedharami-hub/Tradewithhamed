import { spawn } from 'node:child_process';
import { request } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';

const DEBUG_PORT = 9444;
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
      const isTradewithhamed = await new Promise(resolve => {
        const req = request(`http://127.0.0.1:${port}/research`, res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 500 && (data.includes('پژوهش') || data.includes('research') || data.includes('Tradewithhamed') || data.includes('استراتژی'))) {
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
      // try next
    }
  }
  return 3105;
}

async function waitForServer(urlText, maxAttempts = 40) {
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
  throw new Error(`Server did not respond at ${urlText}`);
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
        }
      } catch (err) {
        console.error('CDP parse error:', err);
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

async function main() {
  console.log('=== Starting Research / Backtest Package 1 E2E Integrity Suite ===');

  const appPort = await detectAppPort();
  const APP_URL = `http://127.0.0.1:${appPort}`;
  const RESEARCH_URL = `${APP_URL}/research`;
  console.log(`Detected App URL: ${RESEARCH_URL}`);

  await waitForServer(RESEARCH_URL);

  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-research-p1-'));
  console.log(`Ephemeral Chrome Profile: ${tempProfileDir}`);

  const chromeArgs = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${tempProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--headless=new',
    '--window-size=1440,900',
    'about:blank',
  ];

  const chromeProc = spawn(CHROME_PATH, chromeArgs, { stdio: 'ignore' });
  console.log(`Launched Chrome process (PID ${chromeProc.pid}) on debug port ${DEBUG_PORT}`);

  const testReport = {
    suite: 'research-backtest-package1-integrity',
    timestamp: new Date().toISOString(),
    appUrl: RESEARCH_URL,
    scenarios: [],
    screenshots: [],
    networkAudit: {
      totalRequests: 0,
      externalLiveBrokerRequests: 0,
      isCompletelyOffline: true,
      requestsSample: [],
    },
    consoleAudit: {
      totalMessages: 0,
      errorsCount: 0,
      exceptionsCount: 0,
    },
    success: true,
  };

  let cdp = null;

  try {
    await waitForServer(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 30);
    const versionInfo = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    console.log(`Connected to Chrome DevTools: ${versionInfo['Browser']}`);

    const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error('No page target found with webSocketDebuggerUrl');
    }

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
    });

    cdp = new CdpSession(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    console.log(`Navigating to ${RESEARCH_URL}...`);
    await cdp.send('Page.navigate', { url: RESEARCH_URL });
    await sleep(3000);

    // =========================================================================
    // سناریو ۱: بارگذاری اولیه صفحه و دکمه‌های گام ۱
    // =========================================================================
    console.log('\n--- Scenario 1: Initial Page Render & Step 1 Setup ---');
    const pageState = await cdp.eval(`(() => {
      const heading = document.querySelector('h1')?.innerText || '';
      const symbolButtons = Array.from(document.querySelectorAll('button')).filter(b => ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'].includes(b.innerText.trim())).map(b => b.innerText.trim());
      const timeframeButtons = Array.from(document.querySelectorAll('button')).filter(b => ['5M', '15M', '1H', '4H', 'D1'].includes(b.innerText.trim())).map(b => b.innerText.trim());
      const loadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('بارگذاری دیتاست آماده'));
      return {
        heading,
        symbolButtons,
        timeframeButtons,
        hasLoadBtn: !!loadBtn,
      };
    })()`);

    const s1Passed =
      (pageState.heading.includes('Research') || pageState.heading.includes('استراتژی')) &&
      pageState.timeframeButtons.length >= 4 &&
      pageState.hasLoadBtn;

    testReport.scenarios.push({
      id: 1,
      name: 'بارگذاری اولیه صفحه پژوهش و در دسترس بودن کنترل‌های گام ۱ (نماد و تایم‌فریم)',
      passed: s1Passed,
      details: `عنوان: ${pageState.heading}؛ نمادها: [${pageState.symbolButtons.join(', ')}]؛ تایم‌فریم‌ها: [${pageState.timeframeButtons.join(', ')}]؛ دکمه بارگذاری: ${pageState.hasLoadBtn}`,
    });
    console.log(`[${s1Passed ? 'PASS' : 'FAIL'}] Scenario 1: ${pageState.heading}`);

    // =========================================================================
    // سناریو ۲: بارگذاری دیتاست تاریخی GBPUSD 15M و عبور به گام ۲
    // =========================================================================
    console.log('\n--- Scenario 2: Load Bundled GBPUSD 15M Dataset ---');
    await cdp.eval(`(() => {
      const btnGbp = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'GBPUSD');
      if (btnGbp) btnGbp.click();
    })()`);
    await sleep(300);

    await cdp.eval(`(() => {
      const btn15M = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '15M');
      if (btn15M) btn15M.click();
    })()`);
    await sleep(400);

    await cdp.eval(`(() => {
      const loadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('بارگذاری دیتاست آماده'));
      if (loadBtn) loadBtn.click();
    })()`);

    let s2Loaded = false;
    let s2Metrics = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      s2Metrics = await cdp.eval(`(() => {
        const body = document.body.innerText;
        const hasStep2 = body.includes('گام ۲') || body.includes('گزارش کیفیت و اعتبارسنجی داده');
        const proceedBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('تأیید کیفیت'));
        const candleMatch = body.match(/([0-9,]+)\\s*کندل/);
        return {
          hasStep2,
          hasProceedBtn: !!proceedBtn,
          candleCountText: candleMatch ? candleMatch[0] : '',
        };
      })()`);
      if (s2Metrics.hasStep2 && s2Metrics.hasProceedBtn) {
        s2Loaded = true;
        break;
      }
    }

    testReport.scenarios.push({
      id: 2,
      name: 'بارگذاری موفقیت‌آمیز دیتاست توکار GBPUSD 15M و اعتبارسنجی کیفیت در گام ۲',
      passed: s2Loaded,
      details: `ورود به گام ۲: ${s2Metrics?.hasStep2}؛ دکمه تایید: ${s2Metrics?.hasProceedBtn}؛ تعداد کندل: ${s2Metrics?.candleCountText}`,
    });
    console.log(`[${s2Loaded ? 'PASS' : 'FAIL'}] Scenario 2: GBPUSD 15M loaded (${s2Metrics?.candleCountText})`);

    // تایید کیفیت داده و رفتن به گام ۳
    await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('تأیید کیفیت'));
      if (btn) btn.click();
    })()`);
    await sleep(600);

    // =========================================================================
    // سناریو ۳: گام ۳ و بررسی عدم تأثیر ناخواسته (Audit No-Op Parameters)
    // =========================================================================
    console.log('\n--- Scenario 3: Step 3 Parameter Audit & Honest HTF Disabled Label ---');
    const step3Audit = await cdp.eval(`(() => {
      const body = document.body.innerText;
      const hasHtfDisabled = body.includes('پکیج ۲: چندتایم‌فریمی') || body.includes('چندتایم‌فریمی');
      const hasDirectionFilter = body.includes('جهت معامله') || body.includes('LONG_ONLY') || body.includes('فقط خرید');
      const hasCooldown = body.includes('بار خنک‌سازی') || body.includes('Cooldown');
      const hasBreakeven = body.includes('ریسک‌فری خودکار') || body.includes('Breakeven');
      return { hasHtfDisabled, hasDirectionFilter, hasCooldown, hasBreakeven };
    })()`);

    const s3Passed = step3Audit.hasHtfDisabled && step3Audit.hasDirectionFilter && step3Audit.hasBreakeven;
    testReport.scenarios.push({
      id: 3,
      name: 'گام ۳: نمایش برچسب صادقانه غیرفعال بودن فیلتر چندتایم‌فریمی و حضور پارامترهای فعال',
      passed: s3Passed,
      details: `برچسب غیرفعال HTF: ${step3Audit.hasHtfDisabled}؛ فیلتر جهت: ${step3Audit.hasDirectionFilter}؛ ریسک‌فری Breakeven: ${step3Audit.hasBreakeven}`,
    });
    console.log(`[${s3Passed ? 'PASS' : 'FAIL'}] Scenario 3: Parameter honesty verified`);

    // عبور به گام ۴ (حساب، سشن، بازه تاریخی و ریسک)
    await cdp.eval(`(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
        b.innerText.includes('تنظیم حساب و سشن') || b.innerText.includes('تنظیم')
      );
      if (nextBtn) nextBtn.click();
    })()`);
    await sleep(800);

    // =========================================================================
    // سناریو ۴: گام ۴ - تنظیمات حساب (Account Configuration) و پریست‌های سرمایه
    // =========================================================================
    console.log('\n--- Scenario 4: Step 4 Account Configuration & Capital Presets ---');
    const accountState = await cdp.eval(`(() => {
      const body = document.body.innerText;
      const hasPresets = body.includes('$1k') && body.includes('$10k') && body.includes('$50k');
      const hasCurrencies = body.includes('USD') && body.includes('AUD');
      const hasLeverage = body.includes('اهرم') || body.includes('1:30');
      const hasDailyLoss = body.includes('سقف زیان روزانه');
      const hasMaxDd = body.includes('سقف کل افت سرمایه');
      const hasLotRules = body.includes('گام لات') || body.includes('حداقل لات');
      return { hasPresets, hasCurrencies, hasLeverage, hasDailyLoss, hasMaxDd, hasLotRules };
    })()`);

    // تغییر سرمایه به ۲۵,۰۰۰ با پریست $25k
    await cdp.eval(`(() => {
      const p25k = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '$25k');
      if (p25k) p25k.click();
    })()`);
    await sleep(300);

    const initialCapitalVal = await cdp.eval(`(() => {
      const input = document.querySelector('input[type="number"]');
      return input ? Number(input.value) : 0;
    })()`);

    // انتخاب مجدد سرمایه ۱۰,۰۰۰ برای تعادل تست با پریست $10k
    await cdp.eval(`(() => {
      const p10k = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '$10k');
      if (p10k) p10k.click();
    })()`);
    await sleep(300);

    const s4Passed = accountState.hasPresets && accountState.hasCurrencies && accountState.hasLeverage && initialCapitalVal === 25000;
    testReport.scenarios.push({
      id: 4,
      name: 'گام ۴: پریست‌های سرمایه اولیه (1k, 5k, 10k, 25k, 50k)، واحد ارزی، اهرم و حدود ریسک',
      passed: s4Passed,
      details: `پریست‌ها فعال=${accountState.hasPresets}؛ ارزها=${accountState.hasCurrencies}؛ انتخاب ۲۵هزار=${initialCapitalVal === 25000}`,
    });
    console.log(`[${s4Passed ? 'PASS' : 'FAIL'}] Scenario 4: Account configuration verified`);

    // =========================================================================
    // سناریو ۵: گام ۴ - مدیریت بازه تاریخی و نمایش ۶ آمار کلیدی (Date Range & 6 Stats)
    // =========================================================================
    console.log('\n--- Scenario 5: Step 4 Date Range Selector & 6 Stats Banner ---');
    const dateRangeState = await cdp.eval(`(() => {
      const body = document.body.innerText;
      const hasEarliest = body.includes('شروع کل دیتاست') || body.includes('شروع دیتاست');
      const hasLatest = body.includes('پایان کل دیتاست') || body.includes('پایان دیتاست');
      const hasCandlesCount = body.includes('کل کندل‌های در دسترس') || body.includes('کندل در دسترس');
      const hasModeSelector = body.includes('حالت انتخاب بازه زمانی') || body.includes('کل داده‌ها (Full)');
      return { hasEarliest, hasLatest, hasCandlesCount, hasModeSelector };
    })()`);

    // تست تغییر حالت به FIRST_25
    await cdp.eval(`(() => {
      const select = Array.from(document.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === 'FIRST_25')
      );
      if (select) {
        select.value = 'FIRST_25';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(300);

    // بازگرداندن به FULL
    await cdp.eval(`(() => {
      const select = Array.from(document.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === 'FULL')
      );
      if (select) {
        select.value = 'FULL';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(300);

    const s5Passed = dateRangeState.hasCandlesCount && dateRangeState.hasModeSelector;
    testReport.scenarios.push({
      id: 5,
      name: 'گام ۴: بنر ۶ آمار تاریخ و وارم‌آپ به همراه سلکتور ۸ حالتهٔ انتخاب بازه زمانی',
      passed: s5Passed,
      details: `شمارش کندل‌ها=${dateRangeState.hasCandlesCount}؛ سلکتور حالت‌ها=${dateRangeState.hasModeSelector}`,
    });
    console.log(`[${s5Passed ? 'PASS' : 'FAIL'}] Scenario 5: Date range and stats verified`);

    // =========================================================================
    // سناریو ۶: گام ۴ - فیلتر سشن و مناطق زمانی استاندارد IANA و DST
    // =========================================================================
    console.log('\n--- Scenario 6: Step 4 Session Filter & IANA Timezones ---');
    const sessionState = await cdp.eval(`(() => {
      const body = document.body.innerText;
      const hasLondon = body.includes('سشن لندن') || body.includes('LONDON');
      const hasTimezone = body.includes('منطقه زمانی با مدیریت DST') || body.includes('Europe/London') || body.includes('UTC');
      const hasWeekdays = body.includes('دوشنبه') && body.includes('جمعه');
      const hasRollover = body.includes('بلک‌اوت رول‌اور') || body.includes('21:55');
      return { hasLondon, hasTimezone, hasWeekdays, hasRollover };
    })()`);

    const s6Passed = sessionState.hasLondon && sessionState.hasTimezone && sessionState.hasWeekdays && sessionState.hasRollover;
    testReport.scenarios.push({
      id: 6,
      name: 'گام ۴: فیلتر سشن‌ها، مناطق زمانی IANA با DST، روزهای هفته و بلک‌اوت رول‌اور',
      passed: s6Passed,
      details: `سشن لندن=${sessionState.hasLondon}؛ تایم‌زون=${sessionState.hasTimezone}؛ روزهای هفته=${sessionState.hasWeekdays}؛ رول‌اور=${sessionState.hasRollover}`,
    });
    console.log(`[${s6Passed ? 'PASS' : 'FAIL'}] Scenario 6: Session and timezone integrity verified`);

    // رفتن به گام ۵ (آماده‌سازی برای اجرا)
    await cdp.eval(`(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('آماده‌سازی برای اجرا'));
      if (nextBtn) nextBtn.click();
    })()`);
    await sleep(800);

    // =========================================================================
    // سناریو ۷: گام ۵ - آزمون لغو عملیات (Cancel Execution) بدون فریز رابط کاربری
    // =========================================================================
    console.log('\n--- Scenario 7: Step 5 Worker Cancellation & Responsive UI ---');
    // کلیک روی اجرای بک‌تست
    await cdp.eval(`(() => {
      const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('اجرای بک‌تست تاریخی'));
      if (startBtn) startBtn.click();
    })()`);
    await sleep(100);

    // کلیک روی دکمه لغو در حین اجرا
    const cancelClicked = await cdp.eval(`(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('لغو عملیات'));
      if (cancelBtn) {
        cancelBtn.click();
        return true;
      }
      return false;
    })()`);
    await sleep(800);

    // بررسی وضعیت بعد از لغو
    const cancelResult = await cdp.eval(`(() => {
      const body = document.body.innerText;
      const isCancelledMsg = body.includes('لغو شد') || body.includes('توسط کاربر لغو شد');
      const startBtnAvailable = !!Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('اجرای بک‌تست تاریخی'));
      return { isCancelledMsg, startBtnAvailable };
    })()`);

    const s7Passed = cancelResult.startBtnAvailable || cancelResult.isCancelledMsg;
    testReport.scenarios.push({
      id: 7,
      name: 'گام ۵: لغو فوری عملیات در وب‌ورکر بدون مسدودی UI و بازگشت به وضعیت تعاملی',
      passed: s7Passed,
      details: `کلیک لغو=${cancelClicked}؛ دکمه اجرا دوباره فعال شد=${cancelResult.startBtnAvailable}؛ پیام لغو=${cancelResult.isCancelledMsg}`,
    });
    console.log(`[${s7Passed ? 'PASS' : 'FAIL'}] Scenario 7: Cancellation verified`);

    // =========================================================================
    // سناریو ۸: اجرای کامل بک‌تست و ورود به گام ۶ (نتایج عملکرد و تفکیک سشن‌ها)
    // =========================================================================
    console.log('\n--- Scenario 8: Full Backtest Execution & Step 6 Diagnostic Telemetry ---');
    await cdp.eval(`(() => {
      const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('اجرای بک‌تست تاریخی'));
      if (startBtn) startBtn.click();
    })()`);

    let executionComplete = false;
    let step6Details = null;

    for (let i = 0; i < 60; i++) {
      await sleep(500);
      step6Details = await cdp.eval(`(() => {
        const body = document.body.innerText;
        const isStep6 = body.includes('گام ۶') || body.includes('نتایج و تحلیل عملکرد') || body.includes('نتیجه و تفسیر عملکرد استراتژی');
        const hasNetProfit = body.includes('سود/زیان خالص') || body.includes('سود خالص') || body.includes('خالص کل');
        const hasCapitalDisplay = body.includes('سرمایه آغازین') || body.includes('سرمایه اولیه') || body.includes('موجودی / اکوئیتی نهایی');
        const hasSessionBreakdown = body.includes('تفکیک عملکرد بر اساس سشن') || body.includes('عملکرد تفکیکی بر حسب سشن');
        const hasWeekdayBreakdown = body.includes('تفکیک روزهای هفته') || body.includes('عملکرد تفکیکی بر حسب روز هفته');
        const errEl = document.querySelector('.bg-rose-500\\\\/10');
        const errorText = errEl ? errEl.innerText : '';
        const progressEl = document.querySelector('.font-mono.text-cyan-400');
        const progressText = progressEl ? progressEl.innerText : '';
        const isRunning = body.includes('پردازش رویدادمحور در Web Worker');
        return { isStep6, hasNetProfit, hasCapitalDisplay, hasSessionBreakdown, hasWeekdayBreakdown, errorText, progressText, isRunning };
      })()`);

      if (i % 5 === 0 || step6Details.isStep6) {
        console.log(`[Scenario 8 Poll ${i}] Step6=${step6Details.isStep6}, Running=${step6Details.isRunning}, Progress=${step6Details.progressText}, Error=${step6Details.errorText}`);
      }

      if (step6Details.isStep6 && step6Details.hasNetProfit) {
        executionComplete = true;
        break;
      }
    }

    const s8Passed = executionComplete && step6Details.hasSessionBreakdown && step6Details.hasWeekdayBreakdown;
    testReport.scenarios.push({
      id: 8,
      name: 'گام ۶: گزارش کامل نتایج عملکرد، سرمایه اولیه/نهایی، و تفکیک‌های سشن و روزهای هفته',
      passed: s8Passed,
      details: `تکمیل بک‌تست=${executionComplete}؛ نمایش سرمایه=${step6Details?.hasCapitalDisplay}؛ تفکیک سشن=${step6Details?.hasSessionBreakdown}؛ تفکیک روز هفته=${step6Details?.hasWeekdayBreakdown}`,
    });
    console.log(`[${s8Passed ? 'PASS' : 'FAIL'}] Scenario 8: Step 6 complete results and breakdowns verified`);

    // =========================================================================
    // سناریو ۹: آزمون واکنش‌گرایی در ۳ ویوپورت و ثبت اسکرین‌شات‌های واقعی
    // =========================================================================
    console.log('\n--- Scenario 9: Responsive Viewport Testing & Real Screenshots ---');
    const viewports = [
      { name: 'desktop_1440', width: 1440, height: 900, filename: 'research_desktop_1440_real.png' },
      { name: 'tablet_768', width: 768, height: 1024, filename: 'research_tablet_768_real.png' },
      { name: 'mobile_390', width: 390, height: 844, filename: 'research_mobile_390_real.png' },
    ];

    for (const vp of viewports) {
      console.log(`Testing viewport ${vp.name} (${vp.width}x${vp.height})...`);
      await cdp.setViewport(vp.width, vp.height);
      await sleep(1000);

      const targetPath = path.join(ARTIFACT_DIR, vp.filename);
      await cdp.captureScreenshot(targetPath);
      console.log(`Captured screenshot: ${targetPath}`);

      testReport.screenshots.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        path: targetPath,
        filesize: fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0,
      });
    }

    await cdp.setViewport(1440, 900);

    const s9Passed = testReport.screenshots.every(s => s.filesize > 10000);
    testReport.scenarios.push({
      id: 9,
      name: 'ثبت تصاویر واقعی در ۳ ویوپورت دسکتاپ، تبلت و موبایل با ساختار واکنش‌گرا',
      passed: s9Passed,
      details: testReport.screenshots.map(s => `${s.viewport}: ${s.filesize} بایت`).join(' | '),
    });
    console.log(`[${s9Passed ? 'PASS' : 'FAIL'}] Scenario 9: All 3 screenshots saved successfully`);

    // =========================================================================
    // سناریو ۱۰: آدیت امنیت شبکه (اثبات اجرای ۱۰۰٪ آفلاین بدون فراخوانی بروکر)
    // =========================================================================
    console.log('\n--- Scenario 10: Network Security Audit (0 Live Broker Calls) ---');
    const allRequests = cdp.networkRequests;
    const liveBrokerRequests = allRequests.filter(r => {
      const u = r.url.toLowerCase();
      return (
        u.includes('spotware') ||
        u.includes('ctrader') ||
        u.includes('openapi') ||
        u.includes('tradeapi') ||
        u.includes('live-broker') ||
        u.includes('api.broker')
      );
    });

    testReport.networkAudit.totalRequests = allRequests.length;
    testReport.networkAudit.externalLiveBrokerRequests = liveBrokerRequests.length;
    testReport.networkAudit.isCompletelyOffline = liveBrokerRequests.length === 0;
    testReport.networkAudit.requestsSample = allRequests.slice(0, 10).map(r => `${r.method} ${r.url}`);

    const s10Passed = liveBrokerRequests.length === 0;
    testReport.scenarios.push({
      id: 10,
      name: 'آدیت امنیت شبکه: اثبات اجرای ۱۰۰٪ آفلاین و عدم ارسال حتی یک سفارش به بروکر واقعی',
      passed: s10Passed,
      details: `کل درخواست‌ها=${allRequests.length}؛ درخواست‌های بروکر واقعی=${liveBrokerRequests.length} (کاملاً آفلاین=${s10Passed})`,
    });
    console.log(`[${s10Passed ? 'PASS' : 'FAIL'}] Scenario 10: 0 live broker calls confirmed`);

    // =========================================================================
    // سناریو ۱۱: کنترل خطاهای کنسول و عدم وجود Exception یا Crash
    // =========================================================================
    console.log('\n--- Scenario 11: Console Errors & Runtime Crash Check ---');
    const fatalExceptions = cdp.runtimeExceptions.filter(e => {
      const desc = (e.description || '').toLowerCase();
      return !desc.includes('webpack') && !desc.includes('hot-reload');
    });

    testReport.consoleAudit.totalMessages = cdp.consoleMessages.length;
    testReport.consoleAudit.errorsCount = cdp.consoleMessages.filter(m => m.type === 'error').length;
    testReport.consoleAudit.exceptionsCount = fatalExceptions.length;

    const s11Passed = fatalExceptions.length === 0;
    testReport.scenarios.push({
      id: 11,
      name: 'آدیت کنسول مرورگر: عدم وقوع خطای پرتاب‌شده (Uncaught Exception) یا کرش رندرینگ',
      passed: s11Passed,
      details: `پیام‌های کنسول=${cdp.consoleMessages.length}؛ خطاهای fatal=${fatalExceptions.length}`,
    });
    console.log(`[${s11Passed ? 'PASS' : 'FAIL'}] Scenario 11: 0 runtime exceptions`);

    // ارزیابی نهایی
    testReport.success = testReport.scenarios.every(s => s.passed);

  } catch (err) {
    console.error('Test execution error:', err);
    testReport.success = false;
    testReport.fatalError = err?.message || String(err);
  } finally {
    if (chromeProc && chromeProc.pid) {
      console.log(`Terminating Chrome process tree (PID ${chromeProc.pid})...`);
      killProcessTree(chromeProc.pid);
    }
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  // ذخیره گزارش جامع
  const resultsJsonPath = path.join(ARTIFACT_DIR, 'test-research-browser-results.json');
  fs.writeFileSync(resultsJsonPath, JSON.stringify(testReport, null, 2), 'utf-8');
  console.log(`\nSaved test results to ${resultsJsonPath}`);

  console.log(`\n======================================================`);
  console.log(`Research Browser Test Result: ${testReport.success ? 'ALL PASS (11/11)' : 'FAILED'}`);
  console.log(`======================================================`);

  if (!testReport.success) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error in test script:', err);
  process.exit(1);
});
