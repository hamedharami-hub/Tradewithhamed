import {
  READ_ONLY_CTRADER_HOST,
  READ_ONLY_CTRADER_JSON_PORT,
  READ_ONLY_PAYLOAD,
  assertReadOnlyOutboundPayload,
  getReadOnlyCTraderConfig,
  historicalBarsFromPayload,
  mapDiscoveredSymbols,
} from '../readonly-ctrader';

export interface ReadOnlyGatewayTestResult { name: string; passed: boolean; details: string; }

const validEnvironment = {
  CTRADER_ENVIRONMENT: 'demo',
  RUN_CTRADER: '1',
  REQUIRE_CTRADER: '1',
  CTRADER_LIVE_ENABLE: 'false',
  CTRADER_GATEWAY_HOST: READ_ONLY_CTRADER_HOST,
  CTRADER_GATEWAY_PORT: String(READ_ONLY_CTRADER_JSON_PORT),
  CTRADER_CLIENT_ID: 'test-client',
  CTRADER_CLIENT_SECRET: 'test-secret',
  CTRADER_ACCESS_TOKEN: 'test-token',
  CTRADER_ACCOUNT_ID: '12345',
  MONITOR_SYMBOLS: 'GBPUSD,EURUSD,USDJPY,XAUUSD,BTCUSD',
};

export function runReadOnlyGatewayTests(): ReadOnlyGatewayTestResult[] {
  const safe = getReadOnlyCTraderConfig(validEnvironment);
  const live = getReadOnlyCTraderConfig({ ...validEnvironment, CTRADER_ENVIRONMENT: 'live' });
  const wrongPort = getReadOnlyCTraderConfig({ ...validEnvironment, CTRADER_GATEWAY_PORT: '5035' });
  const tradingFlag = getReadOnlyCTraderConfig({ ...validEnvironment, CTRADER_LIVE_ENABLE: 'true' });
  const missingSecret = getReadOnlyCTraderConfig({ ...validEnvironment, CTRADER_CLIENT_SECRET: '' });
  let blockedOrder = false;
  try { assertReadOnlyOutboundPayload(READ_ONLY_PAYLOAD.NEW_ORDER_REQUEST); } catch { blockedOrder = true; }
  let allowedSubscription = true;
  try { assertReadOnlyOutboundPayload(READ_ONLY_PAYLOAD.SUBSCRIBE_SPOTS_REQUEST); } catch { allowedSubscription = false; }
  let allowedHistoricalRead = true;
  try { assertReadOnlyOutboundPayload(READ_ONLY_PAYLOAD.GET_TRENDBARS_REQUEST); } catch { allowedHistoricalRead = false; }
  const discovery = mapDiscoveredSymbols([
    { symbolId: 901, symbolName: 'EUR/USD', enabled: true },
    { symbolId: 902, symbolName: 'BTCUSD.pro', enabled: true },
    { symbolId: 903, symbolName: 'GBP/USD', enabled: false },
  ], safe.config?.requestedSymbols || []);
  const decodedHistory = historicalBarsFromPayload({
    symbol: 'USDJPY',
    providerSymbol: 'USDJPY.demo',
    timeframe: 'M1',
    payload: {
      hasMore: false,
      trendbar: [{ utcTimestampInMinutes: 2_800_000, low: 156_00000, deltaOpen: 100, deltaHigh: 250, deltaClose: 175, volume: 42 }],
    },
  });
  return [
    { name: 'read-only preflight accepts only Demo JSON endpoint with all credentials', passed: safe.configured && safe.config?.port === 5036 && safe.config.host === READ_ONLY_CTRADER_HOST, details: safe.reason || 'configured' },
    { name: 'read-only preflight rejects a live environment', passed: !live.configured && live.safetyChecks.demoEnvironment === false, details: live.reason || 'unexpectedly configured' },
    { name: 'read-only preflight rejects Protobuf port for JSON transport', passed: !wrongPort.configured && wrongPort.safetyChecks.fixedJsonEndpoint === false, details: wrongPort.reason || 'unexpectedly configured' },
    { name: 'read-only preflight rejects live-enable flag', passed: !tradingFlag.configured && tradingFlag.safetyChecks.liveEnableDisabled === false, details: tradingFlag.reason || 'unexpectedly configured' },
    { name: 'read-only preflight requires client secret', passed: !missingSecret.configured && missingSecret.safetyChecks.credentialsPresent === false, details: missingSecret.reason || 'unexpectedly configured' },
    { name: 'order payload is structurally blocked before network I/O', passed: blockedOrder, details: `payload=${READ_ONLY_PAYLOAD.NEW_ORDER_REQUEST}` },
    { name: 'spot subscription remains available in the read-only allowlist', passed: allowedSubscription, details: `payload=${READ_ONLY_PAYLOAD.SUBSCRIBE_SPOTS_REQUEST}` },
    { name: 'historical trendbar request remains available in the read-only allowlist', passed: allowedHistoricalRead, details: `payload=${READ_ONLY_PAYLOAD.GET_TRENDBARS_REQUEST}` },
    { name: 'symbol discovery maps BTCUSD and reports unavailable requested symbols', passed: discovery.available.some(item => item.symbol === 'BTCUSD') && discovery.unavailable.includes('GBPUSD'), details: `available=${discovery.available.map(item => item.symbol).join(',')}; unavailable=${discovery.unavailable.join(',')}` },
    { name: 'historical trendbar conversion reconstructs OHLC from cTrader relative fields', passed: decodedHistory.bars.length === 1 && decodedHistory.bars[0].open === 156.001 && decodedHistory.bars[0].high === 156.0025 && decodedHistory.bars[0].close === 156.00175 && decodedHistory.bars[0].timestamp === 168_000_000_000, details: `bars=${decodedHistory.bars.length}; hasMore=${decodedHistory.hasMore}` },
  ];
}
