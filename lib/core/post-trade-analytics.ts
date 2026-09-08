// lib/core/post-trade-analytics.ts
// موتور تحلیل پسامعامله، تفکیک آلفا/اصطکاک و رادار سوگیری‌های رفتاری W5
// Gate W5 Post-Trade Analytics, Friction Attribution & Behavioral Bias Detection Engine

import { SymbolId } from '../contracts/market';
import {
  TradeLifecycleRecord,
  AlphaFrictionAttribution,
  BehavioralAuditFlag,
  DisciplineScorecard,
  SessionTimeDistribution,
  AICouncilAttributionReport,
} from '../contracts/w5-journal-analytics';

export class PostTradeAnalyticsEngine {
  /**
   * محاسبه اندازه پیپ بر اساس نماد
   */
  public static getPipSize(symbol: SymbolId): number {
    return symbol === 'XAUUSD' ? 0.1 : 0.0001;
  }

  /**
   * محاسبه ارزش دلاری هر پیپ به ازای لات معین
   */
  public static getPipValue(symbol: SymbolId, volumeLots: number): number {
    if (symbol === 'XAUUSD') {
      // برای طلا: هر ۱ لات = ۱۰۰ اونس -> ۰.۱ دلار تغییر قیمت = ۱۰ دلار در هر لات
      return volumeLots * 10.0;
    }
    // برای یورو: هر ۱ لات = ۱۰۰,۰۰۰ واحد -> ۰.۰۰۰۱ تغییر قیمت = ۱۰ دلار در هر لات
    return volumeLots * 10.0;
  }

  /**
   * محاسبه معیارهای نوسان نامطلوب (MAE) و مطلوب (MFE) و نسبت بهره‌وری خروج
   */
  public static calculateExcursionMetrics(params: {
    symbol: SymbolId;
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    exitPrice: number;
    highestPriceDuringTrade: number;
    lowestPriceDuringTrade: number;
    volumeLots: number;
  }): {
    maePips: number;
    maeDollar: number;
    mfePips: number;
    mfeDollar: number;
    exitEfficiencyPercent: number;
  } {
    const {
      symbol,
      direction,
      entryPrice,
      exitPrice,
      highestPriceDuringTrade,
      lowestPriceDuringTrade,
      volumeLots,
    } = params;

    const pipSize = this.getPipSize(symbol);
    const pipValue = this.getPipValue(symbol, volumeLots);

    let rawMaeDistance = 0;
    let rawMfeDistance = 0;
    let rawExitGainDistance = 0;

    if (direction === 'BUY') {
      // در خرید: بیشترین افت زیر قیمت ورود یعنی زیان موقت (MAE)
      rawMaeDistance = Math.max(0, entryPrice - lowestPriceDuringTrade);
      // بیشترین صعود بالای قیمت ورود یعنی سود حداکثری موقت (MFE)
      rawMfeDistance = Math.max(0, highestPriceDuringTrade - entryPrice);
      rawExitGainDistance = exitPrice - entryPrice;
    } else {
      // در فروش: بیشترین صعود بالای قیمت ورود یعنی زیان موقت (MAE)
      rawMaeDistance = Math.max(0, highestPriceDuringTrade - entryPrice);
      // بیشترین افت زیر قیمت ورود یعنی سود حداکثری موقت (MFE)
      rawMfeDistance = Math.max(0, entryPrice - lowestPriceDuringTrade);
      rawExitGainDistance = entryPrice - exitPrice;
    }

    const maePips = Number((rawMaeDistance / pipSize).toFixed(1));
    const maeDollar = Number((maePips * pipValue).toFixed(2));

    const mfePips = Number((rawMfeDistance / pipSize).toFixed(1));
    const mfeDollar = Number((mfePips * pipValue).toFixed(2));

    // محاسبه نسبت بهره‌وری خروج (Exit Efficiency)
    // فرمول: سود حاصله بر حسب فاصله به حداکثر سود موقت ممکن
    let exitEfficiencyPercent = 0;
    if (rawExitGainDistance > 0 && rawMfeDistance > 0) {
      exitEfficiencyPercent = Number(
        Math.min(100, Math.max(0, (rawExitGainDistance / rawMfeDistance) * 100)).toFixed(1)
      );
    }

    return {
      maePips,
      maeDollar,
      mfePips,
      mfeDollar,
      exitEfficiencyPercent,
    };
  }

