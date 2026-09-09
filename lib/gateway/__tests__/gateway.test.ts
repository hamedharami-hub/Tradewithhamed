import { CTraderDemoGateway } from '../ctrader-gateway';
import { MarketDataStore } from '../market-data-store';

export interface GatewayTestResult { name: string; passed: boolean; details: string; }

export function runGatewayTests(): GatewayTestResult[] {
  const store = MarketDataStore.getInstance();
  store.resetForTesting();
  const valid = store.upsertQuote({ symbol: 'XAUUSD', bid: 2650, ask: 2650.2, timestamp: 1000 });
  const invalid = store.upsertQuote({ symbol: 'XAUUSD', bid: 2651, ask: 2650, timestamp: 1001 });
  const outOfOrder = store.upsertQuote({ symbol: 'XAUUSD', bid: 2649, ask: 2649.2, timestamp: 999 });
  const gateway = CTraderDemoGateway.getInstance();
  gateway.resetForTesting();
  const status = gateway.start();
  return [
    { name: 'valid quote is accepted as live', passed: valid.quality === 'LIVE', details: `quality=${valid.quality}` },
    { name: 'invalid bid/ask is rejected', passed: invalid.quality === 'INVALID', details: `quality=${invalid.quality}` },
    { name: 'out-of-order timestamp is rejected', passed: outOfOrder.quality === 'GAP', details: `quality=${outOfOrder.quality}` },
    { name: 'gateway fails closed without server credentials', passed: status.state === 'DISABLED' && !status.configured, details: `state=${status.state}` },
  ];
}
