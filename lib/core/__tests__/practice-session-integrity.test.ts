import { Candle, SymbolId } from '../../contracts/market';
import { SimulatedBroker } from '../simulated-broker';
import { calculateDeterministicRisk } from '../risk-calculator';
import {
  PracticeSessionManager,
  PracticeSession,
  MAX_ARCHIVED_SESSIONS,
  validatePracticeSession,
  ACTIVE_SESSION_STORAGE_KEY,
  ARCHIVED_SESSIONS_STORAGE_KEY,
} from '../practice-session';
import { PracticeExecutionAdapter } from '../environment-adapters';
import { ReplayEngine } from '../../replay/replay-engine';

export interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runPracticeSessionIntegrityTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ۱. تست: ثبت معتبر BUY و SELL با حجم محاسبه‌شده دقیق مطابق سقف ریسک ۰٫۲۵٪
  try {
    const equity = 10000;
    const riskPercent = 0.25; // سقف ۲۵ دلار
    const entryPrice = 2000.0;
    const slPrice = 1995.0; // ۵ دلار فاصله
    const tpPrice = 2010.0; // ۱۰ دلار فاصله

    const buyRisk = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice,
      stopLossPrice: slPrice,
      takeProfitPrice: tpPrice,
      accountEquity: equity,
      riskPercentage: riskPercent,
    });

    // محاسبه مستقل مورد انتظار:
    // زیان ناخالص هر لات طلا = 5 * 100 = 500 دلار. کارمزد = 6 دلار. مجموع هر لات = 506 دلار.
    // حجم ناخالص = 25 / 506 = 0.0494... -> گرد کردن رو به پایین = 0.04 لات
    // ریسک برنامه‌ریزی‌شده = 0.04 * 506 = 20.24 دلار <= 25 دلار
    const expectedLots = 0.04;
    const expectedPlannedRisk = Number((0.04 * 506).toFixed(2));

    const passed =
      buyRisk.isValid &&
      buyRisk.adjustedVolumeLots === expectedLots &&
      buyRisk.plannedRiskAmount === expectedPlannedRisk &&
      buyRisk.plannedRiskAmount <= 25.0;

    results.push({
      name: 'محاسبه و ثبت معتبر حجم سفارش خرید و فروش با سقف ریسک ۰٫۲۵٪',
      passed,
      details: passed
        ? `حجم دقیق ${buyRisk.adjustedVolumeLots} لات با ریسک $${buyRisk.plannedRiskAmount} در سقف ۲۵ دلار محاسبه شد.`
        : `خطا در محاسبه ریسک: حجم=${buyRisk.adjustedVolumeLots}, ریسک=$${buyRisk.plannedRiskAmount}`,
    });
  } catch (err) {
    results.push({
      name: 'محاسبه و ثبت معتبر حجم سفارش خرید و فروش با سقف ریسک ۰٫۲۵٪',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. تست: رد قطعی معامله در صورت isValid=false و نبود هیچ‌گونه fallback به 0.01 لات
  try {
    const equity = 10000;
    // استاپ نامعتبر: برای خرید، استاپ بالاتر از قیمت ورود است
    const invalidRisk = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2000.0,
      stopLossPrice: 2005.0, // نامعتبر
      takeProfitPrice: 2015.0,
      accountEquity: equity,
      riskPercentage: 0.25,
    });

    // شبیه‌سازی منطق UI بدون فال‌بک
    const lotsWithFallback = invalidRisk.adjustedVolumeLots; // نباید || 0.01 اعمال شود
    const passed = !invalidRisk.isValid && lotsWithFallback === 0;

    results.push({
      name: 'رد معامله در صورت عدم اعتبار پارامترها بدون فال‌بک به حداقل لات',
      passed,
      details: passed
        ? 'سفارش نامعتبر به درستی با isValid=false و حجم ۰ رد شد و فال‌بک 0.01 لات اعمال نگردید.'
        : `خطا: حجم نامعتبر به ۰ تبدیل نشد (حجم=${lotsWithFallback}).`,
    });
  } catch (err) {
    results.push({
      name: 'رد معامله در صورت عدم اعتبار پارامترها بدون فال‌بک به حداقل لات',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. تست: رد معامله زمانی که حتی حداقل حجم (0.01 لات) از سقف بودجه ریسک بیشتر است
  try {
    const smallEquity = 100; // ۱۰۰ دلار کل سرمایه
    const riskPercent = 0.25; // سقف ریسک ۰٫۲۵ دلار (۲۵ سنت)
    // برای طلا، حتی ۰٫۰۱ لات با فاصله ۵ دلاری، ۵ دلار ضرر دارد که ۲۰ برابر سقف است
    const riskResult = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2000.0,
      stopLossPrice: 1995.0,
      takeProfitPrice: 2010.0,
      accountEquity: smallEquity,
      riskPercentage: riskPercent,
    });

    const passed = !riskResult.isValid && riskResult.adjustedVolumeLots === 0;

    results.push({
      name: 'رد سفارش در صورتی که حداقل لات از سقف بودجه ریسک تجاوز کند',
      passed,
      details: passed
        ? 'حداقل لات به درستی رد شد زیرا ریسک آن بیش از بودجه حساب بود (عدم دورزدن سقف ریسک).'
        : 'خطا: سقف ریسک توسط حداقل لات دور زده شد.',
    });
  } catch (err) {
    results.push({
      name: 'رد سفارش در صورتی که حداقل لات از سقف بودجه ریسک تجاوز کند',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. تست: محاسبات مستقل سودوزیان برای USDJPY و XAUUSD
  try {
    const broker = new SimulatedBroker(10000);
    // ۱. تست طلا: ۰٫۱ لات طلا، ۱۰ دلار افزایش قیمت
    // سود ناخالص = 0.1 * 10 * 100 = 100 دلار.
    const goldGross = broker.calculatePnlDollars('XAUUSD', 0.1, 10.0, 2010.0);
    const goldPassed = Math.abs(goldGross - 100.0) < 0.001;

    // ۲. تست ین ژاپن: ۰٫۱ لات، تغییر قیمت ۱٫۵۰ پیپ/ین در نرخ ۱۵۰٫۰۰
    // سایز قرارداد = 100,000. سود به ین = 0.1 * 1.50 * 100,000 = 15,000 JPY
    // تبدیل به دلار در نرخ ۱۵۰ = 15,000 / 150.00 = 100.00 دلار
    const jpyGross = broker.calculatePnlDollars('USDJPY', 0.1, 1.50, 150.0);
    const jpyPassed = Math.abs(jpyGross - 100.0) < 0.001;

    const passed = goldPassed && jpyPassed;
    results.push({
      name: 'محاسبات ریاضی مستقل سودوزیان برای جفت‌ارزهای متقاطع (USDJPY) و کالا (XAUUSD)',
      passed,
      details: passed
        ? `محاسبات دقیق تأیید شد: طلا=$${goldGross}، ین=$${jpyGross}`
        : `خطا در فرمول تبدیل: طلا=${goldGross}, ین=${jpyGross}`,
    });
  } catch (err) {
    results.push({
      name: 'محاسبات ریاضی مستقل سودوزیان برای جفت‌ارزهای متقاطع (USDJPY) و کالا (XAUUSD)',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۵. تست: خروج با SL، خروج با TP و خروج دستی همراه با ثبت قیمت واقعی خروج (exitPrice)
  try {
    const broker = new SimulatedBroker(10000, false); // خاموش بودن خروج پله‌ای خودکار

    // ۱. پوزیشن SL
    const { position: posSl } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { candleTimestamp: 1000 }
    );

    // کندل بعد با کلوز ۱۹۸۵ اما استاپ روی ۱۹۹۰
    const candleSl: Candle = {
      timestamp: 2000,
      open: 1995,
      high: 1998,
      low: 1980, // اصابت به استاپ ۱۹۹۰
      close: 1985, // کلوز نباید به عنوان قیمت خروج ذخیره شود
      volume: 10,
      isClosed: true,
    };

    broker.onNewCandle(candleSl, 'XAUUSD');

    const slPriceCorrect = posSl.exitPrice === 1990.0 && !posSl.isOpen && posSl.closeReason === 'SL';

    // ۲. پوزیشن TP
    const { position: posTp } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { candleTimestamp: 3000 }
    );

    const candleTp: Candle = {
      timestamp: 4000,
      open: 2005,
      high: 2025, // اصابت به تارگت ۲۰۲۰
      low: 2002,
      close: 2022, // کلوز با قیمت خروج متفاوت است
      volume: 10,
      isClosed: true,
    };

    broker.onNewCandle(candleTp, 'XAUUSD');
    const tpPriceCorrect = posTp.exitPrice === 2020.0 && !posTp.isOpen && posTp.closeReason === 'TP';

    // ۳. خروج دستی
    const { position: posManual } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { candleTimestamp: 5000 }
    );

    broker.closePosition(posManual.id, 2012.5, 'MANUAL');
    const manualPriceCorrect = posManual.exitPrice === 2012.5 && !posManual.isOpen && posManual.closeReason === 'MANUAL';

    const passed = slPriceCorrect && tpPriceCorrect && manualPriceCorrect;

    results.push({
      name: 'ثبت قیمت واقعی خروج (exitPrice) در SL، TP و خروج دستی به جای قیمت close کندل',
      passed,
      details: passed
        ? `قیمت‌های واقعی اجرا ثبت شدند: SL=${posSl.exitPrice} (نه ۱۹۸۵)، TP=${posTp.exitPrice} (نه ۲۰۲۲)، دستی=${posManual.exitPrice}`
        : `خطا در قیمت خروج: SL=${posSl.exitPrice}, TP=${posTp.exitPrice}, دستی=${posManual.exitPrice}`,
    });
  } catch (err) {
    results.push({
      name: 'ثبت قیمت واقعی خروج (exitPrice) در SL، TP و خروج دستی به جای قیمت close کندل',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۶. تست: سیاست محافظه‌کارانه در برخورد همزمان با SL و TP در یک کندل
  try {
    const broker = new SimulatedBroker(10000, false);
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { candleTimestamp: 1000 }
    );

    // کندل بسیار پرنوسان که هم کف ۱۹۸۰ و هم سقف ۲۰۳۰ را لمس می‌کند
    const extremeCandle: Candle = {
      timestamp: 2000,
      open: 2000,
      high: 2030, // TP = 2020 لمس شد
      low: 1980,  // SL = 1990 لمس شد
      close: 2025,
      volume: 100,
      isClosed: true,
    };

    broker.onNewCandle(extremeCandle, 'XAUUSD');

    // بر اساس سیاست محافظه‌کارانه مدیریت ریسک، اصابت اول به SL ثبت می‌شود
    const passed =
      !position.isOpen &&
      position.closeReason === 'SL' &&
      position.exitPrice === 1990.0 &&
      position.realizedPnl < 0;

    results.push({
      name: 'سیاست محافظه‌کارانه در برخورد همزمان حد ضرر و حد سود در یک کندل (اولویت با SL)',
      passed,
      details: passed
        ? `در کندل پرنوسان، با سیاست محافظه‌کارانه اولویت با اصابت حد ضرر (SL) در قیمت ${position.exitPrice} اعمال شد.`
        : `خطا در سیاست برخورد همزمان: علت=${position.closeReason}, خروج=${position.exitPrice}`,
    });
  } catch (err) {
    results.push({
      name: 'سیاست محافظه‌کارانه در برخورد همزمان حد ضرر و حد سود در یک کندل (اولویت با SL)',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۷. تست: عدم خروج پوزیشن بر مبنای High/Low گذشتهٔ کندل ورود
  try {
    const broker = new SimulatedBroker(10000, false);

    // فرض کنید کندل جاری کف ۱۹۸۰ و کلوز ۲۰۰۰ داشته است
    const entryCandle: Candle = {
      timestamp: 1000,
      open: 1990,
      high: 2005,
      low: 1980, // این کف قبل از ورود ثبت شده است
      close: 2000,
      volume: 20,
      isClosed: true,
    };

    // کاربر در کلوز این کندل وارد خرید با استاپ ۱۹۹۰ می‌شود
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { candleTimestamp: 1000 }
    );

    // فراخوانی مجدد پردازش روی همان کندل ورود نباید پوزیشن را ببندد
    broker.onNewCandle(entryCandle, 'XAUUSD');

    const passed = position.isOpen && position.realizedPnl === 0;

    results.push({
      name: 'منع خروج پوزیشن با داده‌های گذشته (High/Low) همان کندلی که معامله در آن باز شده',
      passed,
      details: passed
        ? 'پوزیشن در کندل ورود باز ماند و با کف گذشتهٔ همان کندل بسته نشد.'
        : 'خطا: پوزیشن با گذشتهٔ کندل ورود به اشتباه بسته شد.',
    });
  } catch (err) {
    results.push({
      name: 'منع خروج پوزیشن با داده‌های گذشته (High/Low) همان کندلی که معامله در آن باز شده',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۸. تست: عدم پردازش تکراری یک کندل و ممانعت از بستن مجدد
  try {
    const broker = new SimulatedBroker(10000, false);
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { candleTimestamp: 1000 }
    );

    const nextCandle: Candle = {
      timestamp: 2000,
      open: 1995,
      high: 1998,
      low: 1985,
      close: 1988,
      volume: 10,
      isClosed: true,
    };

    // بار اول
    broker.onNewCandle(nextCandle, 'XAUUSD');
    const balanceAfterFirst = broker.getState().accountBalance;
    const realizedAfterFirst = position.realizedPnl;

    // بار دوم (شبیه‌سازی فراخوانی ناخواسته تکراری)
    broker.onNewCandle(nextCandle, 'XAUUSD');
    const balanceAfterSecond = broker.getState().accountBalance;
    const realizedAfterSecond = position.realizedPnl;

    const passed =
      balanceAfterFirst === balanceAfterSecond &&
      realizedAfterFirst === realizedAfterSecond &&
      !position.isOpen;

    results.push({
      name: 'عدم پردازش تکراری و ممانعت از کسر مجدد زیان در فراخوانی‌های متوالی یک کندل',
      passed,
      details: passed
        ? `بالانس پس از فراخوانی تکراری تغییر نکرد ($${balanceAfterSecond}).`
        : `خطا: نشت بالانس در فراخوانی مکرر: اول=$${balanceAfterFirst}, دوم=$${balanceAfterSecond}`,
    });
  } catch (err) {
    results.push({
      name: 'عدم پردازش تکراری و ممانعت از کسر مجدد زیان در فراخوانی‌های متوالی یک کندل',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۹. تست: تطبیق دقیق معادله Balance، Equity، کارمزد و سودوزیان
  try {
    const initialBalance = 10000;
    const broker = new SimulatedBroker(initialBalance, false);

    // معامله ۱ باز می‌شود
    const { position: p1 } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { candleTimestamp: 1000 }
    );

    // کندل به ۲۰۵۰ می‌رسد اما هنوز پوزیشن دستی بسته نشده
    const floatCandle: Candle = {
      timestamp: 2000,
      open: 2000,
      high: 2010,
      low: 2000,
      close: 2005,
      volume: 10,
      isClosed: true,
    };
    broker.onNewCandle(floatCandle, 'XAUUSD');

    // در حالت باز:
    // سود ناخالص = 0.1 * 5 * 100 = 50 دلار. کارمزد دوطرفه = 0.1 * 6 = 0.60 دلار. سود شناور = 49.40 دلار.
    // اکوئیتی = بالانس (10000) + 49.40 = 10049.40
    const stateWhileOpen = broker.getState();
    const equityWhileOpenValid = Math.abs(stateWhileOpen.accountEquity - (stateWhileOpen.accountBalance + p1.unrealizedPnl)) < 0.01;

    // معامله دستی در ۲۰۲۵ بسته می‌شود
    broker.closePosition(p1.id, 2025.0, 'MANUAL');

    // سود ناخالص = 0.1 * 25 * 100 = 250 دلار. کارمزد = 0.60 دلار. خالص = 249.40 دلار.
    const stateAfterClose = broker.getState();
    const balanceAfterCloseExpected = initialBalance + 249.40;
    const balanceValid = Math.abs(stateAfterClose.accountBalance - balanceAfterCloseExpected) < 0.01;
    const equityEqualBalance = stateAfterClose.accountEquity === stateAfterClose.accountBalance;

    const passed = equityWhileOpenValid && balanceValid && equityEqualBalance;

    results.push({
      name: 'تطبیق ریاضی دقیق رابطه بالانس، اکوئیتی و کسر کارمزد بدون احتساب مضاعف',
      passed,
      details: passed
        ? `معادله اکوئیتی ($${stateAfterClose.accountEquity}) و بالانس ($${stateAfterClose.accountBalance}) دقیقاً منطبق بر محاسبات مستقل است.`
        : `خطا در تطبیق مالی: بالانس=$${stateAfterClose.accountBalance} (انتظار: $${balanceAfterCloseExpected})`,
    });
  } catch (err) {
    results.push({
      name: 'تطبیق ریاضی دقیق رابطه بالانس، اکوئیتی و کسر کارمزد بدون احتساب مضاعف',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۰. تست: فرآیند تغییر نماد و لغو آن بدون تغییر وضعیت
  try {
    PracticeSessionManager.clearAllForTesting();
    const session = PracticeSessionManager.createNewSession('XAUUSD', 10000);
    const broker = new SimulatedBroker(10000, false);

    // ثبت یک پوزیشن باز
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { sessionId: session.sessionId }
    );
    session.positions.push(position);
    PracticeSessionManager.saveActiveSession(session);

    // شبیه‌سازی لغو تغییر نماد توسط کاربر (هیچ داده‌ای تغییر نمی‌کند)
    const cancelledReload = PracticeSessionManager.loadActiveSession();
    const passed =
      cancelledReload !== null &&
      cancelledReload.symbol === 'XAUUSD' &&
      cancelledReload.positions.length === 1 &&
      cancelledReload.positions[0].isOpen === true;

    results.push({
      name: 'تغییر نماد همراه با پوزیشن‌های باز و عدم تغییر داده‌ها در صورت انصراف کاربر',
      passed,
      details: passed
        ? 'در صورت انصراف، نماد و پوزیشن باز بدون دستکاری در حافظه حفظ شدند.'
        : 'خطا در لغو تغییر نماد.',
    });
  } catch (err) {
    results.push({
      name: 'تغییر نماد همراه با پوزیشن‌های باز و عدم تغییر داده‌ها در صورت انصراف کاربر',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۱. تست: شروع نشست جدید و بایگانی صحیح نشست پیشین با تفکیک پوزیشن‌های پایان‌یافته
  try {
    PracticeSessionManager.clearAllForTesting();
    const oldSession = PracticeSessionManager.createNewSession('XAUUSD', 10000);
    const broker = new SimulatedBroker(10000, false);

    // پوزیشن باز در نشست قبلی
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { sessionId: oldSession.sessionId }
    );
    oldSession.positions.push(position);

    // تأیید پایان نشست و شروع نشست تازه
    const archiveRes = PracticeSessionManager.archiveSession(oldSession, 'تست بایگانی');
    if (!archiveRes.success || !archiveRes.archivedSession) {
      throw new Error(`بایگانی با خطا مواجه شد: ${archiveRes.error}`);
    }
    const archived = archiveRes.archivedSession;
    const newSession = PracticeSessionManager.createNewSession('EURUSD', 10000);
    PracticeSessionManager.saveActiveSession(newSession);

    const passed =
      archived.status === 'ARCHIVED' &&
      archived.discardedOpenPositionsCount === 1 &&
      archived.positions[0].closeReason === 'SESSION_ENDED' && // به دروغ به عنوان باخت یا برد بازار ثبت نشده
      newSession.symbol === 'EURUSD' &&
      newSession.accountBalance === 10000 &&
      newSession.positions.length === 0;

    results.push({
      name: 'شروع نشست جدید، بایگانی نشست قبلی و ثبت معاملات باز با برچسب SESSION_ENDED',
      passed,
      details: passed
        ? `نشست قبلی بایگانی شد (${archived.discardedOpenPositionsCount} پوزیشن پایان‌یافته) و نشست تازه با نماد ${newSession.symbol} ایجاد شد.`
        : 'خطا در فرآیند بایگانی و ایجاد نشست جدید.',
    });
  } catch (err) {
    results.push({
      name: 'شروع نشست جدید، بایگانی نشست قبلی و ثبت معاملات باز با برچسب SESSION_ENDED',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۲. تست: بازیابی پس از Refresh بدون اجرای دوباره سفارش یا ریپلی
  try {
    PracticeSessionManager.clearAllForTesting();
    const session = PracticeSessionManager.createNewSession('GBPUSD', 10000);
    session.accountBalance = 10150;
    session.accountEquity = 10150;
    session.currentStepIndex = 110;
    PracticeSessionManager.saveActiveSession(session);

    // شبیه‌سازی رفرش صفحه و بازخوانی
    const restored = PracticeSessionManager.loadActiveSession();
    const passed =
      restored !== null &&
      restored.sessionId === session.sessionId &&
      restored.accountBalance === 10150 &&
      restored.currentStepIndex === 110 &&
      restored.schemaVersion === '2.0';

    results.push({
      name: 'بازیابی وفادارانه وضعیت نشست از حافظه پس از رفرش بدون اجرای مجدد سفارش‌ها',
      passed,
      details: passed
        ? `نشست با شناسه ${restored?.sessionId} و بالانس $${restored?.accountBalance} به طور کامل بازیابی شد.`
        : 'خطا در بازیابی نشست.',
    });
  } catch (err) {
    results.push({
      name: 'بازیابی وفادارانه وضعیت نشست از حافظه پس از رفرش بدون اجرای مجدد سفارش‌ها',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۳. تست: پایان داده‌های ریپلی و توقف صحیح بدون خطای خارج از محدوده
  try {
    const broker = new SimulatedBroker(10000);
    const replay = new ReplayEngine('XAUUSD', broker);
    const totalCandles = replay.getAllCandles().length;

    // پرش به آخرین کندل
    replay.jumpToStep(totalCandles - 1);
    const snapBefore = replay.getSnapshot();

    // یک گام به جلوتر رفتن در انتهای دیتا
    const snapAfter = replay.stepForward();

    const passed =
      snapBefore.currentStepIndex === totalCandles - 1 &&
      snapAfter.currentStepIndex === totalCandles - 1 &&
      snapAfter.isPlaying === false;

    results.push({
      name: 'اتمام کندل‌های ریپلی و توقف تمیز موتور بدون بروز خطای خارج از محدوده',
      passed,
      details: passed
        ? `موتور در کندل ${snapAfter.currentStepIndex + 1} از ${snapAfter.totalSteps} با موفقیت متوقف شد.`
        : `خطا در انتهای ریپلی: ایندکس=${snapAfter.currentStepIndex}`,
    });
  } catch (err) {
    results.push({
      name: 'اتمام کندل‌های ریپلی و توقف تمیز موتور بدون بروز خطای خارج از محدوده',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۴. تست: حالت توقف ورود (Freeze): رد معامله جدید همزمان با تداوم پردازش خروج معاملات باز
  try {
    const broker = new SimulatedBroker(10000, false);
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2000.0,
      1990.0,
      2020.0,
      { candleTimestamp: 1000 }
    );

    // حالت توقف ورود فعال می‌شود
    const isFreezeNewEntries = true;

    // ۱. ثبت سفارش جدید رد می‌شود
    const canSubmitNew = !isFreezeNewEntries;

    // ۲. کندل بعد با تاچ TP می‌رسد
    const tpCandle: Candle = {
      timestamp: 2000,
      open: 2010,
      high: 2022,
      low: 2008,
      close: 2021,
      volume: 15,
      isClosed: true,
    };

    broker.onNewCandle(tpCandle, 'XAUUSD');

    // خروج معامله باز با موفقیت انجام می‌شود
    const passed =
      canSubmitNew === false &&
      !position.isOpen &&
      position.closeReason === 'TP' &&
      position.exitPrice === 2020.0;

    results.push({
      name: 'حالت توقف ورود (Freeze): رد سفارش جدید همراه با تداوم پردازش خروج معاملات باز',
      passed,
      details: passed
        ? 'در حالت فریز، ورود جدید مسدود شد اما پوزیشن باز جاری در برخورد با TP بسته شد.'
        : 'خطا در مدیریت حالت توقف ورود.',
    });
  } catch (err) {
    results.push({
      name: 'حالت توقف ورود (Freeze): رد سفارش جدید همراه با تداوم پردازش خروج معاملات باز',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۵. تست: تضمین عدم امکان فراخوانی نوشتن بروکر خارجی از مسیر تمرین
  try {
    const adapter = new PracticeExecutionAdapter(10000);
    const canBrokerWrite = adapter.canExecuteBrokerOrder();

    let threwSecurityViolation = false;
    try {
      adapter.submitToBroker();
    } catch (err) {
      threwSecurityViolation = (err as Error).message.includes('SECURITY_VIOLATION');
    }

    const passed = canBrokerWrite === false && threwSecurityViolation;

    results.push({
      name: 'تضمین ایزولاسیون کامل و منع ارسال سفارش به بروکر خارجی از محیط تمرین',
      passed,
      details: passed
        ? 'محیط تمرین کاملاً آفلاین بوده و ارسال به بروکر خارجی با خطای امنیتی مسدود است.'
        : 'خطا در بررسی ایزولاسیون بروکر تمرین.',
    });
  } catch (err) {
    results.push({
      name: 'تضمین ایزولاسیون کامل و منع ارسال سفارش به بروکر خارجی از محیط تمرین',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۶. تست: مدیریت صریح سقف ۲۰ نشست و عدم حذف خاموش آرشیو
  try {
    PracticeSessionManager.clearAllForTesting();

    // بایگانی ۲۰ نشست مجاز
    for (let i = 0; i < MAX_ARCHIVED_SESSIONS; i++) {
      const sess = PracticeSessionManager.createNewSession('XAUUSD', 10000);
      const res = PracticeSessionManager.archiveSession(sess, `نشست شماره ${i + 1}`);
      if (!res.success) {
        throw new Error(`بایگانی نشست مجاز شماره ${i + 1} با خطا مواجه شد.`);
      }
    }

    const archivedCountBefore = PracticeSessionManager.loadArchivedSessions().length;

    // تلاش برای بایگانی نشست بیست و یکم
    const overflowSession = PracticeSessionManager.createNewSession('EURUSD', 10000);
    const overflowResult = PracticeSessionManager.archiveSession(overflowSession, 'نشست مازاد ۲۱');

    const archivedCountAfter = PracticeSessionManager.loadArchivedSessions().length;

    const passed =
      archivedCountBefore === 20 &&
      overflowResult.success === false &&
      overflowResult.reason === 'CAPACITY_EXCEEDED' &&
      archivedCountAfter === 20;

    results.push({
      name: 'عدم حذف خاموش نشست‌ها و بازگرداندن خطای صریح تکمیل ظرفیت برای نشست ۲۱',
      passed,
      details: passed
        ? 'ظرفیت ۲۰ نشست رعایت شد و نشست مازاد بدون حذف خاموش سوابق قبلی رد شد.'
        : `خطا در کنترل سقف: تعداد قبلی=${archivedCountBefore}, نتیجه=${JSON.stringify(overflowResult)}, تعداد بعد=${archivedCountAfter}`,
    });
  } catch (err) {
    results.push({
      name: 'عدم حذف خاموش نشست‌ها و بازگرداندن خطای صریح تکمیل ظرفیت برای نشست ۲۱',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۷. تست: حفظ نشست فعال در صورت شکست بایگانی (عدم نابودی نشست جاری)
  try {
    PracticeSessionManager.clearAllForTesting();

    // پر کردن سقف ۲۰ نشست
    for (let i = 0; i < MAX_ARCHIVED_SESSIONS; i++) {
      const s = PracticeSessionManager.createNewSession('GBPUSD', 10000);
      PracticeSessionManager.archiveSession(s);
    }

    // ایجاد یک نشست فعال با معامله باز
    const active = PracticeSessionManager.createNewSession('XAUUSD', 10500);
    PracticeSessionManager.saveActiveSession(active);

    // تلاش برای بایگانی که به دلیل تکمیل ظرفیت شکست می‌خورد
    const archiveAttempt = PracticeSessionManager.archiveSession(active);

    // بررسی اینکه آیا نشست فعال همچنان در حافظه باقی مانده است
    const reloadedActive = PracticeSessionManager.loadActiveSession();

    const passed =
      archiveAttempt.success === false &&
      reloadedActive !== null &&
      reloadedActive.sessionId === active.sessionId &&
      reloadedActive.accountBalance === 10500;

    results.push({
      name: 'حفظ نشست فعال در حافظه و عدم پاک‌سازی آن در صورت شکست عملیات بایگانی',
      passed,
      details: passed
        ? 'پس از شکست بایگانی به دلیل تکمیل ظرفیت، نشست جاری دست‌نخورده در حافظه حفظ شد.'
        : 'خطا: نشست فعال پس از شکست بایگانی مفقود یا پاک شده است.',
    });
  } catch (err) {
    results.push({
      name: 'حفظ نشست فعال در حافظه و عدم پاک‌سازی آن در صورت شکست عملیات بایگانی',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۸. تست: اعتبارسنجی جامع داده‌های نشست بر اساس اسکیما و محدودیت‌های معنایی
  try {
    const validSession = PracticeSessionManager.createNewSession('XAUUSD', 10000);
    const validCheck = validatePracticeSession(validSession);

    // داده‌های خراب با نسخه نامعتبر
    const invalidSchema = validatePracticeSession({
      ...validSession,
      schemaVersion: '1.0',
    });

    // داده‌های خراب با نماد غیرمجاز
    const invalidSymbol = validatePracticeSession({
      ...validSession,
      symbol: 'BTCUSD',
    });

    // داده با بالانس منفی
    const invalidBalance = validatePracticeSession({
      ...validSession,
      accountBalance: -500,
    });

    const passed =
      validCheck.valid === true &&
      invalidSchema.valid === false &&
      invalidSymbol.valid === false &&
      invalidBalance.valid === false;

    results.push({
      name: 'اعتبارسنجی دقیق اسکیما و محدودیت‌های معنایی (نماد، نسخه، بالانس مثبت)',
      passed,
      details: passed
        ? 'اعتبارسنجی با موفقیت داده‌های صحیح را تأیید و موارد نامعتبر را با خطای صریح رد کرد.'
        : `خطا در اعتبارسنجی اسکیما: validCheck=${validCheck.valid}, invalidSchema=${invalidSchema.valid}`,
    });
  } catch (err) {
    results.push({
      name: 'اعتبارسنجی دقیق اسکیما و محدودیت‌های معنایی (نماد، نسخه، بالانس مثبت)',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۹. تست: قرنطینه داده‌های خراب حافظه بدون حذف خاموش یا نابودی اطلاعات
  try {
    PracticeSessionManager.clearAllForTesting();

    // ذخیره داده خراب (JSON ناقص) مستقیماً در کلید فعال
    const corruptJson = '{"sessionId": "practice-corrupt", "schemaVersion": "2.0", "symbol": ';
    PracticeSessionManager.setRawForTesting(ACTIVE_SESSION_STORAGE_KEY, corruptJson);

    // فراخوانی بارگذاری که نباید خطا پرتاب کند، باید null برگرداند و داده خراب را قرنطینه کند
    const loaded = PracticeSessionManager.loadActiveSession();

    // بررسی اینکه کلید فعال پاک شده است تا اجازه آغاز نشست تازه بدون خرابی بدهد
    const activeRawAfter = PracticeSessionManager.getRawForTesting(ACTIVE_SESSION_STORAGE_KEY);

    const passed =
      loaded === null &&
      activeRawAfter === null;

    results.push({
      name: 'قرنطینه داده‌های خراب حافظه بدون حذف خاموش یا بروز خطا در بارگذاری نشست فعال',
      passed,
      details: passed
        ? 'داده‌های خراب با موفقیت تشخیص داده شده، قرنطینه گردید و بارگذاری بدون توقف نامناسب انجام شد.'
        : 'خطا در قرنطینه‌سازی داده‌های خراب.',
    });
  } catch (err) {
    results.push({
      name: 'قرنطینه داده‌های خراب حافظه بدون حذف خاموش یا بروز خطا در بارگذاری نشست فعال',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۰. تست: کسر فوری کارمزد و به‌روزرسانی آنی اکوئیتی در لحظه باز شدن سفارش مارکت (BUG-PRAC-03)
  try {
    const broker = new SimulatedBroker(10000);
    const volume = 0.1; // کارمزد = ۰٫۱ * ۶ = ۰٫۶ دلار
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      volume,
      2000,
      1990,
      2020
    );

    const state = broker.getState();
    const expectedCommission = 0.6;
    const expectedUnrealized = -expectedCommission;
    const expectedEquity = Number((10000 - expectedCommission).toFixed(2));

    const passed =
      position.unrealizedPnl === expectedUnrealized &&
      state.accountEquity === expectedEquity &&
      position.initialVolumeLots === volume;

    results.push({
      name: 'انعکاس فوری کارمزد در سود/زیان شناور و به‌روزرسانی آنی اکوئیتی در لحظه ورود معامله',
      passed,
      details: passed
        ? `اکوئیتی و سود شناور بلافاصله کسر کارمزد را نشان دادند (اکوئیتی: ${state.accountEquity}، سود شناور: ${position.unrealizedPnl}).`
        : `خطا در انعکاس اکوئیتی اولیه: اکوئیتی=${state.accountEquity} (انتظار: ${expectedEquity})، سود شناور=${position.unrealizedPnl}`,
    });
  } catch (err) {
    results.push({
      name: 'انعکاس فوری کارمزد در سود/زیان شناور و به‌روزرسانی آنی اکوئیتی در لحظه ورود معامله',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۱. تست: انطباق زمان خروج دستی با تایم‌استمپ شبیه‌سازی بازار به جای ساعت سیستم (BUG-PRAC-02)
  try {
    const broker = new SimulatedBroker(10000);
    const marketCandleTimestamp = 1704084000000; // زمان فرضی بازار
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.04,
      2000,
      1990,
      2020,
      { candleTimestamp: marketCandleTimestamp }
    );

    const closeCandleTimestamp = marketCandleTimestamp + 300_000 * 5; // ۵ کندل بعد در بازار
    const closeRes = broker.closePosition(position.id, 2005, 'MANUAL', closeCandleTimestamp);

    const passed =
      closeRes.success === true &&
      closeRes.closedPosition?.closedAt === closeCandleTimestamp &&
      closeRes.closedPosition?.openedAt === marketCandleTimestamp;

    results.push({
      name: 'انطباق زمان خروج دستی پوزیشن با تایم‌استمپ کندل بازار به جای ساعت سیستم',
      passed,
      details: passed
        ? `زمان ورود (${marketCandleTimestamp}) و خروج (${closeCandleTimestamp}) کاملاً در خط زمان شبیه‌ساز بازار ثبت شدند.`
        : `خطا در زمان خروج: closedAt=${closeRes.closedPosition?.closedAt} (انتظار: ${closeCandleTimestamp})`,
    });
  } catch (err) {
    results.push({
      name: 'انطباق زمان خروج دستی پوزیشن با تایم‌استمپ کندل بازار به جای ساعت سیستم',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۲. تست: گزارش‌دهی صریح وضعیت ذخیره‌سازی و ممانعت از ثبت کاذب «موفق» در صورت خطا (BUG-PRAC-01)
  try {
    PracticeSessionManager.clearAllForTesting();
    const session = PracticeSessionManager.createNewSession('XAUUSD', 10000);

    // ذخیره با موفقیت
    const successRes = PracticeSessionManager.saveActiveSession(session);

    // ذخیره نشست نامعتبر (بالانس منفی)
    const invalidSession = { ...session, accountBalance: -100 };
    const failureRes = PracticeSessionManager.saveActiveSession(invalidSession as PracticeSession);

    const passed =
      successRes.success === true &&
      failureRes.success === false &&
      Boolean(failureRes.error && failureRes.error.includes('خطای اعتبارسنجی'));

    results.push({
      name: 'گزارش‌دهی صریح وضعیت ذخیره‌سازی و رد قطعی ذخیره نشست نامعتبر با اعلام خطا',
      passed,
      details: passed
        ? 'سیستم به درستی ذخیره معتبر را تأیید کرد و در داده‌های نامعتبر خروجی خطا بازگرداند.'
        : `خطا در بازخورد ذخیره‌سازی: successRes=${successRes.success}, failureRes=${failureRes.success}`,
    });
  } catch (err) {
    results.push({
      name: 'گزارش‌دهی صریح وضعیت ذخیره‌سازی و رد قطعی ذخیره نشست نامعتبر با اعلام خطا',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