  /**
   * ممیزی دقیق سوگیری‌های رفتاری و خطاهای روان‌شناختی معامله‌گر
   */
  public static auditBehavioralBiases(
    trades: TradeLifecycleRecord[],
    nominalAccountEquity: number = 10000
  ): BehavioralAuditFlag[] {
    const flags: BehavioralAuditFlag[] = [];
    if (!trades || trades.length === 0) return flags;

    // مرتب‌سازی زمانی صعودی
    const sorted = [...trades].sort((a, b) => a.openedAt - b.openedAt);

    for (let i = 0; i < sorted.length; i++) {
      const trade = sorted[i];

      // ۱. بررسی معامله انتقامی (Revenge Trading)
      // شرط: معامله قبلی زیان‌ده بوده و معامله فعلی ظرف کمتر از ۱۰ دقیقه (۶۰۰ ثانیه) باز شده است
      if (i > 0) {
        const prevTrade = sorted[i - 1];
        const isPrevLoss = prevTrade.realizedNetPnL < 0;
        const timeDiffMs = trade.openedAt - prevTrade.closedAt;

        if (isPrevLoss && timeDiffMs >= 0 && timeDiffMs < 10 * 60 * 1000) {
          const minutesPassed = Math.round(timeDiffMs / 60000);
          flags.push({
            id: `BIAS-REV-${trade.tradeId}`,
            tradeId: trade.tradeId,
            biasType: 'REVENGE_TRADING',
            severity: 'HIGH',
            detectedAt: trade.openedAt,
            symbol: trade.symbol,
            titleFa: 'معامله انتقامی (Revenge Trading)',
            titleEn: 'Revenge Trading Detected',
            descriptionFa: `این پوزیشن تنها ${minutesPassed} دقیقه پس از بسته شدن معامله زیان‌ده قبلی باز شده است.`,
            metricDetails: `فاصله زمانی پس از زیان: ${minutesPassed} دقیقه (حداقل زمان استاندارد: ۳۰ دقیقه)`,
            coolingAdviceFa: 'توصیه: پس از هر معامله زیان‌ده، حداقل ۳۰ دقیقه از مانیتور فاصله بگیرید و تمرین تنفس عمیق انجام دهید.',
          });
        }
      }

      // ۲. بررسی بیش‌معامله‌گری (Overtrading)
      // شرط: بیش از ۳ معامله در یک پنجره ۲ ساعته (۷۲۰۰ ثانیه)
      const windowStart = trade.openedAt - 2 * 60 * 60 * 1000;
      const tradesInWindow = sorted.filter(
        t => t.openedAt >= windowStart && t.openedAt <= trade.openedAt
      );

      if (tradesInWindow.length > 3) {
        // جلوگیری از ایجاد فلگ تکراری برای همین معامله
        if (!flags.some(f => f.tradeId === trade.tradeId && f.biasType === 'OVERTRADING')) {
          flags.push({
            id: `BIAS-OVT-${trade.tradeId}`,
            tradeId: trade.tradeId,
            biasType: 'OVERTRADING',
            severity: 'MEDIUM',
            detectedAt: trade.openedAt,
            symbol: trade.symbol,
            titleFa: 'بیش‌معامله‌گری (Overtrading)',
            titleEn: 'Overtrading Pattern',
            descriptionFa: `ثبت ${tradesInWindow.length} معامله در کمتر از ۲ ساعت، نشان‌دهنده شتاب‌زدگی و بیش‌فعالی رفتاری است.`,
            metricDetails: `تعداد معاملات در ۲ ساعت: ${tradesInWindow.length} معامله (سقف مجاز: ۲)`,
            coolingAdviceFa: 'توصیه: سقف تعداد معاملات روزانه خود را روی حداکثر ۲ ستاپ باکیفیت قفل نمایید.',
          });
        }
      }

      // ۳. بررسی ورود در فومو و لغزش بالا (FOMO / Chasing Entry)
      if (trade.slippagePips > 3.0 || (trade.behavioralTags && trade.behavioralTags.includes('CHASING_ENTRY'))) {
        flags.push({
          id: `BIAS-FOMO-${trade.tradeId}`,
          tradeId: trade.tradeId,
          biasType: 'FOMO_CHASING',
          severity: 'MEDIUM',
          detectedAt: trade.openedAt,
          symbol: trade.symbol,
          titleFa: 'تعقیب شتاب‌زده قیمت (FOMO Chasing)',
          titleEn: 'FOMO Chasing Entry',
          descriptionFa: `ورود با لغزش ${trade.slippagePips.toFixed(1)} پیپ بالاتر از محدوده امن FVG نشان‌دهنده ورود شتاب‌زده ناشی از ترس جا ماندن است.`,
          metricDetails: `لغزش نرخ: ${trade.slippagePips.toFixed(1)} پیپ (سقف تحمل: ۱.۵ پیپ)`,
          coolingAdviceFa: 'توصیه: همیشه از سفارشات لیمیت استفاده کنید و هرگز به دنبال قیمت در حال جهش حرکت نکنید.',
        });
      }

      // ۴. بررسی خروج شتاب‌زده (Premature Exit)
      // شرط: خروج دستی زیر ۱R در شرایطی که MFE نشان می‌دهد بازار به راحتی به تارگت سود (TP) رسیده است
      const pipSize = this.getPipSize(trade.symbol);
      const targetGainPips = Math.abs(trade.takeProfitPrice - trade.entryPrice) / pipSize;
      if (
        trade.exitReason === 'MANUAL_CLOSE' &&
        trade.realizedRMultiple > 0 &&
        trade.realizedRMultiple < 1.0 &&
        trade.maxFavorableExcursionPips >= targetGainPips * 0.9
      ) {
        flags.push({
          id: `BIAS-PREM-${trade.tradeId}`,
          tradeId: trade.tradeId,
          biasType: 'PREMATURE_EXIT',
          severity: 'LOW',
          detectedAt: trade.closedAt,
          symbol: trade.symbol,
          titleFa: 'خروج شتاب‌زده و کم‌طاقتی (Premature Exit)',
          titleEn: 'Premature Early Exit',
          descriptionFa: `پوزیشن به صورت دستی در سود ${trade.realizedRMultiple.toFixed(2)}R بسته شد، در حالی که قیمت تا هدف کامل سود (TP) ادامه داد.`,
          metricDetails: `سود محقق: ${trade.realizedRMultiple.toFixed(2)}R | پتانسیل بازار: ${trade.maxFavorableExcursionPips.toFixed(1)} پیپ`,
          coolingAdviceFa: 'توصیه: به قوانین سیستم خود اعتماد کنید و اجازه دهید حد سود یا انتقال به سربه‌سر وظیفه خروج را انجام دهند.',
        });
      }

      // ۵. بررسی حجم‌گیری بی‌قاعده (Reckless Sizing)
      const allowedRiskCap = nominalAccountEquity * 0.012; // بیش از ۱.۲ درصد حساب
      if (trade.plannedRiskAmount > allowedRiskCap) {
        flags.push({
          id: `BIAS-SIZE-${trade.tradeId}`,
          tradeId: trade.tradeId,
          biasType: 'RECKLESS_SIZING',
          severity: 'HIGH',
          detectedAt: trade.openedAt,
          symbol: trade.symbol,
          titleFa: 'ریسک فراتر از بودجه (Reckless Sizing)',
          titleEn: 'Reckless Sizing Violation',
          descriptionFa: `ریسک برنامه‌ریزی‌شده معامله (${trade.plannedRiskAmount.toFixed(1)} دلار) از سقف استاندارد ۱ درصدی تخطی کرده است.`,
          metricDetails: `ریسک معامله: ${((trade.plannedRiskAmount / nominalAccountEquity) * 100).toFixed(2)}٪ (سقف مجاز: ۱.۰٪)`,
          coolingAdviceFa: 'توصیه: پیش از کلیک نهایی، حجم لات خود را با ماشین‌حساب قطعی گیت W4 هماهنگ نمایید.',
        });
      }
    }

    return flags;
  }

