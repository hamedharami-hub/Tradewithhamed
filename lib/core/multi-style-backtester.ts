// lib/core/multi-style-backtester.ts
// موتور جامع بک‌تست تاریخی چند سبکه همراه با اعتبارسنجی شورای هوش مصنوعی و مونت‌کارلو
// شبیه‌سازی دقیق اسپرد، اسلیپیج، خروج پله‌ای ۵۰٪ در ۱.۲R و ریسک‌فری خودکار

import { Candle, SymbolId, Timeframe } from '../contracts/market';
import { MarketRegimeType, TradingStyleType } from '../contracts/regimes';
import {
  BacktestConfig,
  DEFAULT_BACKTEST_CONFIG,
  BacktestReport,
  BacktestTrade,
  EquityCurvePoint,
  BacktestExitReason,
} from '../contracts/backtester';
import { MarketRegimeClassifier } from './market-regime-classifier';
import { MultiStyleEngine } from './multi-style-engine';
import { MultiAgentOrchestrator } from './multi-agent-orchestrator';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../contracts/multi-agent-system';
import { MonteCarloSimulator } from './monte-carlo-simulator';

interface ActivePosition {
  tradeId: string;
  candidateId: string;
  symbol: SymbolId;
  style: TradingStyleType;
  regime: MarketRegimeType;
  direction: 'BUY' | 'SELL';
  entryIndex: number;
  entryTimestamp: number;
  entryPrice: number;
  currentStopLossPrice: number;
  initialStopLossPrice: number;
  fullTakeProfitPrice: number;
  partialTpPrice: number;
  totalVolumeLots: number;
  remainingVolumeLots: number;
  isPartialClosed: boolean;
  alphaConsensusScore: number;
  monteCarloTpProbability: number;
}

export class MultiStyleBacktester {
  public static runBacktest(
    candles: Candle[],
    userConfig: Partial<BacktestConfig> = {}
  ): BacktestReport {
    const config: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG, ...userConfig };
    const contractMultiplier = config.symbol === 'XAUUSD' ? 100 : 100000;
    const pipSize = config.symbol === 'XAUUSD' ? 0.1 : 0.0001;

    let currentCash = config.initialCapital;
    let peakEquity = currentCash;
    let maxDrawdownDollar = 0;
    let maxDrawdownPercent = 0;

    const completedTrades: BacktestTrade[] = [];
    const equityCurve: EquityCurvePoint[] = [
      { barIndex: 0, timestamp: candles[0]?.timestamp || 0, equity: currentCash, drawdownPercent: 0 },
    ];

    let activePos: ActivePosition | null = null;
    const tradeReturns: number[] = [];

    const startIdx = Math.min(20, Math.floor(candles.length / 4));

