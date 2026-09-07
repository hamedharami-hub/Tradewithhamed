import { Candle } from '../../contracts/market';

export const GOLD_CANDLES_FIXTURE_5M: Candle[] = [
  { timestamp: 1725600000000, open: 2642.5, high: 2645.0, low: 2641.0, close: 2644.2, volume: 450, isClosed: true },
  { timestamp: 1725600300000, open: 2644.2, high: 2648.5, low: 2643.0, close: 2647.8, volume: 520, isClosed: true },
  { timestamp: 1725600600000, open: 2647.8, high: 2652.0, low: 2646.5, close: 2651.0, volume: 680, isClosed: true }, // Swing High candidate
  { timestamp: 1725600900000, open: 2651.0, high: 2650.0, low: 2645.2, close: 2646.0, volume: 590, isClosed: true },
  { timestamp: 1725601200000, open: 2646.0, high: 2647.5, low: 2643.0, close: 2644.0, volume: 480, isClosed: true }, // Swing High confirmed
  { timestamp: 1725601500000, open: 2644.0, high: 2645.0, low: 2638.0, close: 2639.5, volume: 710, isClosed: true },
  { timestamp: 1725601800000, open: 2639.5, high: 2641.0, low: 2635.0, close: 2636.2, volume: 830, isClosed: true }, // Swing Low candidate
  { timestamp: 1725602100000, open: 2636.2, high: 2640.0, low: 2636.0, close: 2639.0, volume: 620, isClosed: true },
  { timestamp: 1725602400000, open: 2639.0, high: 2643.0, low: 2638.5, close: 2642.5, volume: 590, isClosed: true }, // Swing Low confirmed
  { timestamp: 1725602700000, open: 2642.5, high: 2645.0, low: 2640.0, close: 2641.0, volume: 440, isClosed: true },
  { timestamp: 1725603000000, open: 2641.0, high: 2642.0, low: 2637.0, close: 2638.5, volume: 510, isClosed: true },
  { timestamp: 1725603300000, open: 2638.5, high: 2639.0, low: 2633.8, close: 2637.5, volume: 950, isClosed: true }, // Sweep of 2635.0 low and rejection
  { timestamp: 1725603600000, open: 2637.5, high: 2644.0, low: 2637.0, close: 2643.0, volume: 890, isClosed: true }, // Bullish confirmation
  { timestamp: 1725603900000, open: 2643.0, high: 2648.5, low: 2642.0, close: 2647.5, volume: 760, isClosed: true },
  { timestamp: 1725604200000, open: 2647.5, high: 2654.0, low: 2646.5, close: 2653.2, volume: 920, isClosed: true },
  { timestamp: 1725604500000, open: 2653.2, high: 2657.0, low: 2651.0, close: 2655.8, volume: 640, isClosed: true },
  { timestamp: 1725604800000, open: 2655.8, high: 2656.5, low: 2652.0, close: 2654.0, volume: 530, isClosed: true },
  { timestamp: 1725605100000, open: 2654.0, high: 2658.0, low: 2653.5, close: 2657.2, volume: 580, isClosed: true },
  { timestamp: 1725605400000, open: 2657.2, high: 2661.0, low: 2656.0, close: 2660.5, volume: 770, isClosed: true },
  { timestamp: 1725605700000, open: 2660.5, high: 2665.0, low: 2659.0, close: 2664.2, volume: 840, isClosed: true },
];
