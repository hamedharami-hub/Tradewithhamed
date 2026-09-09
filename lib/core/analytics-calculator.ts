import { TradePosition, StrategyPerformanceStats } from '../contracts/journal';
import { SymbolId } from '../contracts/market';

/**
 * محاسبه کاملاً قطعی، ایزوله و مستقل شاخص‌های آماری استراتژی بر مبنای پوزیشن‌های بسته‌شده
 */
export function calculateStrategyStatistics(
  closedPositions: TradePosition[],
  initialEquity = 10000
): StrategyPerformanceStats {
  const bySymbol: Record<
    SymbolId,
    {
      tradesCount: number;
      winRatePercent: number;
      netProfit: number;
      profitFactor: number;
      grossWins: number;
      grossLosses: number;
      winsCount: number;
    }
  > = {
    XAUUSD: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0, grossWins: 0, grossLosses: 0, winsCount: 0 },
    EURUSD: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0, grossWins: 0, grossLosses: 0, winsCount: 0 },
    GBPUSD: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0, grossWins: 0, grossLosses: 0, winsCount: 0 },
    USDJPY: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0, grossWins: 0, grossLosses: 0, winsCount: 0 },
    BTCUSD: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0, grossWins: 0, grossLosses: 0, winsCount: 0 },
  };

  if (closedPositions.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      breakEvenTrades: 0,
      winRatePercent: 0,
      profitFactor: 0,
      totalNetProfit: 0,
      totalGrossProfit: 0,
      totalLoss: 0,
      totalCommissions: 0,
      averageWinAmount: 0,
      averageLossAmount: 0,
      averageRMultiple: 0,
      expectancyDollar: 0,
      expectancyR: 0,
      maxDrawdownDollar: 0,
      maxDrawdownPercent: 0,
      bySymbol: {
        XAUUSD: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0 },
        EURUSD: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0 },
        GBPUSD: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0 },
        USDJPY: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0 },
        BTCUSD: { tradesCount: 0, winRatePercent: 0, netProfit: 0, profitFactor: 0 },
      },
    };
  }

  let totalGrossProfit = 0;
  let totalLoss = 0;
  let totalNetProfit = 0;
  let totalCommissions = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let breakEvenTrades = 0;
  let sumWinR = 0;
  let sumLossR = 0;
  let sumRTotal = 0;

  let currentEquity = initialEquity;
  let peakEquity = initialEquity;
  let maxDrawdownDollar = 0;
  let maxDrawdownPercent = 0;

  for (const pos of closedPositions) {
    const net = pos.realizedNetPnL ?? 0;
    const gross = pos.realizedGrossPnL ?? 0;
    const comm = pos.brokerCommission ?? 0;
    const r = pos.realizedRMultiple ?? 0;

    totalNetProfit += net;
    totalCommissions += comm;
    sumRTotal += r;

    const symStats = bySymbol[pos.symbol];
    if (symStats) {
      symStats.tradesCount++;
      symStats.netProfit += net;
    }

    if (net > 0.001) {
      winningTrades++;
      totalGrossProfit += gross;
      sumWinR += r;
      if (symStats) {
        symStats.winsCount++;
        symStats.grossWins += gross;
      }
    } else if (net < -0.001) {
      losingTrades++;
      totalLoss += Math.abs(gross);
      sumLossR += Math.abs(r);
      if (symStats) {
        symStats.grossLosses += Math.abs(gross);
      }
    } else {
      breakEvenTrades++;
    }

    currentEquity += net;
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    } else {
      const ddDollar = peakEquity - currentEquity;
      const ddPercent = peakEquity > 0 ? (ddDollar / peakEquity) * 100 : 0;
      if (ddDollar > maxDrawdownDollar) {
        maxDrawdownDollar = ddDollar;
      }
      if (ddPercent > maxDrawdownPercent) {
        maxDrawdownPercent = ddPercent;
      }
    }
  }

  const totalTrades = closedPositions.length;
  const winRatePercent = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  let profitFactor = 0;
  if (totalLoss > 0) {
    profitFactor = totalGrossProfit / totalLoss;
  } else if (totalGrossProfit > 0) {
    profitFactor = 99.9;
  }

  const averageWinAmount = winningTrades > 0 ? totalGrossProfit / winningTrades : 0;
  const averageLossAmount = losingTrades > 0 ? totalLoss / losingTrades : 0;
  const averageRMultiple = totalTrades > 0 ? sumRTotal / totalTrades : 0;

  const winRateRatio = totalTrades > 0 ? winningTrades / totalTrades : 0;
  const lossRateRatio = totalTrades > 0 ? losingTrades / totalTrades : 0;
  const avgWinR = winningTrades > 0 ? sumWinR / winningTrades : 0;
  const avgLossR = losingTrades > 0 ? sumLossR / losingTrades : 0;

  const expectancyDollar =
    winRateRatio * averageWinAmount - lossRateRatio * averageLossAmount - totalCommissions / totalTrades;
  const expectancyR = winRateRatio * avgWinR - lossRateRatio * avgLossR;

  const finalBySymbol: Record<
    SymbolId,
    {
      tradesCount: number;
      winRatePercent: number;
      netProfit: number;
      profitFactor: number;
    }
  > = {
    XAUUSD: {
      tradesCount: bySymbol.XAUUSD.tradesCount,
      winRatePercent:
        bySymbol.XAUUSD.tradesCount > 0 ? (bySymbol.XAUUSD.winsCount / bySymbol.XAUUSD.tradesCount) * 100 : 0,
      netProfit: Number(bySymbol.XAUUSD.netProfit.toFixed(2)),
      profitFactor:
        bySymbol.XAUUSD.grossLosses > 0
          ? Number((bySymbol.XAUUSD.grossWins / bySymbol.XAUUSD.grossLosses).toFixed(2))
          : bySymbol.XAUUSD.grossWins > 0
          ? 99.9
          : 0,
    },
    EURUSD: {
      tradesCount: bySymbol.EURUSD.tradesCount,
      winRatePercent:
        bySymbol.EURUSD.tradesCount > 0 ? (bySymbol.EURUSD.winsCount / bySymbol.EURUSD.tradesCount) * 100 : 0,
      netProfit: Number(bySymbol.EURUSD.netProfit.toFixed(2)),
      profitFactor:
        bySymbol.EURUSD.grossLosses > 0
          ? Number((bySymbol.EURUSD.grossWins / bySymbol.EURUSD.grossLosses).toFixed(2))
          : bySymbol.EURUSD.grossWins > 0
          ? 99.9
          : 0,
    },
    GBPUSD: {
      tradesCount: bySymbol.GBPUSD.tradesCount,
      winRatePercent: bySymbol.GBPUSD.tradesCount > 0 ? (bySymbol.GBPUSD.winsCount / bySymbol.GBPUSD.tradesCount) * 100 : 0,
      netProfit: Number(bySymbol.GBPUSD.netProfit.toFixed(2)),
      profitFactor: bySymbol.GBPUSD.grossLosses > 0 ? Number((bySymbol.GBPUSD.grossWins / bySymbol.GBPUSD.grossLosses).toFixed(2)) : bySymbol.GBPUSD.grossWins > 0 ? 99.9 : 0,
    },
    USDJPY: {
      tradesCount: bySymbol.USDJPY.tradesCount,
      winRatePercent: bySymbol.USDJPY.tradesCount > 0 ? (bySymbol.USDJPY.winsCount / bySymbol.USDJPY.tradesCount) * 100 : 0,
      netProfit: Number(bySymbol.USDJPY.netProfit.toFixed(2)),
      profitFactor: bySymbol.USDJPY.grossLosses > 0 ? Number((bySymbol.USDJPY.grossWins / bySymbol.USDJPY.grossLosses).toFixed(2)) : bySymbol.USDJPY.grossWins > 0 ? 99.9 : 0,
    },
    BTCUSD: {
      tradesCount: bySymbol.BTCUSD.tradesCount,
      winRatePercent: bySymbol.BTCUSD.tradesCount > 0 ? (bySymbol.BTCUSD.winsCount / bySymbol.BTCUSD.tradesCount) * 100 : 0,
      netProfit: Number(bySymbol.BTCUSD.netProfit.toFixed(2)),
      profitFactor: bySymbol.BTCUSD.grossLosses > 0 ? Number((bySymbol.BTCUSD.grossWins / bySymbol.BTCUSD.grossLosses).toFixed(2)) : bySymbol.BTCUSD.grossWins > 0 ? 99.9 : 0,
    },
  };

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    breakEvenTrades,
    winRatePercent: Number(winRatePercent.toFixed(1)),
    profitFactor: Number(profitFactor.toFixed(2)),
    totalNetProfit: Number(totalNetProfit.toFixed(2)),
    totalGrossProfit: Number(totalGrossProfit.toFixed(2)),
    totalLoss: Number(totalLoss.toFixed(2)),
    totalCommissions: Number(totalCommissions.toFixed(2)),
    averageWinAmount: Number(averageWinAmount.toFixed(2)),
    averageLossAmount: Number(averageLossAmount.toFixed(2)),
    averageRMultiple: Number(averageRMultiple.toFixed(2)),
    expectancyDollar: Number(expectancyDollar.toFixed(2)),
    expectancyR: Number(expectancyR.toFixed(2)),
    maxDrawdownDollar: Number(maxDrawdownDollar.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    bySymbol: finalBySymbol,
  };
}
