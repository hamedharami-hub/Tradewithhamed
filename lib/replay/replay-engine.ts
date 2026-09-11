import { Candle, SymbolId } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { MarketRegimeAnalysis, TradingStyleType } from '../contracts/regimes';
import { GOLD_CANDLES_FIXTURE_5M } from './fixtures/gold-candles';
import { EURUSD_CANDLES_FIXTURE_5M } from './fixtures/eurusd-candles';
import { GBPUSD_CANDLES_FIXTURE_5M } from './fixtures/gbpusd-candles';
import { USDJPY_CANDLES_FIXTURE_5M } from './fixtures/usdjpy-candles';
import { MultiStyleEngine } from '../core/multi-style-engine';
import { SimulatedBroker } from '../core/simulated-broker';

export interface ReplayState {
  symbol: SymbolId;
  currentStepIndex: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: number;
  visibleCandles: Candle[];
  allCandles: Candle[];
  activeCandidate: StrategyCandidate | null;
  marketRegime?: MarketRegimeAnalysis;
  activeStyleFilter?: TradingStyleType | 'ALL';
}

export class ReplayEngine {
  private symbol: SymbolId;
  private allCandles: Candle[];
  private currentStepIndex: number;
  private isPlaying = false;
  private speed = 1000;
  private broker: SimulatedBroker;
  private activeStyleFilter: TradingStyleType | 'ALL' = 'ALL';

  constructor(symbol: SymbolId, broker: SimulatedBroker) {
    this.symbol = symbol;
    this.broker = broker;
    this.allCandles = this.getFixtureForSymbol(symbol);
    this.currentStepIndex = this.getInitialStepIndex(symbol);
  }

  private getFixtureForSymbol(symbol: SymbolId): Candle[] {
    switch (symbol) {
      case 'XAUUSD':
        return GOLD_CANDLES_FIXTURE_5M;
      case 'EURUSD':
        return EURUSD_CANDLES_FIXTURE_5M;
      case 'GBPUSD':
        return GBPUSD_CANDLES_FIXTURE_5M;
      case 'USDJPY':
        return USDJPY_CANDLES_FIXTURE_5M;
      default:
        return GOLD_CANDLES_FIXTURE_5M;
    }
  }

  public getInitialStepIndex(symbol: SymbolId): number {
    // برای طلا ایندکس ۹۵ دقیقا بعد از سوییپ کف و تاییدیه صعودی ستاپ S0 است
    // برای سایر جفت‌ارزها ۸۰ کندل تاریخی اولیه را به عنوان وارم‌آپ چارت حفظ می‌کند
    return symbol === 'XAUUSD' ? 95 : 80;
  }

  public setSymbol(newSymbol: SymbolId): void {
    this.symbol = newSymbol;
    this.allCandles = this.getFixtureForSymbol(newSymbol);
    this.currentStepIndex = this.getInitialStepIndex(newSymbol);
  }

  public setStyleFilter(filter: TradingStyleType | 'ALL'): void {
    this.activeStyleFilter = filter;
  }

  public getAllCandles(): Candle[] {
    return this.allCandles;
  }

  public getSnapshot(): ReplayState {
    const visibleCandles = this.allCandles.slice(0, this.currentStepIndex + 1);
    const evaluation = MultiStyleEngine.evaluate(
      visibleCandles,
      this.symbol,
      this.activeStyleFilter
    );

    return {
      symbol: this.symbol,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.allCandles.length,
      isPlaying: this.isPlaying,
      speed: this.speed,
      visibleCandles,
      allCandles: this.allCandles,
      activeCandidate: evaluation.candidate,
      marketRegime: evaluation.regime,
      activeStyleFilter: this.activeStyleFilter,
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

  public jumpToStep(targetIndex: number): ReplayState {
    this.currentStepIndex = Math.max(0, Math.min(targetIndex, this.allCandles.length - 1));
    return this.getSnapshot();
  }

  public reset(): ReplayState {
    this.currentStepIndex = this.getInitialStepIndex(this.symbol);
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
