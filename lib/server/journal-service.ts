import { TradePosition, JournalAuditEvent, StrategyPerformanceStats } from '../contracts/journal';
import { calculateStrategyStatistics } from '../core/analytics-calculator';
import { TransactionalOutboxRecord } from '../contracts/execution';

const globalForJournal = globalThis as unknown as {
  journalPositions?: Map<string, TradePosition>;
  journalAuditLogs?: JournalAuditEvent[];
};

const positionsMap = globalForJournal.journalPositions ?? new Map<string, TradePosition>();
const auditLogsArray = globalForJournal.journalAuditLogs ?? [];

if (!globalForJournal.journalPositions) {
  globalForJournal.journalPositions = positionsMap;
}
if (!globalForJournal.journalAuditLogs) {
  globalForJournal.journalAuditLogs = auditLogsArray;
}

const INITIAL_DEMO_POSITIONS: TradePosition[] = [
  {
    positionId: 'POS-DEMO-101',
    intentId: 'INTENT-HIST-1',
    correlationId: 'CORR-HIST-1',
    causationId: 'CAUSE-HIST-1',
    brokerOrderId: 'CT-ORD-110291',
    symbol: 'XAUUSD',
    direction: 'BUY',
    volumeLots: 0.04,
    entryPrice: 2638.5,
    stopLossPrice: 2633.5,
    takeProfitPrice: 2653.5,
    status: 'CLOSED_PROFIT',
    openedAt: 1725603600000,
    closedAt: 1725605700000,
    exitPrice: 2653.5,
    exitReason: 'TP_HIT',
    realizedGrossPnL: 60.0,
    brokerCommission: 0.24,
    realizedNetPnL: 59.76,
    realizedRMultiple: 3.0,
    plannedRiskAmount: 20.0,
  },
  {
    positionId: 'POS-DEMO-102',
    intentId: 'INTENT-HIST-2',
    correlationId: 'CORR-HIST-2',
    causationId: 'CAUSE-HIST-2',
    brokerOrderId: 'CT-ORD-110292',
    symbol: 'EURUSD',
    direction: 'SELL',
    volumeLots: 0.05,
    entryPrice: 1.0865,
    stopLossPrice: 1.0895,
    takeProfitPrice: 1.0775,
    status: 'CLOSED_LOSS',
    openedAt: 1725600600000,
    closedAt: 1725601800000,
    exitPrice: 1.0895,
    exitReason: 'SL_HIT',
    realizedGrossPnL: -15.0,
    brokerCommission: 0.3,
    realizedNetPnL: -15.3,
    realizedRMultiple: -1.0,
    plannedRiskAmount: 15.0,
  },
  {
    positionId: 'POS-DEMO-103',
    intentId: 'INTENT-HIST-3',
    correlationId: 'CORR-HIST-3',
    causationId: 'CAUSE-HIST-3',
    brokerOrderId: 'CT-ORD-110293',
    symbol: 'XAUUSD',
    direction: 'BUY',
    volumeLots: 0.03,
    entryPrice: 2642.0,
    stopLossPrice: 2637.0,
    takeProfitPrice: 2657.0,
    status: 'CLOSED_PROFIT',
    openedAt: 1725602400000,
    closedAt: 1725604500000,
    exitPrice: 2657.0,
    exitReason: 'TP_HIT',
    realizedGrossPnL: 45.0,
    brokerCommission: 0.18,
    realizedNetPnL: 44.82,
    realizedRMultiple: 3.0,
    plannedRiskAmount: 15.0,
  },
  {
    positionId: 'POS-DEMO-104',
    intentId: 'INTENT-HIST-4',
    correlationId: 'CORR-HIST-4',
    causationId: 'CAUSE-HIST-4',
    brokerOrderId: 'CT-ORD-110294',
    symbol: 'EURUSD',
    direction: 'BUY',
    volumeLots: 0.04,
    entryPrice: 1.0840,
    stopLossPrice: 1.0820,
    takeProfitPrice: 1.0900,
    status: 'CLOSED_PROFIT',
    openedAt: 1725603300000,
    closedAt: 1725605400000,
    exitPrice: 1.0900,
    exitReason: 'TP_HIT',
    realizedGrossPnL: 24.0,
    brokerCommission: 0.24,
    realizedNetPnL: 23.76,
    realizedRMultiple: 3.0,
    plannedRiskAmount: 8.0,
  },
];

if (positionsMap.size === 0) {
  INITIAL_DEMO_POSITIONS.forEach(pos => positionsMap.set(pos.positionId, pos));
  auditLogsArray.push({
    eventId: 'EVT-INIT-1',
    timestamp: 1725600000000,
    eventType: 'INTENT_CREATED',
    intentId: 'INTENT-HIST-1',
    correlationId: 'CORR-HIST-1',
    causationId: 'CAUSE-HIST-1',
    details: 'آماده‌سازی ژورنال با معاملات تاییدشده تاریخی برای ارزیابی آماری استراتژی S0',
    severity: 'INFO',
  });
}