    for (let i = startIdx; i < candles.length; i++) {
      const currentCandle = candles[i];
      const slice = candles.slice(0, i + 1);

      // ۱. بررسی و به‌روزرسانی پوزیشن فعال در صورت وجود
      if (activePos) {
        const isBuy = activePos.direction === 'BUY';
        let exitReason: BacktestExitReason | null = null;
        let exitPrice = 0;
        let isFinalExit = false;

        // الف. بررسی برخورد با حد ضرر (Stop Loss)
        const hitSL = isBuy
          ? currentCandle.low <= activePos.currentStopLossPrice
          : currentCandle.high >= activePos.currentStopLossPrice;

        if (hitSL) {
          exitPrice = activePos.currentStopLossPrice;
          exitReason = activePos.isPartialClosed ? 'TP_PARTIAL_RUNNER_BE' : 'SL';
          isFinalExit = true;
        }

        // ب. بررسی خروج پله‌ای ۵۰٪ (Partial Take Profit at 1.2R)
        if (!isFinalExit && config.enablePartialTp && !activePos.isPartialClosed) {
          const hitPartialTP = isBuy
            ? currentCandle.high >= activePos.partialTpPrice
            : currentCandle.low <= activePos.partialTpPrice;

          if (hitPartialTP) {
            const closedLots = activePos.totalVolumeLots * 0.5;
            const diffPrice = isBuy
              ? activePos.partialTpPrice - activePos.entryPrice
              : activePos.entryPrice - activePos.partialTpPrice;
            const partialDollar = diffPrice * closedLots * contractMultiplier;

            currentCash += partialDollar;
            activePos.remainingVolumeLots = activePos.totalVolumeLots - closedLots;
            activePos.isPartialClosed = true;

            activePos.currentStopLossPrice = isBuy
              ? activePos.entryPrice + (config.spreadPips * pipSize)
              : activePos.entryPrice - (config.spreadPips * pipSize);
          }
        }

        // ج. بررسی برخورد با حد سود نهایی (Full Take Profit)
        if (!isFinalExit) {
          const hitFullTP = isBuy
            ? currentCandle.high >= activePos.fullTakeProfitPrice
            : currentCandle.low <= activePos.fullTakeProfitPrice;

          if (hitFullTP) {
            exitPrice = activePos.fullTakeProfitPrice;
            exitReason = activePos.isPartialClosed ? 'TP_PARTIAL_RUNNER_TP' : 'TP_FULL';
            isFinalExit = true;
          }
        }

        // د. خروج به علت منقضی شدن زمان نگهداشت (۵۰ کندل)
        if (!isFinalExit && (i - activePos.entryIndex) >= 50) {
          exitPrice = currentCandle.close;
          exitReason = 'TIMEOUT_CLOSE';
          isFinalExit = true;
        }

        // ثبت معامله بسته شده
        if (isFinalExit && exitReason) {
          const exitLots = activePos.remainingVolumeLots;
          const diff = isBuy ? (exitPrice - activePos.entryPrice) : (activePos.entryPrice - exitPrice);
          const finalSliceDollar = diff * exitLots * contractMultiplier;

          currentCash += finalSliceDollar;

          const totalPnlDollar = isBuy
            ? ((exitPrice - activePos.entryPrice) * activePos.remainingVolumeLots +
               (activePos.isPartialClosed ? (activePos.partialTpPrice - activePos.entryPrice) * (activePos.totalVolumeLots * 0.5) : 0)) * contractMultiplier
            : ((activePos.entryPrice - exitPrice) * activePos.remainingVolumeLots +
               (activePos.isPartialClosed ? (activePos.entryPrice - activePos.partialTpPrice) * (activePos.totalVolumeLots * 0.5) : 0)) * contractMultiplier;

          const pnlPercent = (totalPnlDollar / currentCash) * 100;
          const riskDistance = Math.abs(activePos.entryPrice - activePos.initialStopLossPrice);
          const rrAchieved = riskDistance > 0 ? (totalPnlDollar / (riskDistance * activePos.totalVolumeLots * contractMultiplier)) : 0;

          completedTrades.push({
            id: activePos.tradeId,
            candidateId: activePos.candidateId,
            symbol: activePos.symbol,
            style: activePos.style,
            regime: activePos.regime,
            direction: activePos.direction,
            entryIndex: activePos.entryIndex,
            entryTimestamp: activePos.entryTimestamp,
            entryPrice: activePos.entryPrice,
            stopLossPrice: activePos.initialStopLossPrice,
            takeProfitPrice: activePos.fullTakeProfitPrice,
            volumeLots: activePos.totalVolumeLots,
            exitIndex: i,
            exitTimestamp: currentCandle.timestamp,
            exitPrice,
            exitReason,
            pnlDollar: Number(totalPnlDollar.toFixed(2)),
            pnlPercent: Number(pnlPercent.toFixed(2)),
            riskRewardAchieved: Number(rrAchieved.toFixed(2)),
            holdingBars: i - activePos.entryIndex,
            alphaConsensusScore: activePos.alphaConsensusScore,
            monteCarloTpProbability: activePos.monteCarloTpProbability,
          });

          tradeReturns.push(pnlPercent);
          activePos = null;

          if (currentCash > peakEquity) peakEquity = currentCash;
          const currentDdDollar = peakEquity - currentCash;
          const currentDdPercent = peakEquity > 0 ? (currentDdDollar / peakEquity) * 100 : 0;
          if (currentDdDollar > maxDrawdownDollar) maxDrawdownDollar = currentDdDollar;
          if (currentDdPercent > maxDrawdownPercent) maxDrawdownPercent = currentDdPercent;

          equityCurve.push({
            barIndex: i,
            timestamp: currentCandle.timestamp,
            equity: Number(currentCash.toFixed(2)),
            drawdownPercent: Number(currentDdPercent.toFixed(2)),
          });
        }
      }

      // ۲. بررسی فرصت ورود جدید (در صورت عدم وجود پوزیشن باز)
      if (!activePos) {
        const evalRes = MultiStyleEngine.evaluate(slice, config.symbol, config.style);
        const regimeAnalysis = evalRes.regime;
        const candidate = evalRes.candidate;

        if (candidate) {
          const councilRes = MultiAgentOrchestrator.evaluateCandidate(candidate, {
            ...DEFAULT_MULTI_AGENT_CONFIG,
            judgeEngineId: 'alpha-consensus-quorum-judge',
          });

          const councilScore = councilRes.councilConsensus?.alphaConsensusScore ?? 0;
          const quorumReached = councilRes.councilConsensus?.quorumReached ?? false;

          const passesCouncil = councilScore >= config.minAlphaConsensusScore &&
            (!config.requireQuorum || quorumReached);

          if (passesCouncil) {
            const mcRes = MonteCarloSimulator.simulate({
              initialPrice: candidate.entryPrice,
              targetPrice: candidate.takeProfitPrice,
              stopLossPrice: candidate.stopLossPrice,
              iterations: 200,
              stepsPerPath: 30,
              volatility: regimeAnalysis.metrics.atrRatio > 1.5 ? 0.02 : 0.01,
            });

            if (mcRes.probabilityHittingTarget >= config.minMonteCarloTpProbability) {
              const dollarRisk = currentCash * (config.riskPerTradePercent / 100);
              const priceDistance = Math.abs(candidate.entryPrice - candidate.stopLossPrice);
              const rawVolume = priceDistance > 0 ? dollarRisk / (priceDistance * contractMultiplier) : 0.01;
              const volumeLots = Math.max(0.01, Number(rawVolume.toFixed(2)));

              const isBuy = candidate.direction === 'BUY';
              const executedEntry = isBuy
                ? candidate.entryPrice + (config.slippagePips * pipSize)
                : candidate.entryPrice - (config.slippagePips * pipSize);

              const partialTpDist = priceDistance * 1.2;
              const partialTpPrice = isBuy
                ? executedEntry + partialTpDist
                : executedEntry - partialTpDist;

              activePos = {
                tradeId: 'BT-' + candidate.id + '-' + currentCandle.timestamp,
                candidateId: candidate.id,
                symbol: config.symbol,
                style: candidate.style || 'SCALP_M1_M5',
                regime: regimeAnalysis.regime,
                direction: candidate.direction,
                entryIndex: i,
                entryTimestamp: currentCandle.timestamp,
                entryPrice: executedEntry,
                currentStopLossPrice: candidate.stopLossPrice,
                initialStopLossPrice: candidate.stopLossPrice,
                fullTakeProfitPrice: candidate.takeProfitPrice,
                partialTpPrice,
                totalVolumeLots: volumeLots,
                remainingVolumeLots: volumeLots,
                isPartialClosed: false,
                alphaConsensusScore: councilScore,
                monteCarloTpProbability: mcRes.probabilityHittingTarget,
              };
            }
          }
        }
      }
    }

