// lib/core/trailing-stop-manager.ts
// مدیر انتقال خودکار به نقطه سربه‌سر و تریلینگ استاپ (Trailing & Breakeven Protection)

import { SymbolId } from '../contracts/market';
import { PositionLedgerEntry } from './ports';
import { ProtectionRuleConfig, ProtectionEvent } from '../contracts/w4-risk-guardian';
import { DriftMonitor } from './drift-monitor';

export class TrailingStopManager {
  private config: ProtectionRuleConfig;

  constructor(config?: Partial<ProtectionRuleConfig>) {
    this.config = {
      enableAutoBreakeven: true,
      breakevenTriggerR: 1.5,
      breakevenBufferPips: 1.0,
      enableTrailingStop: true,
      trailingStepPips: 2.0,
      trailingTriggerR: 2.5,
      allowPartialProfitTaking: true,
      partialTakeProfitPercent: 50,
      ...config,
    };
  }

  public getConfig(): ProtectionRuleConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<ProtectionRuleConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * ارزیابی یک پوزیشن باز و بررسی نیاز به به‌روزرسانی حد ضرر به سربه‌سر یا تریلینگ
   */
  public evaluatePosition(
    position: PositionLedgerEntry,
    currentBid: number,
    currentAsk: number,
    now: number = Date.now()
  ): ProtectionEvent | null {
    if (!position.isOpen) return null;

    const pipSize = DriftMonitor.getPipSize(position.symbol);
    const isBuy = position.direction === 'BUY';
    const currentPrice = isBuy ? currentBid : currentAsk;

    // اندازه ریسک اولیه به ازای هر واحد (1R)
    const initialRisk = Math.abs(position.entryPrice - position.stopLossPrice);
    if (initialRisk <= 0) return null;

    // سود جاری به ازای هر واحد
    const currentProfit = isBuy
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;

    const currentR = currentProfit / initialRisk;

    // ۱. بررسی انتقال به نقطه سربه‌سر (Breakeven Migration)
    if (this.config.enableAutoBreakeven && currentR >= this.config.breakevenTriggerR) {
      const bufferAmount = this.config.breakevenBufferPips * pipSize;
      const targetBreakevenSL = isBuy
        ? position.entryPrice + bufferAmount
        : position.entryPrice - bufferAmount;

      const isAlreadyPastBreakeven = isBuy
        ? position.stopLossPrice >= targetBreakevenSL
        : position.stopLossPrice <= targetBreakevenSL;

      if (!isAlreadyPastBreakeven) {
        return {
          eventId: `PRT-BE-${now}-${Math.floor(Math.random() * 1000)}`,
          positionId: position.positionId,
          symbol: position.symbol,
          eventType: 'BREAKEVEN_MIGRATION',
          previousStopLoss: position.stopLossPrice,
          newStopLoss: Number(targetBreakevenSL.toFixed(position.symbol === 'XAUUSD' ? 2 : 5)),
          timestamp: now,
          notes: `انتقال خودکار به سربه‌سر به علت دستیابی به سود ${currentR.toFixed(2)}R با پوشش ${this.config.breakevenBufferPips} پیپ کارمزد.`,
        };
      }
    }

    // ۲. بررسی تریلینگ استاپ پویا (Trailing Stop)
    if (this.config.enableTrailingStop && currentR >= this.config.trailingTriggerR) {
      const trailingDistance = initialRisk * 1.0; // حفظ فاصله حداقل 1R از قیمت جاری
      const potentialNewSL = isBuy
        ? currentPrice - trailingDistance
        : currentPrice + trailingDistance;

      const isImprovement = isBuy
        ? potentialNewSL > position.stopLossPrice + (this.config.trailingStepPips * pipSize)
        : potentialNewSL < position.stopLossPrice - (this.config.trailingStepPips * pipSize);

      if (isImprovement) {
        return {
          eventId: `PRT-TRL-${now}-${Math.floor(Math.random() * 1000)}`,
          positionId: position.positionId,
          symbol: position.symbol,
          eventType: 'TRAILING_STOP_UPDATED',
          previousStopLoss: position.stopLossPrice,
          newStopLoss: Number(potentialNewSL.toFixed(position.symbol === 'XAUUSD' ? 2 : 5)),
          timestamp: now,
          notes: `پیشروی تریلینگ استاپ در سود ${currentR.toFixed(2)}R و قفل کردن سود بیشتر.`,
        };
      }
    }

    return null;
  }
}