  /**
   * تفکیک آلفای ناخالص استراتژی از اصطکاک اجرای بروکر (کارمزد و لغزش)
   */
  public static calculateAlphaAttribution(trades: TradeLifecycleRecord[]): AlphaFrictionAttribution {
    if (!trades || trades.length === 0) {
      return {
        totalTrades: 0,
        grossAlphaDollar: 0,
        grossAlphaR: 0,
        totalCommissionsDollar: 0,
        totalCommissionR: 0,
        totalSlippageDollar: 0,
        totalSlippageR: 0,
        totalFrictionDollar: 0,
        totalFrictionR: 0,
        netRealizedProfitDollar: 0,
        netRealizedR: 0,
        frictionDragPercent: 0,
      };
    }

    let grossAlphaDollar = 0;
    let grossAlphaR = 0;
    let totalCommissionsDollar = 0;
    let totalSlippageDollar = 0;
    let netRealizedProfitDollar = 0;
    let netRealizedR = 0;

    let sum1RDollar = 0;

    for (const t of trades) {
      grossAlphaDollar += t.realizedGrossPnL;
      totalCommissionsDollar += t.brokerCommission;
      totalSlippageDollar += t.slippageCostDollar;
      netRealizedProfitDollar += t.realizedNetPnL;
      netRealizedR += t.realizedRMultiple;

      const singleRisk = t.plannedRiskAmount > 0 ? t.plannedRiskAmount : 100;
      sum1RDollar += singleRisk;
      grossAlphaR += t.realizedGrossPnL / singleRisk;
    }

    const avgRisk = sum1RDollar / trades.length;
    const totalFrictionDollar = totalCommissionsDollar + totalSlippageDollar;
    const totalCommissionR = avgRisk > 0 ? totalCommissionsDollar / avgRisk : 0;
    const totalSlippageR = avgRisk > 0 ? totalSlippageDollar / avgRisk : 0;
    const totalFrictionR = totalCommissionR + totalSlippageR;

    let frictionDragPercent = 0;
    if (grossAlphaDollar > 0) {
      frictionDragPercent = Number(((totalFrictionDollar / grossAlphaDollar) * 100).toFixed(1));
    }

    return {
      totalTrades: trades.length,
      grossAlphaDollar: Number(grossAlphaDollar.toFixed(2)),
      grossAlphaR: Number(grossAlphaR.toFixed(2)),
      totalCommissionsDollar: Number(totalCommissionsDollar.toFixed(2)),
      totalCommissionR: Number(totalCommissionR.toFixed(2)),
      totalSlippageDollar: Number(totalSlippageDollar.toFixed(2)),
      totalSlippageR: Number(totalSlippageR.toFixed(2)),
      totalFrictionDollar: Number(totalFrictionDollar.toFixed(2)),
      totalFrictionR: Number(totalFrictionR.toFixed(2)),
      netRealizedProfitDollar: Number(netRealizedProfitDollar.toFixed(2)),
      netRealizedR: Number(netRealizedR.toFixed(2)),
      frictionDragPercent,
    };
  }

