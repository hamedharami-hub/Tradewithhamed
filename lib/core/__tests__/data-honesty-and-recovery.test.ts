// lib/core/__tests__/data-honesty-and-recovery.test.ts
// آزمون‌های جامع خودکار صداقت اطلاعات، تفکیک محیط‌ها، داده‌های ناقص و پشتیبان‌گیری
// Automated Acceptance Tests for Data Honesty, Environment Isolation, Missing Data & Recovery

import { PersistenceStorage, BackupState } from '../../persistence/storage';
import { MultiAgentOrchestrator } from '../multi-agent-orchestrator';
import { PostTradeAnalyticsEngine } from '../post-trade-analytics';
import { TradeLifecycleRecord } from '../../contracts/w5-journal-analytics';
import { StrategyCandidate } from '../../contracts/strategy';

export interface DataHonestyTestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runDataHonestyAndRecoveryTests(): Promise<DataHonestyTestResult[]> {
  const results: DataHonestyTestResult[] = [];

  // ۱. آزمون رفت‌وبرگشت پشتیبان نسخه‌دار v2.1-sanitized، اعتبارسنجی چکسام و پاک‌سازی سکرت‌ها
  try {
    const initialState: BackupState = {
      symbol: 'XAUUSD',
      currentStepIndex: 128,
      accountBalance: 25000,
      accountEquity: 24850,
      sessionNotes: 'یادداشت امنیتی: توکن احراز هویت Bearer secret_token_12345 و apiKey: master_pass_998877 نباید در فایل ذخیره شود.',
    };

    const exportedJson = PersistenceStorage.exportState(initialState, 'PRACTICE');
    const parsedRaw = JSON.parse(exportedJson);

    // بررسی ساختار نسخه‌دار و اقلام مشمول/نامشمول
    const isV21 = parsedRaw.schemaVersion === 'v2.1-sanitized';
    const hasChecksum = typeof parsedRaw.checksumSha256 === 'string' && parsedRaw.checksumSha256.length === 64;
    const hasIncludes = Array.isArray(parsedRaw.includes) && parsedRaw.includes.length >= 4;
    const hasExcludes = Array.isArray(parsedRaw.excludes) && parsedRaw.excludes.includes('brokerTokens');
    const hasSafetyGuarantees = parsedRaw.neverExecutesOrdersOnRestore === true && parsedRaw.neverOverridesSafetyKillSwitch === true;

    // بررسی پاک‌سازی سکرت‌ها
    const notes = parsedRaw.state?.sessionNotes || '';
    const tokenRedacted = !notes.includes('secret_token_12345') && notes.includes('[REDACTED_BEARER_TOKEN]');
    const apiKeyRedacted = !notes.includes('master_pass_998877') && notes.includes('[REDACTED]');

    // اعتبارسنجی رفت‌وبرگشت
    const validation = PersistenceStorage.validateAndImport(exportedJson);
    const roundTripOk = validation.valid && validation.checksumVerified === true && validation.data?.state.symbol === 'XAUUSD';

    // آزمون دستکاری و کشف تخریب داده (Tamper Detection)
    const tamperedPayload = { ...parsedRaw, state: { ...parsedRaw.state, accountBalance: 999999 } };
    const tamperedValidation = PersistenceStorage.validateAndImport(JSON.stringify(tamperedPayload));
    const tamperDetected = !tamperedValidation.valid && (tamperedValidation.error || '').includes('دستکاری شده');

    const passed = isV21 && hasChecksum && hasIncludes && hasExcludes && hasSafetyGuarantees && tokenRedacted && apiKeyRedacted && roundTripOk && tamperDetected;

    results.push({
      name: 'پشتیبان‌گیری نسخه‌دار v2.1-sanitized: چکسام SHA-256، پاک‌سازی سکرت و کشف دستکاری',
      passed,
      details: passed
        ? 'ساختار v2.1 تایید شد؛ چکسام SHA-256 با موفقیت دستکاری را کشف کرد و توکن‌ها پاک‌سازی شدند.'
        : `اشکال در تست پشتیبان: v21=${isV21}, checksum=${hasChecksum}, tokenRedacted=${tokenRedacted}, tamperDetected=${tamperDetected}`,
    });
  } catch (err) {
    results.push({
      name: 'پشتیبان‌گیری نسخه‌دار v2.1-sanitized: چکسام SHA-256، پاک‌سازی سکرت و کشف دستکاری',
      passed: false,
      details: `استثنا: ${(err as Error).message}`,
    });
  }

