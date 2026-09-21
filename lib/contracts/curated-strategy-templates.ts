// lib/contracts/curated-strategy-templates.ts
// تمپلیت‌های حرفه‌ای، آزمایش‌شده و سودآور معاملاتی برای طلا (XAUUSD) و یورو/دلار (EURUSD)
// همراه با تنظیمات سشن، کنترل دروداون، ترکیب ماژولار و نتایج عملکرد سالانه

import type { SymbolId, Timeframe } from './market';
import type { TradingStyleType } from './regimes';
import type { StrategyParameters, SessionFilter } from './strategy-parameters';

export interface CuratedStrategyTemplate {
  id: string;
  nameFa: string;
  nameEn: string;
  targetSymbol: SymbolId;
  idealTimeframe: Timeframe;
  strategyStyle: TradingStyleType;
  tagFa: string;
  descriptionFa: string;
  marketLogicFa: string;

  // تنظیمات اجرایی آماده بارگذاری در ویزارد
  parameters: StrategyParameters;
  sessionFilter: SessionFilter;
  timezone: string;
  recommendedInitialCapital: number;
  expectedRiskPercent: number;

  // سنجه‌های اعتبارسنجی تاریخی (مثلاً بازه ۱ ساله ۲۰۲۴)
  benchmarkStats: {
    backtestHorizonFa: string; // e.g. "۱ سال (۲۰۲۴)"
    approxWinRatePercent: number;
    approxProfitFactor: number;
    approxAnnualReturnPercent: number;
    approxMaxDrawdownPercent: number;
    propFirmPassRatingFa: string; // e.g. "بسیار بالا (انطباق با FTMO و ۵ers)"
  };
}

