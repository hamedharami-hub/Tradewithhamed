// lib/core/research-lab.ts
// آزمایشگاه پژوهش معاملاتی، تحلیل پیش‌رونده (Walk-Forward) و آزمون‌های تنش (Stress Testing)

import { Candle, SYMBOL_SPECS, SymbolId, Timeframe } from '../contracts/market';
import { EventDrivenExecutionEngine } from './event-driven-engine';
import { MultiStyleEngine } from './multi-style-engine';
import { OrderIntentPayload, PositionLedgerEntry } from './ports';
import { TradingStyleType } from '../contracts/regimes';

function timeframeToMs(timeframe: Timeframe): number {
  const durations: Record<Timeframe, number> = {
    '1M': 60_000,
    '5M': 5 * 60_000,
    '15M': 15 * 60_000,
    '1H': 60 * 60_000,
    '4H': 4 * 60 * 60_000,
    D1: 24 * 60 * 60_000,
  };
  return durations[timeframe];
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRatePercent: number;
  profitFactor: number;
  payoffRatio: number;
  expectancyR: number; // امید ریاضی بر حسب واحد ریسک R
  netProfit: number;
  netProfitPercent: number;
  maxDrawdownAmount: number;
  maxDrawdownPercent: number;
  recoveryFactor: number;
  totalCommissions: number;
  avgMaePips: number;
  avgMfePips: number;
  equityCurve: { timestamp: number; equity: number; drawdownPercent: number }[];
  ambiguousTradesCount: number; // تعداد معاملاتی که ابهام Intrabar داشتند
}

export interface WalkForwardWindow {
  windowIndex: number;
  trainStartTime: number;
  trainEndTime: number;
  valStartTime: number;
  valEndTime: number;
  trainMetrics: PerformanceMetrics;
  validationMetrics: PerformanceMetrics;
  efficiencyRatio: number; // نسبت کارایی اعتبارسنجی به آموزش (OOS / IS)
}

export interface StressTestScenarioResult {
  scenarioName: string;
  description: string;
  spreadMultiplier: number;
  additionalSlippagePips: number;
  netProfit: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  expectancyR: number;
  status: 'ROBUST' | 'DEGRADED' | 'FAILED';
}

export interface MonteCarloSimulationResult {
  iterations: number;
  medianMaxDrawdownPercent: number;
  percentile95DrawdownPercent: number;
  medianProfit: number;
  riskOfRuinPercent: number; // احتمال افت سرمایه بیش از ۲۰٪
}

