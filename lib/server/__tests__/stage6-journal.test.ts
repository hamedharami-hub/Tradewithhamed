import { calculateStrategyStatistics } from '../../core/analytics-calculator';
import { JournalService } from '../journal-service';
import { TradePosition } from '../../contracts/journal';
import { TransactionalOutboxRecord } from '../../contracts/execution';

export interface Stage6TestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runStage6JournalTests(): Promise<Stage6TestResult[]> {
  const results: Stage6TestResult[] = [];

  // ۱. آزمون محاسبات آماری قطعی استراتژی (Deterministic Analytics)
  try {
    const mockTrades: TradePosition[] = [
      {
        positionId: 'T1',
        intentId: 'I1',
        correlationId: 'C1',
        causationId: 'CA1',
        symbol: 'XAUUSD',
        direction: 'BUY',
        volumeLots: 0.04,
        entryPrice: 2640,
        stopLossPrice: 2635,
        takeProfitPrice: 2655,
        status: 'CLOSED_PROFIT',
        openedAt: 1000,
        closedAt: 2000,
        exitPrice: 2655,
        exitReason: 'TP_HIT',
        realizedGrossPnL: 60,
        brokerCommission: 0.24,
        realizedNetPnL: 59.76,
        realizedRMultiple: 3.0,
        plannedRiskAmount: 20,
      },
      {
        positionId: 'T2',
        intentId: 'I2',
        correlationId: 'C2',
        causationId: 'CA2',
        symbol: 'XAUUSD',
        direction: 'BUY',
        volumeLots: 0.04,
        entryPrice: 2640,
        stopLossPrice: 2635,
        takeProfitPrice: 2655,
        status: 'CLOSED_LOSS',
        openedAt: 3000,
        closedAt: 4000,
        exitPrice: 2635,
        exitReason: 'SL_HIT',
        realizedGrossPnL: -20,
        brokerCommission: 0.24,
        realizedNetPnL: -20.24,
        realizedRMultiple: -1.0,
        plannedRiskAmount: 20,
      },
    ];

    const stats = calculateStrategyStatistics(mockTrades, 10000);
    const winRateExpected = 50.0;
    const profitFactorExpected = 3.0;
    const netProfitExpected = 39.52;

    const passed =
      stats.winRatePercent === winRateExpected &&
      stats.profitFactor === profitFactorExpected &&
      Math.abs(stats.totalNetProfit - netProfitExpected) < 0.01;

    results.push({
      name: 'Deterministic Strategy Statistical Evaluation (Win Rate, Profit Factor, Net PnL)',
      passed,
      details: `Win Rate: ${stats.winRatePercent}%, Profit Factor: ${stats.profitFactor}, Net PnL: $${stats.totalNetProfit}`,
    });
  } catch (err) {
    results.push({
      name: 'Deterministic Strategy Statistical Evaluation (Win Rate, Profit Factor, Net PnL)',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. آزمون محاسبه افت سرمایه (Drawdown Calculation)
  try {
    const drawdownTrades: TradePosition[] = [
      {
        positionId: 'D1',
        intentId: 'I1',
        correlationId: 'C1',
        causationId: 'CA1',
        symbol: 'XAUUSD',
        direction: 'BUY',
        volumeLots: 0.02,
        entryPrice: 2640,
        stopLossPrice: 2635,
        takeProfitPrice: 2655,
        status: 'CLOSED_PROFIT',
        openedAt: 1000,
        closedAt: 2000,
        exitPrice: 2655,
        exitReason: 'TP_HIT',
        realizedGrossPnL: 50,
        brokerCommission: 0.2,
        realizedNetPnL: 49.8,
        realizedRMultiple: 2.5,
        plannedRiskAmount: 20,
      },
      {
        positionId: 'D2',
        intentId: 'I2',
        correlationId: 'C2',
        causationId: 'CA2',
        symbol: 'XAUUSD',
        direction: 'SELL',
        volumeLots: 0.02,
        entryPrice: 2640,
        stopLossPrice: 2645,
        takeProfitPrice: 2625,
        status: 'CLOSED_LOSS',
        openedAt: 3000,
        closedAt: 4000,
        exitPrice: 2645,
        exitReason: 'SL_HIT',
        realizedGrossPnL: -30,
        brokerCommission: 0.2,
        realizedNetPnL: -30.2,
        realizedRMultiple: -1.5,
        plannedRiskAmount: 20,
      },
    ];

    const stats = calculateStrategyStatistics(drawdownTrades, 10000);
    const passed = stats.maxDrawdownDollar > 0 && stats.maxDrawdownPercent > 0;

    results.push({
      name: 'Peak-to-Trough Drawdown Evaluation',
      passed,
      details: `Max Drawdown: $${stats.maxDrawdownDollar} (${stats.maxDrawdownPercent}%)`,
    });
  } catch (err) {
    results.push({
      name: 'Peak-to-Trough Drawdown Evaluation',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. آزمون زنجیره ردیابی و ممیزی تغییرناپذیر ژورنال (Immutable Audit Log)
  try {
    const initialLogCount = JournalService.getAuditLogs().length;

    JournalService.recordAuditLog({
      eventType: 'USER_EXPLICIT_CONFIRMED',
      intentId: 'INT-TEST-AUDIT-1',
      correlationId: 'CORR-TEST-1',
      causationId: 'CAUSE-TEST-1',
      details: 'تأییدیه کاربر با رعایت حد ریسک و ستاپ S0 ثبت گردید.',
      severity: 'INFO',
    });

    const newLogs = JournalService.getAuditLogs();
    const latest = newLogs[0];
    const passed =
      newLogs.length === initialLogCount + 1 &&
      latest.intentId === 'INT-TEST-AUDIT-1' &&
      latest.correlationId === 'CORR-TEST-1' &&
      latest.causationId === 'CAUSE-TEST-1';

    results.push({
      name: 'Immutable Audit Trail & Correlation Logging',
      passed,
      details: `شناسه رویداد: ${latest.eventId}، شناسه همبستگی: ${latest.correlationId}، سطح: ${latest.severity}`,
    });
  } catch (err) {
    results.push({
      name: 'Immutable Audit Trail & Correlation Logging',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. آزمون چرخه کامل پوزیشن: ایجاد پوزیشن از سفارش و بستن با حد سود (TP Hit)
  try {
    const mockRecord: TransactionalOutboxRecord = {
      intentId: 'INTENT-LIFECYCLE-1',
      correlationId: 'CORR-LIFE-1',
      causationId: 'CAUSE-LIFE-1',
      idempotencyKey: 'IDEMP-LIFE-1',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 0.04,
      limitPrice: 2640.0,
      stopLossPrice: 2635.0,
      takeProfitPrice: 2655.0,
      state: 'ACKNOWLEDGED',
      createdAt: Date.now(),
      submittedAt: Date.now(),
      isBrokerStopLossConfirmed: true,
      isBrokerTakeProfitConfirmed: true,
      accountType: 'DEMO',
      accountMaskedId: 'DEMO-****5678',
      brokerOrderId: 'CT-ORD-TEST-99',
    };

    const position = JournalService.createPositionFromOrder(mockRecord);
    const closed = JournalService.closePosition(position.positionId, 2655.0, 'TP_HIT');

    const passed =
      closed !== null &&
      closed.status === 'CLOSED_PROFIT' &&
      closed.exitReason === 'TP_HIT' &&
      closed.realizedRMultiple === 3.0 &&
      (closed.realizedNetPnL ?? 0) > 0;

    results.push({
      name: 'Position Lifecycle Management & R-Multiple Attribution',
      passed,
      details: `پوزیشن ${position.positionId} بسته شد | سود خالص: $${closed?.realizedNetPnL} (${closed?.realizedRMultiple}R)`,
    });
  } catch (err) {
    results.push({
      name: 'Position Lifecycle Management & R-Multiple Attribution',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