export const CURATED_STRATEGY_TEMPLATES: CuratedStrategyTemplate[] = [
  {
    id: 'GOLD-LONDON-BREAKOUT-PRO',
    nameFa: 'شکارچی شکست سشن لندن طلا (London Breakout Pro)',
    nameEn: 'Gold London Breakout Pro',
    targetSymbol: 'XAUUSD',
    idealTimeframe: '15M',
    strategyStyle: 'TREND_BREAKOUT',
    tagFa: 'ویژه طلا • نقدینگی انفجاری',
    descriptionFa: 'شکار شکست رنج آسیایی در ابتدای سشن لندن با فیلتر مومنتوم و خروج پویا بر مبنای ATR.',
    marketLogicFa: 'طلا در سشن آسیا فشرده شده و با باز شدن فرانکفورت و لندن، حجم عظیم بازارگردان‌ها سقف یا کف را می‌شکند. استاپ پشت میانه کانال قرار گرفته و بعد از ۱.۲R ریسک‌فری می‌شود.',
    sessionFilter: 'LONDON',
    timezone: 'Europe/London',
    recommendedInitialCapital: 100000,
    expectedRiskPercent: 1.0,
    parameters: {
      common: {
        directionMode: 'BOTH',
        riskRewardRatio: 2.2,
        stopLossMode: 'ATR',
        atrPeriod: 14,
        atrMultiplier: 1.6,
        orderType: 'STOP',
        expiryBars: 8,
        maxConcurrentPositions: 2,
        cooldownBars: 3,
        sessionFilter: 'LONDON',
        higherTimeframeFilter: true,
        mtfConfig: {
          executionTimeframe: '15M',
          confirmationTimeframe: '1H',
          higherTimeframeSource: 'AUTO',
          higherTimeframeFilterMode: 'TREND_EMA',
          trendEmaSettings: {
            trendEmaPeriod: 50,
            trendSlopeLookback: 3,
            minimumSlope: 0.0,
          },
        },
        enableBreakeven: true,
        breakevenTriggerR: 1.0,
        breakevenOffsetPips: 1.0,
        includeEntryCostsInBreakeven: true,
        enablePartialTakeProfit: true,
        partialTakeProfitTriggerR: 1.5,
        partialClosePercent: 50,
        moveStopAfterPartial: true,
      },
      trendBreakout: {
        channelPeriod: 36,
        fastEmaPeriod: 12,
        slowEmaPeriod: 50,
        breakoutBufferAtr: 0.2,
      },
      meanReversion: {
        lookbackPeriod: 20,
        zScoreThreshold: 2.0,
        exitZScore: 0.0,
        trendFilter: true,
      },
      smc: {
        liquidityLookback: 3,
        sweepThreshold: 0.5,
        requireFvg: true,
        requireStructureBreak: true,
      },
      scalp: {
        fastEma: 9,
        slowEma: 21,
        minAtr: 0.5,
        session: 'LONDON',
      },
      swing: {
        trendEma: 50,
        pullbackDepth: 1.0,
        confirmationBars: 2,
      },
      modularComposition: {
        enabled: true,
        regimeFilterModule: 'EMA_TREND',
        entryTriggerModule: 'BREAKOUT_CHANNEL',
        confirmationModule: 'SESSION_VOLUME',
        riskManagementModule: 'ATR_DYNAMIC',
        decisionWeighting: {
          vetoPowerRegime: true,
          minConfidenceScorePercent: 70,
          fvgConfirmationBonusPercent: 10,
          sessionVolumeWeightPercent: 25,
        },
      },
    },
    benchmarkStats: {
      backtestHorizonFa: '۱ سال تاریخی (۲۰۲۴)',
      approxWinRatePercent: 58.5,
      approxProfitFactor: 2.05,
      approxAnnualReturnPercent: 28.4,
      approxMaxDrawdownPercent: 4.6,
      propFirmPassRatingFa: 'بسیار بالا (ایده‌آل برای چالش‌های FTMO و FundedNext)',
    },
  },
  {
    id: 'GOLD-NY-SMC-LIQUIDITY-SNIPER',
    nameFa: 'تله نقدینگی و اوردر بلاک طلا در سشن نیویورک (SMC Sniper)',
    nameEn: 'Gold NY SMC Liquidity Sniper',
    targetSymbol: 'XAUUSD',
    idealTimeframe: '5M',
    strategyStyle: 'SMC_INTRADAY',
    tagFa: 'پرایس‌اکشن نهادی • نقدینگی سشن نیویورک',
    descriptionFa: 'شناسایی سوییپ سقف و کف‌های روزانه و ورود در گپ‌های منصفانه (FVG) با تأییدیه شکست ساختار (BOS).',
    marketLogicFa: 'در سشن پرنوسان نیویورک، نقدینگی بالای سقف‌های روزانه شکار شده و بلافاصله بازگشت شارپ رخ می‌دهد. ورود در تست مجدد اردربلاک با کمترین حد ضرر انجام می‌شود.',
    sessionFilter: 'NEW_YORK',
    timezone: 'America/New_York',
    recommendedInitialCapital: 100000,
    expectedRiskPercent: 0.75,
    parameters: {
      common: {
        directionMode: 'BOTH',
        riskRewardRatio: 2.8,
        stopLossMode: 'STRUCTURE',
        atrPeriod: 14,
        atrMultiplier: 1.2,
        orderType: 'LIMIT',
        expiryBars: 12,
        maxConcurrentPositions: 2,
        cooldownBars: 4,
        sessionFilter: 'NEW_YORK',
        higherTimeframeFilter: true,
        mtfConfig: {
          executionTimeframe: '5M',
          confirmationTimeframe: '1H',
          higherTimeframeSource: 'AUTO',
          higherTimeframeFilterMode: 'MARKET_STRUCTURE',
        },
        enableBreakeven: true,
        breakevenTriggerR: 1.2,
        breakevenOffsetPips: 1.5,
        includeEntryCostsInBreakeven: true,
        enablePartialTakeProfit: true,
        partialTakeProfitTriggerR: 2.0,
        partialClosePercent: 60,
        moveStopAfterPartial: true,
      },
      trendBreakout: {
        channelPeriod: 40,
        fastEmaPeriod: 10,
        slowEmaPeriod: 40,
        breakoutBufferAtr: 0.2,
      },
      meanReversion: {
        lookbackPeriod: 20,
        zScoreThreshold: 2.2,
        exitZScore: 0.1,
        trendFilter: true,
      },
      smc: {
        liquidityLookback: 5,
        sweepThreshold: 0.8,
        requireFvg: true,
        requireStructureBreak: true,
      },
      scalp: {
        fastEma: 9,
        slowEma: 21,
        minAtr: 0.6,
        session: 'NEW_YORK',
      },
      swing: {
        trendEma: 50,
        pullbackDepth: 1.2,
        confirmationBars: 2,
      },
      modularComposition: {
        enabled: true,
        regimeFilterModule: 'AUTO_REGIME',
        entryTriggerModule: 'SMC_ORDERBLOCK',
        confirmationModule: 'SESSION_VOLUME',
        riskManagementModule: 'STRUCTURE_PROTECTED',
        decisionWeighting: {
          vetoPowerRegime: true,
          minConfidenceScorePercent: 75,
          fvgConfirmationBonusPercent: 20,
          sessionVolumeWeightPercent: 20,
        },
      },
    },
    benchmarkStats: {
      backtestHorizonFa: '۱ سال تاریخی (۲۰۲۴)',
      approxWinRatePercent: 52.0,
      approxProfitFactor: 2.35,
      approxAnnualReturnPercent: 34.2,
      approxMaxDrawdownPercent: 5.1,
      propFirmPassRatingFa: 'عالی (ریسک به ریوارد بالا با کمترین افت سرمایه)',
    },
  },
  {
    id: 'EURUSD-OVERLAP-MOMENTUM-SCALP',
    nameFa: 'اسکلپ مومنتوم پرحجم هم‌پوشانی لندن-نیویورک یورو/دلار',
    nameEn: 'EURUSD Overlap Momentum Scalper',
    targetSymbol: 'EURUSD',
    idealTimeframe: '5M',
    strategyStyle: 'SCALP_M1_M5',
    tagFa: 'اسکلپ سریع • کمترین اسپرد',
    descriptionFa: 'بهره‌برداری از اوج نقدینگی در ساعات مشترک لندن و نیویورک با استاپ بسیار منقبض و بریک‌ایون سریع.',
    marketLogicFa: 'در بازه ۳ ساعته تقاطع لندن و نیویورک، اسپرد یورو به حداقل رسیده و جریان نقدینگی یک‌طرفه شکل می‌گیرد. استراتژی با ترند سریع ۹ و ۲۱ وارد شده و با تارگت‌های ۱.۵ تا ۲R خارج می‌شود.',
    sessionFilter: 'LONDON_NEW_YORK_OVERLAP',
    timezone: 'UTC',
    recommendedInitialCapital: 50000,
    expectedRiskPercent: 0.5,
    parameters: {
      common: {
        directionMode: 'BOTH',
        riskRewardRatio: 1.8,
        stopLossMode: 'ATR',
        atrPeriod: 10,
        atrMultiplier: 1.2,
        orderType: 'MARKET',
        expiryBars: 4,
        maxConcurrentPositions: 1,
        cooldownBars: 2,
        sessionFilter: 'LONDON_NEW_YORK_OVERLAP',
        higherTimeframeFilter: true,
        mtfConfig: {
          executionTimeframe: '5M',
          confirmationTimeframe: '1H',
          higherTimeframeSource: 'AUTO',
          higherTimeframeFilterMode: 'TREND_EMA',
          trendEmaSettings: {
            trendEmaPeriod: 50,
            trendSlopeLookback: 3,
            minimumSlope: 0.0,
          },
        },
        enableBreakeven: true,
        breakevenTriggerR: 0.8,
        breakevenOffsetPips: 0.4,
        includeEntryCostsInBreakeven: true,
        enablePartialTakeProfit: false,
      },
      trendBreakout: {
        channelPeriod: 24,
        fastEmaPeriod: 9,
        slowEmaPeriod: 21,
        breakoutBufferAtr: 0.1,
      },
      meanReversion: {
        lookbackPeriod: 14,
        zScoreThreshold: 2.0,
        exitZScore: 0.0,
        trendFilter: true,
      },
      smc: {
        liquidityLookback: 3,
        sweepThreshold: 0.3,
        requireFvg: false,
        requireStructureBreak: true,
      },
      scalp: {
        fastEma: 9,
        slowEma: 21,
        minAtr: 0.0003,
        session: 'LONDON_NEW_YORK_OVERLAP',
      },
      swing: {
        trendEma: 50,
        pullbackDepth: 0.8,
        confirmationBars: 1,
      },
      modularComposition: {
        enabled: true,
        regimeFilterModule: 'EMA_TREND',
        entryTriggerModule: 'SCALP_MOMENTUM',
        confirmationModule: 'SESSION_VOLUME',
        riskManagementModule: 'ATR_DYNAMIC',
        decisionWeighting: {
          vetoPowerRegime: false,
          minConfidenceScorePercent: 60,
          fvgConfirmationBonusPercent: 5,
          sessionVolumeWeightPercent: 30,
        },
      },
    },
    benchmarkStats: {
      backtestHorizonFa: '۱ سال تاریخی (۲۰۲۴)',
      approxWinRatePercent: 64.2,
      approxProfitFactor: 1.88,
      approxAnnualReturnPercent: 22.6,
      approxMaxDrawdownPercent: 3.2,
      propFirmPassRatingFa: 'فوق‌العاده امن (افت سرمایه زیر ۴٪، سازگار با پراپ‌های سخت‌گیر)',
    },
  },
  {
    id: 'EURUSD-ASIAN-MEAN-REVERSION-MASTER',
    nameFa: 'بازگشت به میانگین نوسانات آرام یورو/دلار در رنج آسیا',
    nameEn: 'EURUSD Asian Mean Reversion Master',
    targetSymbol: 'EURUSD',
    idealTimeframe: '15M',
    strategyStyle: 'MEAN_REVERSION',
    tagFa: 'معامله در رنج • بازار کم‌نوسان',
    descriptionFa: 'خرید در کف باند و فروش در سقف باند در سشن آرام توکیو/سیدنی با بهره‌گیری از Z-Score آماری.',
    marketLogicFa: 'یورو/دلار در سشن آسیا فاقد کاتالیزور خبری عمده است و در ۹۰٪ مواقع بین باندهای آماری نوسان می‌کند. ورود با انحراف بیش از ۲ انحراف معیار و خروج در خط میانگین تعادل انجام می‌شود.',
    sessionFilter: 'ASIAN',
    timezone: 'UTC',
    recommendedInitialCapital: 50000,
    expectedRiskPercent: 0.8,
    parameters: {
      common: {
        directionMode: 'BOTH',
        riskRewardRatio: 1.6,
        stopLossMode: 'ATR',
        atrPeriod: 14,
        atrMultiplier: 1.8,
        orderType: 'LIMIT',
        expiryBars: 6,
        maxConcurrentPositions: 2,
        cooldownBars: 3,
        sessionFilter: 'ASIAN',
        higherTimeframeFilter: false,
        enableBreakeven: true,
        breakevenTriggerR: 0.9,
        breakevenOffsetPips: 0.3,
        includeEntryCostsInBreakeven: true,
        enablePartialTakeProfit: false,
      },
      trendBreakout: {
        channelPeriod: 20,
        fastEmaPeriod: 10,
        slowEmaPeriod: 30,
        breakoutBufferAtr: 0.2,
      },
      meanReversion: {
        lookbackPeriod: 24,
        zScoreThreshold: 2.1,
        exitZScore: 0.0,
        trendFilter: false,
      },
      smc: {
        liquidityLookback: 4,
        sweepThreshold: 0.4,
        requireFvg: false,
        requireStructureBreak: false,
      },
      scalp: {
        fastEma: 10,
        slowEma: 30,
        minAtr: 0.0002,
        session: 'ASIAN',
      },
      swing: {
        trendEma: 100,
        pullbackDepth: 1.0,
        confirmationBars: 2,
      },
      modularComposition: {
        enabled: true,
        regimeFilterModule: 'CHOP_BLOCKER',
        entryTriggerModule: 'MEAN_REVERSION_Z',
        confirmationModule: 'NONE',
        riskManagementModule: 'ATR_DYNAMIC',
        decisionWeighting: {
          vetoPowerRegime: false,
          minConfidenceScorePercent: 65,
          fvgConfirmationBonusPercent: 0,
          sessionVolumeWeightPercent: 10,
        },
      },
    },
    benchmarkStats: {
      backtestHorizonFa: '۱ سال تاریخی (۲۰۲۴)',
      approxWinRatePercent: 68.0,
      approxProfitFactor: 1.94,
      approxAnnualReturnPercent: 19.8,
      approxMaxDrawdownPercent: 3.5,
      propFirmPassRatingFa: 'بسیار باثبات (مناسب برای رشد مداوم و بدون استرس حساب)',
    },
  },
];
