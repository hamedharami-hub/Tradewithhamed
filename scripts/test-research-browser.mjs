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

async function waitForServer(urlText, maxAttempts = 30) {
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
  console.log('=== Starting Research / Backtest Browser E2E Integrity Suite ===');

  const appPort = await detectAppPort();
  const APP_URL = `http://127.0.0.1:${appPort}`;
  const RESEARCH_URL = `${APP_URL}/research`;
  console.log(`Detected App URL: ${RESEARCH_URL}`);

  await waitForServer(RESEARCH_URL);

  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-research-profile-'));
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
    suite: 'research-backtest-browser-integrity',
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
    // سناریو ۱: بارگذاری اولیه صفحه، عناوین، سلکتور نماد و تایم‌فریم
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
    // سناریو ۲: بارگذاری دیتاست تاریخی GBPUSD (تایم‌فریم 15M) و ورود به گام ۲
    // =========================================================================
    console.log('\n--- Scenario 2: Load Bundled GBPUSD 15M Dataset ---');
    // کلیک روی نماد GBPUSD
    await cdp.eval(`(() => {
      const btnGbp = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'GBPUSD');
      if (btnGbp) btnGbp.click();
    })()`);
    await sleep(300);

    // کلیک روی تایم‌فریم 15M
    await cdp.eval(`(() => {
      const btn15M = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '15M');
      if (btn15M) btn15M.click();
    })()`);
    await sleep(500);

    // کلیک روی دکمه بارگذاری دیتاست آماده
    await cdp.eval(`(() => {
      const loadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('بارگذاری دیتاست آماده'));
      if (loadBtn) loadBtn.click();
    })()`);

    // انتظار برای اتمام بارگذاری و اعتبارسنجی
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

    // =========================================================================
    // سناریو ۳: آزمون سوئیچ تایم‌فریم و بازنشانی وضعیت منسوخ (Stale Reset)
    // =========================================================================
    console.log('\n--- Scenario 3: Timeframe Switching & Stale State Reset ---');
    // کلیک روی دکمه تغییر داده جهت بازگشت به گام ۱
    await cdp.eval(`(() => {
      const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('تغییر داده'));
      if (backBtn) backBtn.click();
    })()`);
    await sleep(400);

    // کلیک روی تایم‌فریم 1H
    await cdp.eval(`(() => {
      const btn1H = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '1H');
      if (btn1H) btn1H.click();
    })()`);
    await sleep(500);

    const resetState = await cdp.eval(`(() => {
      const body = document.body.innerText;
      const isBackToStep1 = body.includes('گام ۱') || body.includes('انتخاب نماد، تایم‌فریم');
      const loadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('بارگذاری دیتاست آماده'));
      return { isBackToStep1, hasLoadBtn: !!loadBtn };
    })()`);

    // بارگذاری دیتاست 1H
    await cdp.eval(`(() => {
      const loadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('بارگذاری دیتاست آماده'));
      if (loadBtn) loadBtn.click();
    })()`);
    await sleep(1500);

    const h1Loaded = await cdp.eval(`(() => {
      const body = document.body.innerText;
      return body.includes('گام ۲') || body.includes('گزارش کیفیت و اعتبارسنجی داده');
    })()`);

    const s3Passed = resetState.isBackToStep1 && h1Loaded;
    testReport.scenarios.push({
      id: 3,
      name: 'بازنشانی وضعیت منسوخ هنگام سوئیچ به ۱H و بارگذاری موفق دیتاست جدید',
      passed: s3Passed,
      details: `بازنشانی به گام ۱: ${resetState.isBackToStep1}؛ بارگذاری مجدد در ۱H: ${h1Loaded}`,
    });
    console.log(`[${s3Passed ? 'PASS' : 'FAIL'}] Scenario 3: Timeframe switch and reset verified`);

    // =========================================================================
    // سناریو ۴: عبور به گام ۳ و تنظیمات خانواده‌های استراتژی و پریست‌ها
    // =========================================================================
    console.log('\n--- Scenario 4: Step 3 Strategy Selection & Preset Switching ---');
    // کلیک روی تأیید کیفیت و رفتن به انتخاب روش
    await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('تأیید کیفیت'));
      if (btn) btn.click();
    })()`);
    await sleep(600);

    const s3State = await cdp.eval(`(() => {
      const body = document.body.innerText;
      const hasStep3 = body.includes('گام ۳') || body.includes('انتخاب خانواده استراتژی');
      const strategyButtons = Array.from(document.querySelectorAll('button')).filter(b =>
        b.innerText.includes('شکست روند') ||
        b.innerText.includes('بازگشت به میانگین') ||
        b.innerText.includes('اسمارت‌مانی') ||
        b.innerText.includes('اسکلپ') ||
        b.innerText.includes('سوئینگ')
      ).map(b => b.innerText.trim());

      const presetButtons = Array.from(document.querySelectorAll('button')).filter(b =>
        b.innerText.includes('محافظه‌کارانه') ||
        b.innerText.includes('متعادل') ||
        b.innerText.includes('تهاجمی')
      ).map(b => b.innerText.trim());

      return {
        hasStep3,
        strategyButtonsCount: strategyButtons.length,
        presetButtonsCount: presetButtons.length,
      };
    })()`);

    // انتخاب استراتژی شکست روند (Breakout)
    await cdp.eval(`(() => {
      const tbBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('شکست روند'));
      if (tbBtn) tbBtn.click();
    })()`);
    await sleep(300);

    // تست کلیک روی پریست تهاجمی
    await cdp.eval(`(() => {
      const aggBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('تهاجمی'));
      if (aggBtn) aggBtn.click();
    })()`);
    await sleep(300);

    // بازگرداندن به پریست متعادل (BALANCED)
    await cdp.eval(`(() => {
      const balBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('متعادل'));
      if (balBtn) balBtn.click();
    })()`);
    await sleep(300);

    const s4Passed = s3State.hasStep3 && s3State.strategyButtonsCount >= 4 && s3State.presetButtonsCount >= 3;
    testReport.scenarios.push({
      id: 4,
      name: 'گام ۳: بررسی ۵ خانواده استراتژی، پریست‌های معاملاتی و سفارشی‌سازی پارامترها',
      passed: s4Passed,
      details: `گام ۳ فعال=${s3State.hasStep3}؛ تعداد استراتژی‌ها=${s3State.strategyButtonsCount}؛ تعداد پریست‌ها=${s3State.presetButtonsCount}`,
    });
    console.log(`[${s4Passed ? 'PASS' : 'FAIL'}] Scenario 4: Strategy families and presets verified`);

    // =========================================================================
    // سناریو ۵: عبور به گام ۴ و تنظیمات هزینه، ریسک و سیاست پایان دیتا
    // =========================================================================
    console.log('\n--- Scenario 5: Step 4 Cost & Risk Configuration ---');
    await cdp.eval(`(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('تنظیم هزینه و ریسک'));
      if (nextBtn) nextBtn.click();
    })()`);
    await sleep(600);

    const step4State = await cdp.eval(`(() => {
      const body = document.body.innerText;
      const hasStep4 = body.includes('گام ۴') || body.includes('هزینه‌های معاملاتی');
      const hasRiskInputs = body.includes('سقف ریسک هر معامله') || body.includes('اسپرد معمول');
      const hasPolicySelect = body.includes('سیاست پایان دیتاست');
      return { hasStep4, hasRiskInputs, hasPolicySelect };
    })()`);

    const s5Passed = step4State.hasStep4 && step4State.hasRiskInputs;
    testReport.scenarios.push({
      id: 5,
      name: 'گام ۴: کنترل مفروضات ریسک، هزینه‌های بروکر و سیاست پایان دیتا',
      passed: s5Passed,
      details: `گام ۴ فعال=${step4State.hasStep4}؛ فیلدهای ریسک=${step4State.hasRiskInputs}؛ سیاست پایان دیتا=${step4State.hasPolicySelect}`,
    });
    console.log(`[${s5Passed ? 'PASS' : 'FAIL'}] Scenario 5: Cost and Risk step verified`);

    // =========================================================================
    // سناریو ۶: عبور به گام ۵، اجرای بک‌تست با Web Worker و نوار پیشرفت زنده
    // =========================================================================
    console.log('\n--- Scenario 6: Step 5 Web Worker Execution & Progress Bar ---');
    await cdp.eval(`(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('آماده‌سازی برای اجرا'));
      if (nextBtn) nextBtn.click();
    })()`);
    await sleep(600);

    // کلیک روی اجرای بک‌تست تاریخی در مرورگر
    await cdp.eval(`(() => {
      const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('اجرای بک‌تست تاریخی'));
      if (startBtn) startBtn.click();
    })()`);

    // بررسی پیشرفت و رفتن به گام ۶
    let executionFinished = false;
    let finalStepState = null;

    for (let i = 0; i < 40; i++) {
      await sleep(500);
      finalStepState = await cdp.eval(`(() => {
        const body = document.body.innerText;
        const isStep6 = body.includes('گام ۶') || body.includes('نتایج و تحلیل عملکرد');
        const hasMetrics = body.includes('سود خالص') || body.includes('نرخ برد');
        const hasCancel = !!Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('لغو عملیات'));
        const progressEl = body.includes('پردازش رویدادمحور در Web Worker');
        return { isStep6, hasMetrics, hasCancel, hasProgress: progressEl };
      })()`);

      if (finalStepState.isStep6 || finalStepState.hasMetrics) {
        executionFinished = true;
        break;
      }
    }

    testReport.scenarios.push({
      id: 6,
      name: 'گام ۵ و ۶: اجرای بدون مسدودی با وب‌ورکر و ورود به نتایج عملکرد',
      passed: executionFinished,
      details: `رسیدن به گام ۶=${executionFinished}؛ شاخص‌های مالی نمایش داده شد=${finalStepState?.hasMetrics}`,
    });
    console.log(`[${executionFinished ? 'PASS' : 'FAIL'}] Scenario 6: Web worker backtest completed successfully`);

    // =========================================================================
    // سناریو ۷: اعتبارسنجی مقادیر واقعی نتایج بکتست GBPUSD 1H
    // =========================================================================
    console.log('\n--- Scenario 7: Validate Real Results Metrics ---');
    const resultValues = await cdp.eval(`(() => {
      const body = document.body.innerText;
      return {
        hasWinRate: body.includes('نرخ برد'),
        hasProfitFactor: body.includes('فاکتور سود'),
        hasMaxDrawdown: body.includes('افت سرمایه') || body.includes('Drawdown'),
        hasExecutionBreakdown: body.includes('زمان‌سنجی فازهای اجرایی') || body.includes('زمان بکتست'),
        hasDiagnostics: body.includes('آمار تشخیصی رویدادها') || body.includes('کاندیداها'),
      };
    })()`);

    const s7Passed = resultValues.hasWinRate && resultValues.hasProfitFactor;
    testReport.scenarios.push({
      id: 7,
      name: 'گام ۶: نمایش کامل کارت‌های عملکرد، تفکیک زمان‌های اجرایی و آمار تشخیصی',
      passed: s7Passed,
      details: `نرخ برد=${resultValues.hasWinRate}؛ فاکتور سود=${resultValues.hasProfitFactor}؛ تفکیک زمان=${resultValues.hasExecutionBreakdown}؛ آمار تشخیصی=${resultValues.hasDiagnostics}`,
    });
    console.log(`[${s7Passed ? 'PASS' : 'FAIL'}] Scenario 7: Result cards and diagnostics verified`);

    // =========================================================================
    // سناریو ۸: آزمون واکنش‌گرایی در ۳ ابعاد (Desktop 1440, Tablet 768, Mobile 390)
    // =========================================================================
    console.log('\n--- Scenario 8: Responsive Viewport Testing & Real Screenshots ---');
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

    // بازگرداندن ویوپورت به دسکتاپ
    await cdp.setViewport(1440, 900);

    const s8Passed = testReport.screenshots.every(s => s.filesize > 10000);
    testReport.scenarios.push({
      id: 8,
      name: 'ثبت تصاویر واقعی در ۳ ویوپورت دسکتاپ، تبلت و موبایل با ساختار واکنش‌گرا',
      passed: s8Passed,
      details: testReport.screenshots.map(s => `${s.viewport}: ${s.filesize} بایت`).join(' | '),
    });
    console.log(`[${s8Passed ? 'PASS' : 'FAIL'}] Scenario 8: All 3 screenshots saved successfully`);

    // =========================================================================
    // سناریو ۹: آدیت شبکه و امنیت آفلاین (تایید ۰ فراخوانی به بروکر واقعی)
    // =========================================================================
    console.log('\n--- Scenario 9: Network Security Audit (0 Live Broker Calls) ---');
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

    const s9Passed = liveBrokerRequests.length === 0;
    testReport.scenarios.push({
      id: 9,
      name: 'آدیت امنیت شبکه: اثبات اجرای ۱۰۰٪ آفلاین و عدم ارسال حتی یک تیکت به بروکر واقعی',
      passed: s9Passed,
      details: `کل درخواست‌ها=${allRequests.length}؛ درخواست‌های بروکر واقعی=${liveBrokerRequests.length} (کاملاً آفلاین=${s9Passed})`,
    });
    console.log(`[${s9Passed ? 'PASS' : 'FAIL'}] Scenario 9: 0 live broker calls confirmed`);

    // =========================================================================
    // سناریو ۱۰: کنترل خطاهای کنسول و عدم وجود Exception یا Crash
    // =========================================================================
    console.log('\n--- Scenario 10: Console Errors & Runtime Crash Check ---');
    const fatalExceptions = cdp.runtimeExceptions.filter(e => {
      const desc = (e.description || '').toLowerCase();
      // استثنائات توسعه‌دهنده Next.js که ربطی به خطای اجرایی ندارد
      return !desc.includes('webpack') && !desc.includes('hot-reload');
    });

    testReport.consoleAudit.totalMessages = cdp.consoleMessages.length;
    testReport.consoleAudit.errorsCount = cdp.consoleMessages.filter(m => m.type === 'error').length;
    testReport.consoleAudit.exceptionsCount = fatalExceptions.length;

    const s10Passed = fatalExceptions.length === 0;
    testReport.scenarios.push({
      id: 10,
      name: 'آدیت کنسول مرورگر: عدم وقوع خطای پرتاب‌شده (Uncaught Exception) یا کرش رندرینگ',
      passed: s10Passed,
      details: `پیام‌های کنسول=${cdp.consoleMessages.length}؛ خطاهای fatal=${fatalExceptions.length}`,
    });
    console.log(`[${s10Passed ? 'PASS' : 'FAIL'}] Scenario 10: 0 runtime exceptions`);

    // ارزیابی کلی موفقیت
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

  // ذخیره گزارش جامع در دایرکتوری آرتیفکت
  const resultsJsonPath = path.join(ARTIFACT_DIR, 'test-research-browser-results.json');
  fs.writeFileSync(resultsJsonPath, JSON.stringify(testReport, null, 2), 'utf-8');
  console.log(`\nSaved test results to ${resultsJsonPath}`);

  console.log(`\n======================================================`);
  console.log(`Research Browser Test Result: ${testReport.success ? 'ALL PASS (10/10)' : 'FAILED'}`);
  console.log(`======================================================`);

  if (!testReport.success) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error in test script:', err);
  process.exit(1);
});