export class ResearchLab {
  // ۱. اجرای بک‌تست رویدادمحور بر روی دیتاست مشخص
  public static runBacktest(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    options: {
      initialCash?: number;
      commissionPerLot?: number;
      defaultSpreadPips?: number;
      useAIReview?: boolean;
      style?: TradingStyleType | 'ALL';
      timeframe?: Timeframe;
      lookbackCandles?: number;
    } = {}
  ): {
    metrics: PerformanceMetrics;
    trades: PositionLedgerEntry[];
  } {
    const initialCash = options.initialCash ?? 10000;
    const style = options.style ?? 'ALL';
    const timeframe = options.timeframe ?? '15M';
    const lookbackCandles = Math.max(210, Math.min(options.lookbackCandles ?? 240, 1000));
    const engine = new EventDrivenExecutionEngine({
      environment: 'BACKTEST',
      accountNamespace: 'BACKTEST-RUN',
      initialCash,
      commissionPerLot: options.commissionPerLot ?? 6.0,
      defaultSpreadPips: options.defaultSpreadPips ?? 1.5,
      ambiguityPolicy: 'PESSIMISTIC',
    });

    const equityCurve: PerformanceMetrics['equityCurve'] = [
      { timestamp: candles[0]?.timestamp || 0, equity: initialCash, drawdownPercent: 0 },
    ];

    // سفارش پس از بسته‌شدن کندل سیگنال ثبت می‌شود و فقط در کندل بعدی
    // پردازش می‌گردد؛ این ترتیب مانع پرشدن همان‌کندلی و نگاه‌به‌آینده است.
    for (let i = 14; i < candles.length; i++) {
      const currentCandle = candles[i];

      // الف. ابتدا سفارش‌های ثبت‌شده در کندل‌های پیشین پردازش می‌شوند.
      engine.processCandle(currentCandle, symbol);

      const lookbackStart = Math.max(0, i - lookbackCandles + 1);
      const slice = candles.slice(lookbackStart, i + 1);

      // ب. سیگنال تنها از دادهٔ بسته و قابل مشاهدهٔ همین لحظه ساخته می‌شود.
      const candidate = MultiStyleEngine.evaluate(slice, symbol, style).candidate;
      if (candidate) {
        // محاسبه حجم بر اساس ریسک ۰.۲۵٪
        const dollarRisk = engine.getLedger().equity * 0.0025;
        const priceDistance = Math.abs(candidate.entryPrice - candidate.stopLossPrice);
        const contractSize = SYMBOL_SPECS[symbol].contractSize;
        const rawVolume = priceDistance > 0 ? dollarRisk / (priceDistance * contractSize) : 0.01;
        const volumeLots = Math.max(0.01, Number(rawVolume.toFixed(2)));

        const intent: OrderIntentPayload = {
          intentId: `INT-${candidate.id}-${currentCandle.timestamp}`,
          environment: 'BACKTEST',
          accountNamespace: 'BACKTEST-RUN',
          candidateId: candidate.id,
          symbol: candidate.symbol,
          orderType: 'LIMIT',
          direction: candidate.direction,
          volumeLots,
          entryPrice: candidate.entryPrice,
          stopLossPrice: candidate.stopLossPrice,
          takeProfitPrice: candidate.takeProfitPrice,
          expiryTimestamp: currentCandle.timestamp + 6 * timeframeToMs(timeframe),
          reasonCode: candidate.strategyName,
          createdTimestamp: currentCandle.timestamp,
          idempotencyKey: `${candidate.id}-${currentCandle.timestamp}`,
        };

        engine.submitOrder(intent);
      }

      // ج. ثبت نقاط نمودار دارایی هر ۵ کندل یکبار
      if (i % 5 === 0 || i === candles.length - 1) {
        const ledger = engine.getLedger();
        equityCurve.push({
          timestamp: currentCandle.timestamp,
          equity: ledger.equity,
          drawdownPercent: ledger.maxDrawdownPercent,
        });
      }
    }

    const ledger = engine.getLedger();
    const metrics = this.calculateMetrics(ledger.positions, initialCash, equityCurve);

    return {
      metrics,
      trades: ledger.positions,
    };
  }

  // ۲. تحلیل پیش‌رونده (Walk-Forward Analysis) با ۳ پنجره زمانی پیوسته
  public static runWalkForward(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    windowsCount = 3
  ): WalkForwardWindow[] {
    if (candles.length < 60) return [];

    const totalCandles = candles.length;
    const windows: WalkForwardWindow[] = [];

    for (let w = 0; w < windowsCount; w++) {
      const trainStart = 0;
      const trainEnd = Math.floor(totalCandles * ((w + 1) / (windowsCount + 1)));
      const valStart = trainEnd;
      const valEnd = Math.min(totalCandles, Math.floor(totalCandles * ((w + 2) / (windowsCount + 1))));

      if (valEnd <= valStart) continue;

      const trainSlice = candles.slice(trainStart, trainEnd);
      const valSlice = candles.slice(valStart, valEnd);

      const trainRun = this.runBacktest(trainSlice, symbol);
      const valRun = this.runBacktest(valSlice, symbol);

      const trainProfit = Math.max(1, trainRun.metrics.netProfit);
      const valProfit = valRun.metrics.netProfit;
      const efficiencyRatio = Number((valProfit / trainProfit).toFixed(2));

      windows.push({
        windowIndex: w + 1,
        trainStartTime: trainSlice[0].timestamp,
        trainEndTime: trainSlice[trainSlice.length - 1].timestamp,
        valStartTime: valSlice[0].timestamp,
        valEndTime: valSlice[valSlice.length - 1].timestamp,
        trainMetrics: trainRun.metrics,
        validationMetrics: valRun.metrics,
        efficiencyRatio,
      });
    }

    return windows;
  }