  /**
   * محاسبه کارنامه و نمره انضباط روان‌شناختی معامله‌گر (Discipline Scorecard)
   */
  public static calculateDisciplineScorecard(
    trades: TradeLifecycleRecord[],
    biases: BehavioralAuditFlag[]
  ): DisciplineScorecard {
    if (!trades || trades.length === 0) {
      return {
        overallScore: 100,
        grade: 'A+',
        riskSizingAdherencePercent: 100,
        stopLossAdherencePercent: 100,
        patienceScorePercent: 100,
        activeBiasesCount: 0,
        totalPenaltyPoints: 0,
        strengthsFa: ['هنوز معامله‌ای ثبت نشده و انضباط اولیه ۱۰۰٪ است.'],
        improvementsFa: [],
      };
    }

    let penaltyPoints = 0;
    let revengeCount = 0;
    let overtradingCount = 0;
    let fomoCount = 0;
    let sizingCount = 0;

    for (const b of biases) {
      switch (b.biasType) {
        case 'REVENGE_TRADING':
          penaltyPoints += 15;
          revengeCount++;
          break;
        case 'OVERTRADING':
          penaltyPoints += 10;
          overtradingCount++;
          break;
        case 'FOMO_CHASING':
          penaltyPoints += 8;
          fomoCount++;
          break;
        case 'PREMATURE_EXIT':
          penaltyPoints += 5;
          break;
        case 'RECKLESS_SIZING':
          penaltyPoints += 20;
          sizingCount++;
          break;
      }
    }

    const overallScore = Math.max(0, Math.min(100, 100 - penaltyPoints));

    let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
    if (overallScore >= 95) grade = 'A+';
    else if (overallScore >= 85) grade = 'A';
    else if (overallScore >= 75) grade = 'B';
    else if (overallScore >= 65) grade = 'C';
    else if (overallScore >= 50) grade = 'D';

    const riskSizingAdherencePercent = Math.max(
      0,
      Number((((trades.length - sizingCount) / trades.length) * 100).toFixed(1))
    );

    const patienceScorePercent = Math.max(
      0,
      Number((((trades.length - (revengeCount + fomoCount)) / trades.length) * 100).toFixed(1))
    );

    const stopLossAdherencePercent = Math.max(
      0,
      Number((((trades.length - overtradingCount) / trades.length) * 100).toFixed(1))
    );

    const strengthsFa: string[] = [];
    const improvementsFa: string[] = [];

    if (sizingCount === 0) strengthsFa.push('پایبندی عالی به سقف بودجه ریسک ۱ درصدی در تمام معاملات.');
    else improvementsFa.push(`کاهش تخطی از حجم لات (${sizingCount} مورد ریسک مازاد شناسایی شد).`);

    if (revengeCount === 0) strengthsFa.push('کنترل احساسات پس از زیان و پرهیز کامل از معاملات انتقامی.');
    else improvementsFa.push(`رعایت وقفه استراحت پس از زیان (${revengeCount} معامله عجولانه ثبت شده).`);

    if (fomoCount === 0) strengthsFa.push('ورود دقیق با اردرهای لیمیت بدون تعقیب قیمت.');
    else improvementsFa.push('پرهیز از ورود شتاب‌زده مارکت در زمان جهش قیمت.');

    if (strengthsFa.length === 0) {
      strengthsFa.push('حفظ تمرکز و تلاش برای ارتقای انضباط شخصی در معاملات.');
    }

    return {
      overallScore,
      grade,
      riskSizingAdherencePercent,
      stopLossAdherencePercent,
      patienceScorePercent,
      activeBiasesCount: biases.length,
      totalPenaltyPoints: penaltyPoints,
      strengthsFa,
      improvementsFa,
    };
  }

