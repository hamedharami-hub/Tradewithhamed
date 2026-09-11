// lib/core/__tests__/w4-acceptance.test.ts
// آزمون‌های جامع پذیرش بسته W4 (Gate W4 Acceptance Tests)
// ارزیابی قطعی محافظ ریسک، سقف زیان روزانه، خنک‌سازی، اسپرد، سربه‌سر و کلید قطع اضطراری

import { RiskGuardianEngine } from '../risk-guardian-engine';
import { PortfolioLedgerState, OrderIntentPayload, PositionLedgerEntry } from '../ports';

export interface W4AcceptanceTestResult {
  id: string;
  nameFa: string;
  nameEn: string;
  passed: boolean;
  details: string;
  category: 'DAILY_LOSS' | 'COOLDOWN' | 'PORTFOLIO_LIMITS' | 'RISK_PER_TRADE' | 'CIRCUIT_BREAKER' | 'BREAKEVEN' | 'KILL_SWITCH';
}

export async function runW4AcceptanceSuite(): Promise<W4AcceptanceTestResult[]> {
  const results: W4AcceptanceTestResult[] = [];

  const createDummyLedger = (openPositions: number = 0, equity: number = 10000): PortfolioLedgerState => {
    const positions: PositionLedgerEntry[] = [];
    for (let i = 0; i < openPositions; i++) {
      positions.push({
        positionId: `POS-DUMMY-${i + 1}`,
        intentId: `INT-${i + 1}`,
        environment: 'PAPER_LIVE',
        symbol: 'XAUUSD',
        direction: 'BUY',
        volumeLots: 0.1,
        entryPrice: 2650.0,
        currentPrice: 2652.0,
        stopLossPrice: 2640.0,
        takeProfitPrice: 2670.0,
        unrealizedPnl: 20.0,
        realizedPnl: 0,
        commissionPaid: 0.6,
        financingSwap: 0,
        isOpen: true,
        openedTimestamp: Date.now() - 10000,
        maePips: 0,
        mfePips: 2,
      });
    }

    return {
      environment: 'PAPER_LIVE',
      accountNamespace: 'TEST_ACCOUNT',
      initialCash: 10000,
      cashBalance: equity,
      equity,
      usedMargin: openPositions * 200,
      freeMargin: equity - (openPositions * 200),
      marginLevelPercent: 500,
      totalRealizedPnl: 0,
      totalUnrealizedPnl: openPositions * 20,
      totalCommissions: openPositions * 0.6,
      totalSwap: 0,
      positions,
      peakEquity: 10000,
      maxDrawdownAmount: 0,
      maxDrawdownPercent: 0,
    };
  };

  const createStandardIntent = (overrides?: Partial<OrderIntentPayload>): OrderIntentPayload => ({
    intentId: 'INT-W4-TEST-01',
    environment: 'PAPER_LIVE',
    accountNamespace: 'TEST_ACCOUNT',
    candidateId: 'CND-W4-01',
    symbol: 'XAUUSD',
    orderType: 'LIMIT',
    direction: 'BUY',
    volumeLots: 0.1, // ریسک: ۱۰ دلار * ۰.۱ * ۱۰۰ = ۱۰۰ دلار (۱٪ از ۱۰,۰۰۰ دلار)
    entryPrice: 2650.0,
    stopLossPrice: 2640.0,
    takeProfitPrice: 2670.0, // 2R ریوارد
    reasonCode: 'W4_TEST',
    createdTimestamp: Date.UTC(2026, 8, 1, 10, 0, 0, 0),
    idempotencyKey: `KEY-W4-${Date.now()}`,
    ...overrides,
  });

  // تست ۱: سقف زیان روزانه (Daily Loss Cap)
  try {
    const guardian = new RiskGuardianEngine({ maxDailyLossAmount: 300 }, {}, 10000);
    const ledger = createDummyLedger(0, 9700);

    // ثبت دو معامله زیان‌ده متوالی با مجموع زیان ۳۱۰ دلار
    guardian.recordClosedTrade(-150);
    guardian.recordClosedTrade(-160);

    const evaluation = guardian.evaluateOrderRisk(createStandardIntent(), ledger);
    const passed =
      !evaluation.isApproved &&
      evaluation.rejectReasonCode === 'DAILY_LOSS_LIMIT_EXCEEDED';

    results.push({
      id: 'W4-01',
      nameFa: 'سقف زیان روزانه و توقف اضطراری معاملات (Daily Loss Limit)',
      nameEn: 'Daily Loss Limit Circuit Breaker',
      passed,
      details: passed
        ? `سفارش پس از زیان روزانه ۳۱۰ دلار با کد DAILY_LOSS_LIMIT_EXCEEDED مسدود شد.`
        : `خطا در اجرای سقف زیان روزانه: ${evaluation.messageFa}`,
      category: 'DAILY_LOSS',
    });
  } catch (e) {
    results.push({
      id: 'W4-01',
      nameFa: 'سقف زیان روزانه و توقف اضطراری معاملات (Daily Loss Limit)',
      nameEn: 'Daily Loss Limit Circuit Breaker',
      passed: false,
      details: (e as Error).message,
      category: 'DAILY_LOSS',
    });
  }

  // تست ۲: خنک‌سازی پس از ۳ زیان متوالی (Consecutive Losses Cooldown)
  try {
    const guardian = new RiskGuardianEngine({ consecutiveLossesLimit: 3, cooldownPeriodMinutes: 60 }, {}, 10000);
    const ledger = createDummyLedger(0, 9900);
    const now = Date.now();

    guardian.recordClosedTrade(-20, now);
    guardian.recordClosedTrade(-20, now);
    guardian.recordClosedTrade(-20, now); // ۳ زیان متوالی

    const evaluation = guardian.evaluateOrderRisk(createStandardIntent({ createdTimestamp: now + 5000 }), ledger);
    const passed =
      !evaluation.isApproved &&
      evaluation.rejectReasonCode === 'CONSECUTIVE_LOSS_COOLDOWN';

    results.push({
      id: 'W4-02',
      nameFa: 'قفل خنک‌سازی پس از زیان‌های متوالی (Consecutive Losses Cooldown)',
      nameEn: 'Consecutive Losses Cooldown Guard',
      passed,
      details: passed
        ? `سیستم پس از ۳ زیان متوالی به مدت ۶۰ دقیقه معامله را با کد CONSECUTIVE_LOSS_COOLDOWN قفل کرد.`
        : `عدم فعال‌سازی خنک‌سازی: ${evaluation.messageFa}`,
      category: 'COOLDOWN',
    });
  } catch (e) {
    results.push({
      id: 'W4-02',
      nameFa: 'قفل خنک‌سازی پس از زیان‌های متوالی (Consecutive Losses Cooldown)',
      nameEn: 'Consecutive Losses Cooldown Guard',
      passed: false,
      details: (e as Error).message,
      category: 'COOLDOWN',
    });
  }

  // تست ۳: سقف تعداد پوزیشن‌های هم‌زمان باز (Max Concurrent Positions)
  try {
    const guardian = new RiskGuardianEngine({ maxOpenPositions: 2 }, {}, 10000);
    const ledgerWith2Positions = createDummyLedger(2, 10000);

    const evaluation = guardian.evaluateOrderRisk(createStandardIntent(), ledgerWith2Positions);
    const passed =
      !evaluation.isApproved &&
      evaluation.rejectReasonCode === 'MAX_CONCURRENT_POSITIONS_REACHED';

    results.push({
      id: 'W4-03',
      nameFa: 'سقف تعداد معاملات هم‌زمان باز (Max Concurrent Positions)',
      nameEn: 'Maximum Concurrent Positions Constraint',
      passed,
      details: passed
        ? `سفارش جدید به درستی به دلیل پر بودن سقف ۲ پوزیشن باز، با کد MAX_CONCURRENT_POSITIONS_REACHED رد شد.`
        : `خطا در سقف پوزیشن‌های باز: ${evaluation.messageFa}`,
      category: 'PORTFOLIO_LIMITS',
    });
  } catch (e) {
    results.push({
      id: 'W4-03',
      nameFa: 'سقف تعداد معاملات هم‌زمان باز (Max Concurrent Positions)',
      nameEn: 'Maximum Concurrent Positions Constraint',
      passed: false,
      details: (e as Error).message,
      category: 'PORTFOLIO_LIMITS',
    });
  }

  // تست ۴: ممیزی سقف ریسک ۱ درصدی هر معامله (Max Risk Per Trade)
  try {
    const guardian = new RiskGuardianEngine({ maxRiskPerTradeAmount: 100, maxRiskPerTradePercent: 1.0 }, {}, 10000);
    const ledger = createDummyLedger(0, 10000);

    // سفارش با ریسک گزاف: ۰.۵ لات طلا با فاصله SL ۱۰ دلار = ۵۰۰ دلار ریسک (۵٪ حساب)
    const dangerousIntent = createStandardIntent({
      volumeLots: 0.5,
      entryPrice: 2650.0,
      stopLossPrice: 2640.0,
    });

    const evaluation = guardian.evaluateOrderRisk(dangerousIntent, ledger);
    const passed =
      !evaluation.isApproved &&
      evaluation.rejectReasonCode === 'MAX_RISK_PER_TRADE_EXCEEDED' &&
      evaluation.maxAllowedVolumeLots === 0.1; // حداکثر ۰.۱ لات مجاز برای ۱۰۰ دلار ریسک

    results.push({
      id: 'W4-04',
      nameFa: 'ممیزی سخت‌گیرانه سقف ریسک ۱ درصدی هر معامله (Pre-Trade Sizing)',
      nameEn: 'Pre-Trade Risk-Per-Trade & Sizing Guard',
      passed,
      details: passed
        ? `ریسک ۵۰۰ دلاری سفارش رد صلاحیت شد و حجم امن 0.10 لات پیشنهاد گردید.`
        : `خطا در کنترل ریسک تک‌معامله: ${evaluation.messageFa}`,
      category: 'RISK_PER_TRADE',
    });
  } catch (e) {
    results.push({
      id: 'W4-04',
      nameFa: 'ممیزی سخت‌گیرانه سقف ریسک ۱ درصدی هر معامله (Pre-Trade Sizing)',
      nameEn: 'Pre-Trade Risk-Per-Trade & Sizing Guard',
      passed: false,
      details: (e as Error).message,
      category: 'RISK_PER_TRADE',
    });
  }

  // تست ۵: کلید قطع اسپرد غیرعادی (Spread Spike Circuit Breaker)
  try {
    const guardian = new RiskGuardianEngine({}, { maxSpreadPips: { XAUUSD: 3.5, EURUSD: 2.5, GBPUSD: 3.0, USDJPY: 2.5, BTCUSD: 100 } }, 10000);
    const ledger = createDummyLedger(0, 10000);

    // اسپرد ۵.۰ پیپ در طلا (0.50 دلار اختلاف بین Bid و Ask)
    const marketWithSpike = {
      bid: 2650.0,
      ask: 2650.5,
      timestamp: Date.now(),
    };

    const evaluation = guardian.evaluateOrderRisk(createStandardIntent(), ledger, marketWithSpike);
    const passed =
      !evaluation.isApproved &&
      evaluation.rejectReasonCode === 'SPREAD_CIRCUIT_BREAKER_TRIGGERED';

    results.push({
      id: 'W4-05',
      nameFa: 'کلید قطع خودکار در اسپرد غیرعادی و زمان اخبار (Spread Spike)',
      nameEn: 'Spread Spike Circuit Breaker',
      passed,
      details: passed
        ? `سفارش در اسپرد ۵ پیپ به دلیل فعال شدن کلید قطع خودکار متوقف شد.`
        : `خطا در کلید قطع اسپرد: ${evaluation.messageFa}`,
      category: 'CIRCUIT_BREAKER',
    });
  } catch (e) {
    results.push({
      id: 'W4-05',
      nameFa: 'کلید قطع خودکار در اسپرد غیرعادی و زمان اخبار (Spread Spike)',
      nameEn: 'Spread Spike Circuit Breaker',
      passed: false,
      details: (e as Error).message,
      category: 'CIRCUIT_BREAKER',
    });
  }

  // تست ۶: انتقال خودکار حد ضرر به نقطه سربه‌سر در سود ۱.۵R (Dynamic Breakeven Migration)
  try {
    const guardian = new RiskGuardianEngine();
    const position: PositionLedgerEntry = {
      positionId: 'POS-TEST-BE',
      intentId: 'INT-BE',
      environment: 'PAPER_LIVE',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2650.0,
      stopLossPrice: 2640.0, // ریسک ۱۰ دلار
      takeProfitPrice: 2670.0,
      currentPrice: 2665.5, // سود ۱۵.۵ دلار = بیش از ۱.۵R
      unrealizedPnl: 155.0,
      realizedPnl: 0,
      commissionPaid: 0.6,
      financingSwap: 0,
      isOpen: true,
      openedTimestamp: Date.now() - 50000,
      maePips: 0,
      mfePips: 15.5,
    };

    const quotes = {
      XAUUSD: { bid: 2665.5, ask: 2665.65 },
      EURUSD: { bid: 1.0850, ask: 1.0851 },
      GBPUSD: { bid: 1.2700, ask: 1.2702 },
      USDJPY: { bid: 145.00, ask: 145.02 },
      BTCUSD: { bid: 60000, ask: 60025 },
    };

    const events = guardian.applyProtectionsToPositions([position], quotes);
    const passed =
      events.length === 1 &&
      events[0].eventType === 'BREAKEVEN_MIGRATION' &&
      position.stopLossPrice === 2650.1; // نقطه ورود + ۱ پیپ (۰.۱ دلار بافر)

    results.push({
      id: 'W4-06',
      nameFa: 'انتقال خودکار حد ضرر به نقطه سربه‌سر در ۱.۵R (Dynamic Breakeven)',
      nameEn: 'Dynamic Breakeven Migration with Fee Buffer',
      passed,
      details: passed
        ? `حد ضرر پس از دستیابی به ۱.۵۵R سود، به صورت خودکار به نقطه ۲۶۵۰.۱۰ (سربه‌سر + بافر کارمزد) منتقل شد.`
        : `انتقال به سربه‌سر انجام نشد: رویدادها=${events.length}`,
      category: 'BREAKEVEN',
    });
  } catch (e) {
    results.push({
      id: 'W4-06',
      nameFa: 'انتقال خودکار حد ضرر به نقطه سربه‌سر در ۱.۵R (Dynamic Breakeven)',
      nameEn: 'Dynamic Breakeven Migration with Fee Buffer',
      passed: false,
      details: (e as Error).message,
      category: 'BREAKEVEN',
    });
  }

  // تست ۷: کلید قطع اضطراری سراسری (Emergency Kill Switch)
  try {
    const guardian = new RiskGuardianEngine({}, {}, 10000);
    const ledger = createDummyLedger(0, 10000);

    guardian.triggerEmergencyKillSwitch('هشدار ناهنجاری سیستمی توسط کاربر حامد');

    const evalWhileActive = guardian.evaluateOrderRisk(createStandardIntent(), ledger);
    const isBlocked = !evalWhileActive.isApproved && evalWhileActive.rejectReasonCode === 'KILL_SWITCH_ACTIVE';

    guardian.resetEmergencyKillSwitch();
    const evalAfterReset = guardian.evaluateOrderRisk(createStandardIntent(), ledger);
    const isUnblocked = evalAfterReset.isApproved;

    const passed = isBlocked && isUnblocked;

    results.push({
      id: 'W4-07',
      nameFa: 'کلید قطع اضطراری و انجماد معاملات (Emergency Kill Switch)',
      nameEn: 'Emergency Kill-Switch & Total Protection Lock',
      passed,
      details: passed
        ? `کلید قطع اضطراری با موفقیت کلیه سفارشات را مسدود کرد و پس از لغو دستی، سیستم مجاز شد.`
        : 'خطا در آزمون کلید قطع اضطراری',
      category: 'KILL_SWITCH',
    });
  } catch (e) {
    results.push({
      id: 'W4-07',
      nameFa: 'کلید قطع اضطراری و انجماد معاملات (Emergency Kill Switch)',
      nameEn: 'Emergency Kill-Switch & Total Protection Lock',
      passed: false,
      details: (e as Error).message,
      category: 'KILL_SWITCH',
    });
  }

  return results;
}
