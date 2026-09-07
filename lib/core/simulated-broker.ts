import { Candle, SymbolId } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { SimulatedOrder, SimulatedPosition } from '../contracts/orders';

export interface BrokerState {
  accountBalance: number;
  accountEquity: number;
  orders: SimulatedOrder[];
  positions: SimulatedPosition[];
}

export class SimulatedBroker {
  private balance: number;
  private equity: number;
  private orders: SimulatedOrder[] = [];
  private positions: SimulatedPosition[] = [];

  constructor(initialBalance = 10000) {
    this.balance = initialBalance;
    this.equity = initialBalance;
  }

  public getState(): BrokerState {
    return {
      accountBalance: this.balance,
      accountEquity: this.equity,
      orders: [...this.orders],
      positions: [...this.positions],
    };
  }

  public createOrderFromCandidate(candidate: StrategyCandidate, volumeLots: number): SimulatedOrder {
    const order: SimulatedOrder = {
      id: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      candidateId: candidate.id,
      symbol: candidate.symbol,
      type: 'LIMIT',
      direction: candidate.direction,
      volumeLots,
      requestedPrice: candidate.entryPrice,
      stopLoss: candidate.stopLossPrice,
      takeProfit: candidate.takeProfitPrice,
      status: 'PENDING',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.orders.push(order);
    return order;
  }

  public onNewCandle(candle: Candle, symbol: SymbolId): void {
    // ۱. بررسی فعال شدن سفارش‌های معلق با برخورد قیمت
    const pendingOrders = this.orders.filter(o => o.symbol === symbol && o.status === 'PENDING');
    for (const order of pendingOrders) {
      const hit =
        order.direction === 'BUY'
          ? candle.low <= order.requestedPrice
          : candle.high >= order.requestedPrice;

      if (hit) {
        order.status = 'FILLED';
        order.updatedAt = candle.timestamp;

        // باز کردن پوزیشن
        this.positions.push({
          id: `POS-${order.id}`,
          orderId: order.id,
          symbol: order.symbol,
          direction: order.direction,
          volumeLots: order.volumeLots,
          entryPrice: order.requestedPrice,
          currentPrice: order.requestedPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          unrealizedPnl: 0,
          realizedPnl: 0,
          commissionPaid: order.volumeLots * 6.0,
          isOpen: true,
          openedAt: candle.timestamp,
        });
      }
    }

    // ۲. به‌روزرسانی پوزیشن‌های باز و بررسی برخورد با حد ضرر یا سود
    const openPositions = this.positions.filter(p => p.symbol === symbol && p.isOpen);
    let totalUnrealized = 0;

    for (const pos of openPositions) {
      pos.currentPrice = candle.close;
      const contractSize = symbol === 'XAUUSD' ? 100 : 100000;
      const priceDiff =
        pos.direction === 'BUY'
          ? candle.close - pos.entryPrice
          : pos.entryPrice - candle.close;

      pos.unrealizedPnl = Number((pos.volumeLots * priceDiff * contractSize - pos.commissionPaid).toFixed(2));
      totalUnrealized += pos.unrealizedPnl;

      // بررسی حد ضرر
      const slHit =
        pos.direction === 'BUY'
          ? candle.low <= pos.stopLoss
          : candle.high >= pos.stopLoss;

      if (slHit) {
        pos.isOpen = false;
        pos.closedAt = candle.timestamp;
        pos.closeReason = 'SL';
        const lossDiff =
          pos.direction === 'BUY'
            ? pos.stopLoss - pos.entryPrice
            : pos.entryPrice - pos.stopLoss;
        pos.realizedPnl = Number((pos.volumeLots * lossDiff * contractSize - pos.commissionPaid).toFixed(2));
        this.balance += pos.realizedPnl;
        continue;
      }

      // بررسی حد سود
      const tpHit =
        pos.direction === 'BUY'
          ? candle.high >= pos.takeProfit
          : candle.low <= pos.takeProfit;

      if (tpHit) {
        pos.isOpen = false;
        pos.closedAt = candle.timestamp;
        pos.closeReason = 'TP';
        const winDiff =
          pos.direction === 'BUY'
            ? pos.takeProfit - pos.entryPrice
            : pos.entryPrice - pos.takeProfit;
        pos.realizedPnl = Number((pos.volumeLots * winDiff * contractSize - pos.commissionPaid).toFixed(2));
        this.balance += pos.realizedPnl;
        continue;
      }
    }

    this.equity = Number((this.balance + totalUnrealized).toFixed(2));
  }
}