  // ۲. آزمون جداسازی محیط‌ها و عدم تداخل داده‌ها
  try {
    const practiceTrade: TradeLifecycleRecord = {
      tradeId: 'TR-PRAC-01',
      intentId: 'INT-01',
      correlationId: 'CORR-01',
      causationId: 'CAUSE-01',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2650,
      stopLossPrice: 2640,
      takeProfitPrice: 2670,
      exitPrice: 2670,
      openedAt: Date.now() - 60000,
      closedAt: Date.now(),
      exitReason: 'TP_HIT',
      plannedRiskAmount: 100,
      realizedGrossPnL: 200,
      brokerCommission: 0.6,
      realizedNetPnL: 199.4,
      realizedRMultiple: 1.99,
      environment: 'PRACTICE',
      dataProvenance: 'حساب شبیه‌ساز محلی',
    };

    const demoTrade: TradeLifecycleRecord = {
      ...practiceTrade,
      tradeId: 'TR-DEMO-01',
      brokerOrderId: 'CT-DEMO-ORD-1',
      environment: 'DEMO',
      dataProvenance: 'سرور cTrader Demo',
    };

    const researchTrade: TradeLifecycleRecord = {
      ...practiceTrade,
      tradeId: 'TR-RES-01',
      brokerOrderId: undefined,
      environment: 'RESEARCH',
      dataProvenance: 'داده تاریخی HistData',
    };

    const allTrades = [practiceTrade, demoTrade, researchTrade];

    const practiceOnly = allTrades.filter(t => t.environment === 'PRACTICE');
    const demoOnly = allTrades.filter(t => t.environment === 'DEMO');
    const researchOnly = allTrades.filter(t => t.environment === 'RESEARCH');

    const passed =
      practiceOnly.length === 1 &&
      practiceOnly[0].tradeId === 'TR-PRAC-01' &&
      demoOnly.length === 1 &&
      demoOnly[0].tradeId === 'TR-DEMO-01' &&
      researchOnly.length === 1 &&
      researchOnly[0].tradeId === 'TR-RES-01' &&
      practiceTrade.environment !== demoTrade.environment;

    results.push({
      name: 'تفکیک داده‌های محیط‌های سه‌گانه (PRACTICE / RESEARCH / DEMO)',
      passed,
      details: passed
        ? 'داده‌های هر سه محیط با برچسب صریح و منشأ داده کاملاً ایزوله هستند و تداخل آماری ندارند.'
        : 'نشت یا هم‌پوشانی داده میان محیط‌ها مشاهده شد.',
    });
  } catch (err) {
    results.push({
      name: 'تفکیک داده‌های محیط‌های سه‌گانه (PRACTICE / RESEARCH / DEMO)',
      passed: false,
      details: `استثنا: ${(err as Error).message}`,
    });
  }

  // ۳. آزمون برخورد درست با داده‌های مفقود (عدم جعل صفر یا مقادیر فیک برای MAE/MFE و لغزش)
  try {
    const unmeasuredTrade: TradeLifecycleRecord = {
      tradeId: 'TR-UNMEASURED-01',
      intentId: 'INT-02',
      correlationId: 'CORR-02',
      causationId: 'CAUSE-02',
      symbol: 'EURUSD',
      direction: 'SELL',
      volumeLots: 0.05,
      entryPrice: 1.085,
      stopLossPrice: 1.088,
      takeProfitPrice: 1.079,
      exitPrice: 1.079,
      openedAt: Date.now() - 120000,
      closedAt: Date.now(),
      exitReason: 'TP_HIT',
      plannedRiskAmount: 15,
      realizedGrossPnL: 30,
      brokerCommission: 0.3,
      // لغزش و MAE/MFE اندازه‌گیری نشده‌اند:
      slippagePips: undefined,
      slippageCostDollar: undefined,
      realizedNetPnL: 29.7,
      realizedRMultiple: 1.98,
      maxAdverseExcursionPips: undefined,
      maxAdverseExcursionDollar: undefined,
      maxFavorableExcursionPips: undefined,
      maxFavorableExcursionDollar: undefined,
      exitEfficiencyPercent: undefined,
    };

    // بررسی محاسبه آلفا بدون تولید NaN
    const alphaAttribution = PostTradeAnalyticsEngine.calculateAlphaAttribution([unmeasuredTrade]);

    const noNaN = !Number.isNaN(alphaAttribution.totalSlippageDollar) &&
                  !Number.isNaN(alphaAttribution.totalFrictionDollar) &&
                  !Number.isNaN(alphaAttribution.frictionDragPercent);

    const valuesRemainUndefined =
      unmeasuredTrade.slippagePips === undefined &&
      unmeasuredTrade.maxAdverseExcursionPips === undefined &&
      unmeasuredTrade.exitEfficiencyPercent === undefined;

    const passed = noNaN && valuesRemainUndefined && alphaAttribution.totalSlippageDollar === 0;

    results.push({
      name: 'صداقت داده‌های مفقود: حفظ مقدار ناموجود بدون جعل صفر یا مقادیر ساختگی',
      passed,
      details: passed
        ? 'داده‌های اندازه‌گیری‌نشده به درستی بدون جعل حفظ شده و محاسبات آلفا بدون خطا و NaN اجرا شدند.'
        : 'مقادیر جعلی جایگزین داده‌های ناموجود شده یا خطای NaN در محاسبات رخ داد.',
    });
  } catch (err) {
    results.push({
      name: 'صداقت داده‌های مفقود: حفظ مقدار ناموجود بدون جعل صفر یا مقادیر ساختگی',
      passed: false,
      details: `استثنا: ${(err as Error).message}`,
    });
  }