    const totalTrades = completedTrades.length;
    const winningTrades = completedTrades.filter(t => t.pnlDollar > 0).length;
    const losingTrades = completedTrades.filter(t => t.pnlDollar < 0).length;
    const breakevenTrades = completedTrades.filter(t => t.pnlDollar === 0).length;
    const winRatePercent = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const grossProfit = completedTrades.reduce((acc, t) => t.pnlDollar > 0 ? acc + t.pnlDollar : acc, 0);
    const grossLoss = Math.abs(completedTrades.reduce((acc, t) => t.pnlDollar < 0 ? acc + t.pnlDollar : acc, 0));
    const netProfit = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 99.9 : 1.0);
    const expectedPayoff = totalTrades > 0 ? (netProfit / totalTrades) : 0;

    const avgReturn = tradeReturns.length > 0 ? (tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length) : 0;
    const stdDevReturn = tradeReturns.length > 1
      ? Math.sqrt(tradeReturns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / (tradeReturns.length - 1))
      : 1;
    const sharpeRatio = stdDevReturn > 0 ? Number(((avgReturn / stdDevReturn) * Math.sqrt(tradeReturns.length)).toFixed(2)) : 0;

    const avgHoldingBars = totalTrades > 0
      ? Math.round(completedTrades.reduce((a, t) => a + t.holdingBars, 0) / totalTrades)
      : 0;
    const avgRiskRewardRatio = totalTrades > 0
      ? Number((completedTrades.reduce((a, t) => a + t.riskRewardAchieved, 0) / totalTrades).toFixed(2))
      : 0;

    const regimePerformance: BacktestReport['regimePerformance'] = {};
    completedTrades.forEach(t => {
      if (!regimePerformance[t.regime]) {
        regimePerformance[t.regime] = { tradesCount: 0, winRate: 0, netProfit: 0 };
      }
      const perf = regimePerformance[t.regime]!;
      perf.tradesCount++;
      perf.netProfit += t.pnlDollar;
    });
    Object.keys(regimePerformance).forEach(rKey => {
      const reg = rKey as MarketRegimeType;
      const subset = completedTrades.filter(t => t.regime === reg);
      const wins = subset.filter(t => t.pnlDollar > 0).length;
      if (regimePerformance[reg]) {
        regimePerformance[reg]!.winRate = Number(((wins / subset.length) * 100).toFixed(1));
        regimePerformance[reg]!.netProfit = Number(regimePerformance[reg]!.netProfit.toFixed(2));
      }
    });

    const stylePerformance: BacktestReport['stylePerformance'] = {};
    completedTrades.forEach(t => {
      if (!stylePerformance[t.style]) {
        stylePerformance[t.style] = { tradesCount: 0, winRate: 0, netProfit: 0 };
      }
      const perf = stylePerformance[t.style]!;
      perf.tradesCount++;
      perf.netProfit += t.pnlDollar;
    });
    Object.keys(stylePerformance).forEach(sKey => {
      const st = sKey as TradingStyleType;
      const subset = completedTrades.filter(t => t.style === st);
      const wins = subset.filter(t => t.pnlDollar > 0).length;
      if (stylePerformance[st]) {
        stylePerformance[st]!.winRate = Number(((wins / subset.length) * 100).toFixed(1));
        stylePerformance[st]!.netProfit = Number(stylePerformance[st]!.netProfit.toFixed(2));
      }
    });

    const highProbTrades = completedTrades.filter(t => t.monteCarloTpProbability >= 65);
    const lowProbTrades = completedTrades.filter(t => t.monteCarloTpProbability < 65);
    const highProbWins = highProbTrades.filter(t => t.pnlDollar > 0).length;
    const lowProbWins = lowProbTrades.filter(t => t.pnlDollar > 0).length;

    const highProbWinRate = highProbTrades.length > 0 ? (highProbWins / highProbTrades.length) * 100 : 0;
    const lowProbWinRate = lowProbTrades.length > 0 ? (lowProbWins / lowProbTrades.length) * 100 : 0;

    return {
      config,
      summary: {
        totalTrades,
        winningTrades,
        losingTrades,
        breakevenTrades,
        winRatePercent: Number(winRatePercent.toFixed(1)),
        grossProfit: Number(grossProfit.toFixed(2)),
        grossLoss: Number(grossLoss.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        profitFactor: Number(profitFactor.toFixed(2)),
        maxDrawdownDollar: Number(maxDrawdownDollar.toFixed(2)),
        maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
        expectedPayoff: Number(expectedPayoff.toFixed(2)),
        sharpeRatio,
        avgHoldingBars,
        avgRiskRewardRatio,
      },
      equityCurve,
      regimePerformance,
      stylePerformance,
      monteCarloAccuracy: {
        highProbTradesCount: highProbTrades.length,
        highProbWinRate: Number(highProbWinRate.toFixed(1)),
        lowProbTradesCount: lowProbTrades.length,
        lowProbWinRate: Number(lowProbWinRate.toFixed(1)),
        correlationNoteFa: highProbWinRate >= lowProbWinRate
          ? 'توزیع مونت‌کارلو با موفقیت ستاپ‌های سودده را از زیان‌ده تفکیک کرد.'
          : 'نیاز به افزایش تعداد گام‌ها یا تنظیم مجدد نوسان‌پذیری محلی است.',
      },
      trades: completedTrades,
    };
  }
}