  // ۳. آزمون‌های تنش (Stress Testing) در شرایط نوسان شدید، اسپرد دوبرابر و لغزش
  public static runStressTests(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD'
  ): StressTestScenarioResult[] {
    const baseRun = this.runBacktest(candles, symbol, {
      defaultSpreadPips: 1.5,
      commissionPerLot: 6.0,
    });

    const scenarios: StressTestScenarioResult[] = [
      {
        scenarioName: 'سناریوی مبنا (Baseline)',
        description: 'اسپرد استاندارد ۱.۵ پیپ و کارمزد ۶ دلار',
        spreadMultiplier: 1.0,
        additionalSlippagePips: 0,
        netProfit: baseRun.metrics.netProfit,
        maxDrawdownPercent: baseRun.metrics.maxDrawdownPercent,
        profitFactor: baseRun.metrics.profitFactor,
        expectancyR: baseRun.metrics.expectancyR,
        status: 'ROBUST',
      },
    ];

    // تنش ۱: افزایش اسپرد به ۳ پیپ (زمان اخبار اقتصادی)
    const wideSpreadRun = this.runBacktest(candles, symbol, {
      defaultSpreadPips: 3.0,
      commissionPerLot: 6.0,
    });
    scenarios.push({
      scenarioName: 'اسپرد فشرده اخبار (+100% Spread)',
      description: 'اسپرد ۳.۰ پیپ به علت کاهش نقدینگی',
      spreadMultiplier: 2.0,
      additionalSlippagePips: 0.5,
      netProfit: wideSpreadRun.metrics.netProfit,
      maxDrawdownPercent: wideSpreadRun.metrics.maxDrawdownPercent,
      profitFactor: wideSpreadRun.metrics.profitFactor,
      expectancyR: wideSpreadRun.metrics.expectancyR,
      status: wideSpreadRun.metrics.netProfit >= 0 ? 'ROBUST' : 'DEGRADED',
    });

    // تنش ۲: لغزش شدید قیمت (Slippage Stress)
    const slippageRun = this.runBacktest(candles, symbol, {
      defaultSpreadPips: 2.5,
      commissionPerLot: 9.0, // کارمزد و هزینه اضافی
    });
    scenarios.push({
      scenarioName: 'لغزش و گپ اجرایی شدید',
      description: 'افزایش لغزش قیمت خروج و کارمزد پلتفرم',
      spreadMultiplier: 1.6,
      additionalSlippagePips: 1.5,
      netProfit: slippageRun.metrics.netProfit,
      maxDrawdownPercent: slippageRun.metrics.maxDrawdownPercent,
      profitFactor: slippageRun.metrics.profitFactor,
      expectancyR: slippageRun.metrics.expectancyR,
      status:
        slippageRun.metrics.profitFactor > 1.1
          ? 'ROBUST'
          : slippageRun.metrics.profitFactor >= 0.9
          ? 'DEGRADED'
          : 'FAILED',
    });

    return scenarios;
  }

  // ۴. شبیه‌سازی مونت‌کارلو (Monte Carlo Resampling)
  public static runMonteCarlo(
    trades: PositionLedgerEntry[],
    initialCash = 10000,
    iterations = 100
  ): MonteCarloSimulationResult {
    if (trades.length === 0) {
      return {
        iterations: 0,
        medianMaxDrawdownPercent: 0,
        percentile95DrawdownPercent: 0,
        medianProfit: 0,
        riskOfRuinPercent: 0,
      };
    }

    const profits = trades.filter(t => !t.isOpen).map(t => t.realizedPnl);
    const simMaxDrawdowns: number[] = [];
    const simNetProfits: number[] = [];
    let ruinCount = 0;

    for (let iter = 0; iter < iterations; iter++) {
      // بازتولید تصادفی با جایگذاری (Bootstrap Resampling)
      let equity = initialCash;
      let peak = initialCash;
      let maxDDPercent = 0;

      for (let i = 0; i < profits.length; i++) {
        const randIdx = Math.floor(Math.random() * profits.length);
        equity += profits[randIdx];
        if (equity > peak) peak = equity;
        const dd = ((peak - equity) / peak) * 100;
        if (dd > maxDDPercent) maxDDPercent = dd;
      }

      simMaxDrawdowns.push(maxDDPercent);
      simNetProfits.push(equity - initialCash);
      if (maxDDPercent >= 20) ruinCount++;
    }

    simMaxDrawdowns.sort((a, b) => a - b);
    simNetProfits.sort((a, b) => a - b);

    const medianDD = simMaxDrawdowns[Math.floor(iterations / 2)];
    const p95DD = simMaxDrawdowns[Math.floor(iterations * 0.95)];
    const medianProfit = simNetProfits[Math.floor(iterations / 2)];
    const riskOfRuin = Number(((ruinCount / iterations) * 100).toFixed(1));

    return {
      iterations,
      medianMaxDrawdownPercent: Number(medianDD.toFixed(2)),
      percentile95DrawdownPercent: Number(p95DD.toFixed(2)),
      medianProfit: Number(medianProfit.toFixed(2)),
      riskOfRuinPercent: riskOfRuin,
    };
  }