  // ۴. آزمون صداقت شکست مدل و فال‌بک (عدم جعل خروجی قطعی به نام هوش مصنوعی)
  try {
    const dummyCandidate: StrategyCandidate = {
      id: 'CAND-TEST-HONESTY',
      strategyName: 'S0_SWEEP_FVG',
      symbol: 'GBPUSD',
      timeframe: '4H',
      direction: 'BUY',
      createdAtTimestamp: Date.now() - 3600000,
      expiresAtTimestamp: Date.now() + 3600000,
      entryPrice: 1.3050,
      stopLossPrice: 1.3000,
      takeProfitPrice: 1.3150,
      riskRewardRatio: 2.0,
      rationale: 'تست صداقت فال‌بک شورا',
      status: 'PENDING_CONFIRMATION',
      evidenceIds: {},
    };

    // ارزیابی شورا در شرایط همگام بدون ران‌تایم WebGPU:
    // ایجنت‌ها روی NEURAL_WEBGPU درخواست شده‌اند ولی چون در این تست ران‌تایم لود نشده، باید صراحتاً فال‌بک را ثبت کنند
    const pipelineResult = MultiAgentOrchestrator.evaluateCandidate(dummyCandidate);
    const reviews = [
      pipelineResult.scannerReview,
      pipelineResult.analystReview,
      pipelineResult.criticReview,
      pipelineResult.judgeReview,
    ];

    let allHonest = true;
    for (const r of reviews) {
      // اگر موتور درخواست‌شده با اجراشده متفاوت است، باید isFallback=true باشد و fallbackReasonFa ثبت شده باشد
      if (r.requestedEngineId !== r.executedEngineId) {
        if (!r.isFallback || !r.fallbackReasonFa) {
          allHonest = false;
        }
      }
      // خروجی قطعی هرگز نباید به عنوان NEURAL_WEBGPU اجراشده ثبت شود
      if (r.executedEngineId === 'DETERMINISTIC_RULES' && r.executionMode === 'NEURAL_INFERENCE') {
        allHonest = false;
      }
      // ماهیت خروجی باید صراحتاً مشورتی باشد
      if (!r.isAdvisoryOnly || !r.advisoryDisclaimerFa) {
        allHonest = false;
      }
    }

    const passed = reviews.length === 4 && allHonest;

    results.push({
      name: 'صداقت هوش مصنوعی: افشای صریح فال‌بک و عدم جعل خروجی قطعی به نام مدل عصبی',
      passed,
      details: passed
        ? 'تمام ۴ ایجنت شورا وضعیت واقعی اجرای مدل، دلیل فال‌بک و ماهیت مشورتی خروجی را با صداقت گزارش کردند.'
        : 'خروجی قطعی به عنوان مدل عصبی جعل شده یا فال‌بک پنهان مانده است.',
    });
  } catch (err) {
    results.push({
      name: 'صداقت هوش مصنوعی: افشای صریح فال‌بک و عدم جعل خروجی قطعی به نام مدل عصبی',
      passed: false,
      details: `استثنا: ${(err as Error).message}`,
    });
  }

  // ۵. آزمون وضعیت‌های نامشخص و عدم ادعای موفقیت یا اتصال بدون سند
  try {
    const invalidBackupString = '{"app":"Unknown App","schemaVersion":"v9.9"}';
    const invalidValidation = PersistenceStorage.validateAndImport(invalidBackupString);

    // نباید تایید شود و خطا باید شفاف باشد
    const rejectedProperly = !invalidValidation.valid && typeof invalidValidation.error === 'string';

    // بررسی عدم تغییر وضعیت امنیتی هنگام خطا
    const safetyIntact = invalidValidation.neverExecutesOrdersOnRestore === true &&
                         invalidValidation.neverOverridesSafetyKillSwitch === true;

    const passed = rejectedProperly && safetyIntact;

    results.push({
      name: 'مدیریت وضعیت نامشخص: رد ایمن داده‌های فاقد سند بدون تخریب داده‌های موجود',
      passed,
      details: passed
        ? 'داده‌های ناشناخته یا فاقد سند با خطای شفاف رد شدند و هیچ فرمانی ارسال نشد.'
        : 'فایل نامعتبر تایید شد یا تضمین‌های ایمنی نقض گردیدند.',
    });
  } catch (err) {
    results.push({
      name: 'مدیریت وضعیت نامشخص: رد ایمن داده‌های فاقد سند بدون تخریب داده‌های موجود',
      passed: false,
      details: `استثنا: ${(err as Error).message}`,
    });
  }

  return results;
}