export class JournalService {
  public static recordAuditLog(event: Omit<JournalAuditEvent, 'eventId' | 'timestamp'>): JournalAuditEvent {
    const fullEvent: JournalAuditEvent = {
      ...event,
      eventId: `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    auditLogsArray.push(fullEvent);
    return fullEvent;
  }

  public static createPositionFromOrder(record: TransactionalOutboxRecord): TradePosition {
    const positionId = `POS-${record.intentId.replace('INTENT-', '')}`;
    const plannedRisk = Math.abs(record.limitPrice - record.stopLossPrice) * record.volumeLots * (record.symbol === 'XAUUSD' ? 100 : 100000);

    const position: TradePosition = {
      positionId,
      intentId: record.intentId,
      correlationId: record.correlationId,
      causationId: record.causationId,
      brokerOrderId: record.brokerOrderId,
      symbol: record.symbol,
      direction: record.direction,
      volumeLots: record.volumeLots,
      entryPrice: record.limitPrice,
      stopLossPrice: record.stopLossPrice,
      takeProfitPrice: record.takeProfitPrice,
      status: 'OPEN',
      openedAt: Date.now(),
      brokerCommission: record.volumeLots * (record.symbol === 'XAUUSD' ? 6.0 : 6.0),
      plannedRiskAmount: Number(plannedRisk.toFixed(2)),
    };

    positionsMap.set(positionId, position);

    this.recordAuditLog({
      eventType: 'ORDER_FILLED',
      intentId: record.intentId,
      correlationId: record.correlationId,
      causationId: record.causationId,
      details: `پوزیشن ${positionId} به صورت OPEN در بروکر ایجاد و در ژورنال ثبت شد.`,
      severity: 'INFO',
    });

    return position;
  }

  public static closePosition(
    positionId: string,
    exitPrice: number,
    exitReason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE'
  ): TradePosition | null {
    const pos = positionsMap.get(positionId);
    if (!pos || pos.status !== 'OPEN') return null;

    const isBuy = pos.direction === 'BUY';
    const contractMultiplier = pos.symbol === 'XAUUSD' ? 100 : 100000;
    const priceDiff = isBuy ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
    const grossPnL = priceDiff * pos.volumeLots * contractMultiplier;
    const netPnL = grossPnL - pos.brokerCommission;

    const riskDistance = Math.abs(pos.entryPrice - pos.stopLossPrice);
    const realizedR = riskDistance > 0 ? (isBuy ? (exitPrice - pos.entryPrice) / riskDistance : (pos.entryPrice - exitPrice) / riskDistance) : 0;

    pos.status = netPnL > 0 ? 'CLOSED_PROFIT' : 'CLOSED_LOSS';
    pos.closedAt = Date.now();
    pos.exitPrice = exitPrice;
    pos.exitReason = exitReason;
    pos.realizedGrossPnL = Number(grossPnL.toFixed(2));
    pos.realizedNetPnL = Number(netPnL.toFixed(2));
    pos.realizedRMultiple = Number(realizedR.toFixed(2));

    this.recordAuditLog({
      eventType: exitReason === 'TP_HIT' ? 'POSITION_TP_TRIGGERED' : exitReason === 'SL_HIT' ? 'POSITION_SL_TRIGGERED' : 'POSITION_MANUAL_CLOSED',
      intentId: pos.intentId,
      correlationId: pos.correlationId,
      causationId: pos.causationId,
      details: `پوزیشن ${positionId} با دلیل ${exitReason} بسته شد. سود/زیان خالص: $${pos.realizedNetPnL} (${pos.realizedRMultiple}R)`,
      severity: netPnL >= 0 ? 'INFO' : 'WARN',
    });

    return pos;
  }

  public static getAllPositions(): TradePosition[] {
    return Array.from(positionsMap.values()).sort((a, b) => (b.closedAt || b.openedAt) - (a.closedAt || a.openedAt));
  }

  public static getAuditLogs(): JournalAuditEvent[] {
    return [...auditLogsArray].sort((a, b) => b.timestamp - a.timestamp);
  }

  public static getStatistics(): StrategyPerformanceStats {
    const closedPositions = Array.from(positionsMap.values()).filter(p => p.status.startsWith('CLOSED'));
    return calculateStrategyStatistics(closedPositions);
  }

  public static restorePositions(positions: TradePosition[], logs?: JournalAuditEvent[]): number {
    positionsMap.clear();
    for (const pos of positions) {
      positionsMap.set(pos.positionId, { ...pos });
    }
    if (logs && Array.isArray(logs)) {
      auditLogsArray.length = 0;
      auditLogsArray.push(...logs);
    }
    return positionsMap.size;
  }

  public static resetForTesting(): void {
    positionsMap.clear();
    auditLogsArray.length = 0;
  }
}