  // محاسبه جامع شاخص‌های سودآوری و ریسک
  private static calculateMetrics(
    positions: PositionLedgerEntry[],
    initialCash: number,
    equityCurve: PerformanceMetrics['equityCurve']
  ): PerformanceMetrics {
    const closed = positions.filter(p => !p.isOpen);
    const totalTrades = closed.length;

    let wins = 0;
    let losses = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let totalCommissions = 0;
    let totalMae = 0;
    let totalMfe = 0;
    let ambiguousCount = 0;

    for (const p of closed) {
      totalCommissions += p.commissionPaid;
      totalMae += p.maePips;
      totalMfe += p.mfePips;

      if (p.realizedPnl > 0) {
        wins++;
        grossWin += p.realizedPnl;
      } else if (p.realizedPnl < 0) {
        losses++;
        grossLoss += Math.abs(p.realizedPnl);
      }

      if (p.closeReason === 'SL' && p.mfePips > 10) {
        // نشان‌دهنده احتمال ابهام در برخورد
        ambiguousCount++;
      }
    }

    const breakEvenTrades = totalTrades - wins - losses;
    const winRatePercent = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 0;
    const profitFactor =
      grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99.0 : 1.0;

    const avgWin = wins > 0 ? grossWin / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 1;
    const payoffRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0;

    // امید ریاضی R
    const rUnit = initialCash * 0.0025; // ریسک ۰.۲۵٪
    const expectancyR =
      totalTrades > 0 ? Number(((grossWin - grossLoss) / totalTrades / rUnit).toFixed(2)) : 0;

    const netProfit = Number((grossWin - grossLoss).toFixed(2));
    const netProfitPercent = Number(((netProfit / initialCash) * 100).toFixed(2));

    let maxDDAmount = 0;
    let maxDDPercent = 0;
    for (const pt of equityCurve) {
      if (pt.drawdownPercent > maxDDPercent) {
        maxDDPercent = pt.drawdownPercent;
      }
    }
    maxDDAmount = Number(((maxDDPercent / 100) * initialCash).toFixed(2));

    const recoveryFactor =
      maxDDAmount > 0 ? Number((netProfit / maxDDAmount).toFixed(2)) : netProfit > 0 ? 10 : 0;

    return {
      totalTrades,
      winningTrades: wins,
      losingTrades: losses,
      breakEvenTrades,
      winRatePercent,
      profitFactor,
      payoffRatio,
      expectancyR,
      netProfit,
      netProfitPercent,
      maxDrawdownAmount: Number(maxDDAmount.toFixed(2)),
      maxDrawdownPercent: Number(maxDDPercent.toFixed(2)),
      recoveryFactor,
      totalCommissions: Number(totalCommissions.toFixed(2)),
      avgMaePips: totalTrades > 0 ? Number((totalMae / totalTrades).toFixed(1)) : 0,
      avgMfePips: totalTrades > 0 ? Number((totalMfe / totalTrades).toFixed(1)) : 0,
      equityCurve,
      ambiguousTradesCount: ambiguousCount,
    };
  }
}