  /**
   * توزیع زمانی عملکرد بر حسب ساعات روز و روزهای هفته (Session Edge Distribution)
   */
  public static calculateSessionDistribution(trades: TradeLifecycleRecord[]): SessionTimeDistribution {
    const hourlyMap = new Map<number, { count: number; wins: number; profit: number; netR: number }>();
    const dayMap = new Map<string, { nameFa: string; count: number; wins: number; profit: number; netR: number }>();

    const DAY_NAMES: Record<number, { en: string; fa: string }> = {
      0: { en: 'Sunday', fa: 'یکشنبه' },
      1: { en: 'Monday', fa: 'دوشنبه' },
      2: { en: 'Tuesday', fa: 'سه‌شنبه' },
      3: { en: 'Wednesday', fa: 'چهارشنبه' },
      4: { en: 'Thursday', fa: 'پنج‌شنبه' },
      5: { en: 'Friday', fa: 'جمعه' },
      6: { en: 'Saturday', fa: 'شنبه' },
    };

    for (const t of trades) {
      const date = new Date(t.openedAt);
      const hour = date.getUTCHours();
      const dayNum = date.getUTCDay();
      const dayMeta = DAY_NAMES[dayNum] || { en: 'Unknown', fa: 'نامشخص' };

      // ساعات
      const curH = hourlyMap.get(hour) || { count: 0, wins: 0, profit: 0, netR: 0 };
      curH.count++;
      if (t.realizedNetPnL > 0) curH.wins++;
      curH.profit += t.realizedNetPnL;
      curH.netR += t.realizedRMultiple;
      hourlyMap.set(hour, curH);

      // روزها
      const curD = dayMap.get(dayMeta.en) || { nameFa: dayMeta.fa, count: 0, wins: 0, profit: 0, netR: 0 };
      curD.count++;
      if (t.realizedNetPnL > 0) curD.wins++;
      curD.profit += t.realizedNetPnL;
      curD.netR += t.realizedRMultiple;
      dayMap.set(dayMeta.en, curD);
    }

    const hourlyEdge = Array.from(hourlyMap.entries())
      .map(([hourUtc, data]) => ({
        hourUtc,
        tradesCount: data.count,
        winRatePercent: Number(((data.wins / data.count) * 100).toFixed(1)),
        netProfitDollar: Number(data.profit.toFixed(2)),
        netR: Number(data.netR.toFixed(2)),
      }))
      .sort((a, b) => a.hourUtc - b.hourUtc);

    const dayOfWeekEdge = Array.from(dayMap.entries()).map(([dayName, data]) => ({
      dayName,
      dayNameFa: data.nameFa,
      tradesCount: data.count,
      winRatePercent: Number(((data.wins / data.count) * 100).toFixed(1)),
      netProfitDollar: Number(data.profit.toFixed(2)),
      netR: Number(data.netR.toFixed(2)),
    }));

    // یافتن بهترین و بدترین پنجره
    let bestTradingWindowFa = 'نشست نیویورک و لندن (ساعات ۸ الی ۱۶ UTC)';
    let worstTradingWindowFa = 'تعطیلی بازار آسیا و رول‌اور آخر شب (ساعات ۲۱ الی ۲۳ UTC)';

    if (hourlyEdge.length > 0) {
      const bestHour = [...hourlyEdge].sort((a, b) => b.netR - a.netR)[0];
      const worstHour = [...hourlyEdge].sort((a, b) => a.netR - b.netR)[0];
      if (bestHour && bestHour.netR > 0) {
        bestTradingWindowFa = `ساعت ${bestHour.hourUtc}:00 UTC با بازدهی ${bestHour.netR.toFixed(1)}R`;
      }
      if (worstHour && worstHour.netR < 0) {
        worstTradingWindowFa = `ساعت ${worstHour.hourUtc}:00 UTC با بازدهی منفی ${worstHour.netR.toFixed(1)}R`;
      }
    }

    return {
      hourlyEdge,
      dayOfWeekEdge,
      bestTradingWindowFa,
      worstTradingWindowFa,
    };
  }

