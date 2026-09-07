import { Candle, SymbolId } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { GOLD_CANDLES_FIXTURE_5M } from './fixtures/gold-candles';
import { EURUSD_CANDLES_FIXTURE_5M } from './fixtures/eurusd-candles';
import { evaluateS0Strategy } from '../core/s0-engine';
import { SimulatedBroker } from '../core/simulated-broker';

export interface ReplayState {
  symbol: SymbolId;
  currentStepIndex: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: number;
  visibleCandles: Candle[];
  activeCandidate: StrategyCandidate | null;
}

export class ReplayEngine {
  private symbol: SymbolId;
  private allCandles: Candle[];
  private currentStepIndex = 14; // شروع از حداقل وارم‌آپ
  private isPlaying = false;
  private speed = 1000;
  private broker: SimulatedBroker;

  constructor(symbol: SymbolId, broker: SimulatedBroker) {
    this.symbol = symbol;
    this.broker = broker;
    this.allCandles = symbol === 'XAUUSD' ? GOLD_CANDLES_FIXTURE_5M : EURUSD_CANDLES_FIXTURE_5M;
  }

  public setSymbol(newSymbol: SymbolId): void {
    this.symbol = newSymbol;
    this.allCandles = newSymbol === 'XAUUSD' ? GOLD_CANDLES_FIXTURE_5M : EURUSD_CANDLES_FIXTURE_5M;
    this.currentStepIndex = 14;
  }

  public getSnapshot(): ReplayState {
    const visibleCandles = this.allCandles.slice(0, this.currentStepIndex + 1);
    const candidate = evaluateS0Strategy(this.symbol, visibleCandles, []);

    return {
      symbol: this.symbol,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.allCandles.length,
      isPlaying: this.isPlaying,
      speed: this.speed,
      visibleCandles,
      activeCandidate: candidate,
    };
  }

  public stepForward(): ReplayState {
    if (this.currentStepIndex < this.allCandles.length - 1) {
      this.currentStepIndex++;
      const currentCandle = this.allCandles[this.currentStepIndex];
      this.broker.onNewCandle(currentCandle, this.symbol);
    } else {
      this.isPlaying = false;
    }
    return this.getSnapshot();
  }

  public reset(): ReplayState {
    this.currentStepIndex = 14;
    this.isPlaying = false;
    return this.getSnapshot();
  }

  public setSpeed(speedMs: number): void {
    this.speed = speedMs;
  }

  public setPlaying(playing: boolean): void {
    this.isPlaying = playing;
  }
}