  /**
   * ارزیابی و انطباق عملکرد شورای هوش مصنوعی، سبک‌های معاملاتی، رژیم بازار و سیو سود پارشال (Phase 6 Apex Synthesis)
   */
  public static calculateAICouncilAttribution(trades: TradeLifecycleRecord[]): AICouncilAttributionReport {
    const byStyle: Record<string, { tradesCount: number; wins: number; winRate: number; netProfit: number; netR: number }> = {};
    const byRegime: Record<string, { tradesCount: number; wins: number; winRate: number; netProfit: number; netR: number }> = {};

    let highTrades = 0, highWins = 0, highProfit = 0;
    let modTrades = 0, modWins = 0, modProfit = 0;
    let lowTrades = 0, lowWins = 0, lowProfit = 0;

    let partialTpCount = 0, partialTpWins = 0, partialTpNetProfit = 0;
    let standardCount = 0, standardWins = 0, standardNetProfit = 0;

    for (const t of trades) {
      const style = t.tradingStyleUsed || 'UNKNOWN';
      const regime = t.marketRegimeAtEntry || 'UNKNOWN';
      const isWin = t.realizedNetPnL > 0;

      // Style
      if (!byStyle[style]) {
        byStyle[style] = { tradesCount: 0, wins: 0, winRate: 0, netProfit: 0, netR: 0 };
      }
      byStyle[style].tradesCount++;
      if (isWin) byStyle[style].wins++;
      byStyle[style].netProfit += t.realizedNetPnL;
      byStyle[style].netR += t.realizedRMultiple;

      // Regime
      if (!byRegime[regime]) {
        byRegime[regime] = { tradesCount: 0, wins: 0, winRate: 0, netProfit: 0, netR: 0 };
      }
      byRegime[regime].tradesCount++;
      if (isWin) byRegime[regime].wins++;
      byRegime[regime].netProfit += t.realizedNetPnL;
      byRegime[regime].netR += t.realizedRMultiple;

      // Consensus tier
      const score = t.alphaConsensusScore ?? 0;
      if (score >= 75) {
        highTrades++;
        if (isWin) highWins++;
        highProfit += t.realizedNetPnL;
      } else if (score >= 60) {
        modTrades++;
        if (isWin) modWins++;
        modProfit += t.realizedNetPnL;
      } else {
        lowTrades++;
        if (isWin) lowWins++;
        lowProfit += t.realizedNetPnL;
      }

      // Partial TP impact
      if (t.partialTpExecuted) {
        partialTpCount++;
        if (isWin) partialTpWins++;
        partialTpNetProfit += t.realizedNetPnL;
      } else {
        standardCount++;
        if (isWin) standardWins++;
        standardNetProfit += t.realizedNetPnL;
      }
    }

    // Format style map
    const formattedStyle: Record<string, { tradesCount: number; winRate: number; netProfit: number; netR: number }> = {};
    for (const [key, val] of Object.entries(byStyle)) {
      formattedStyle[key] = {
        tradesCount: val.tradesCount,
        winRate: Number(((val.wins / val.tradesCount) * 100).toFixed(1)),
        netProfit: Number(val.netProfit.toFixed(2)),
        netR: Number(val.netR.toFixed(2)),
      };
    }

    // Format regime map
    const formattedRegime: Record<string, { tradesCount: number; winRate: number; netProfit: number; netR: number }> = {};
    for (const [key, val] of Object.entries(byRegime)) {
      formattedRegime[key] = {
        tradesCount: val.tradesCount,
        winRate: Number(((val.wins / val.tradesCount) * 100).toFixed(1)),
        netProfit: Number(val.netProfit.toFixed(2)),
        netR: Number(val.netR.toFixed(2)),
      };
    }

    return {
      totalTrades: trades.length,
      byStyle: formattedStyle,
      byRegime: formattedRegime,
      byConsensusTier: {
        highConsensus: {
          tradesCount: highTrades,
          winRate: highTrades > 0 ? Number(((highWins / highTrades) * 100).toFixed(1)) : 0,
          netProfit: Number(highProfit.toFixed(2)),
        },
        moderateConsensus: {
          tradesCount: modTrades,
          winRate: modTrades > 0 ? Number(((modWins / modTrades) * 100).toFixed(1)) : 0,
          netProfit: Number(modProfit.toFixed(2)),
        },
        lowConsensus: {
          tradesCount: lowTrades,
          winRate: lowTrades > 0 ? Number(((lowWins / lowTrades) * 100).toFixed(1)) : 0,
          netProfit: Number(lowProfit.toFixed(2)),
        },
      },
      partialTpImpact: {
        partialTpCount,
        partialTpWinRate: partialTpCount > 0 ? Number(((partialTpWins / partialTpCount) * 100).toFixed(1)) : 0,
        partialTpNetProfit: Number(partialTpNetProfit.toFixed(2)),
        standardCount,
        standardWinRate: standardCount > 0 ? Number(((standardWins / standardCount) * 100).toFixed(1)) : 0,
        standardNetProfit: Number(standardNetProfit.toFixed(2)),
      },
    };
  }
}
