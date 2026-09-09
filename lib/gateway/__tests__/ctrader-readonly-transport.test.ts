import {
  assertOutboundMessageAllowed,
  CTraderReadOnlyTransport,
  matchCanonicalSymbol,
  processDiscoveredSymbols,
  ReadOnlyBarAccumulator,
  validateReadOnlyPreflight,
} from '../ctrader-readonly-transport';

export interface ReadOnlyTransportTestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runCtraderReadOnlyTransportTests(): Promise<ReadOnlyTransportTestResult[]> {
  const results: ReadOnlyTransportTestResult[] = [];

  // Test 1: Preflight rejects live enable
  const preflightLive = validateReadOnlyPreflight({
    CTRADER_LIVE_ENABLE: 'true',
    CTRADER_ENVIRONMENT: 'demo',
    CTRADER_GATEWAY_PORT: '5036',
  });
  results.push({
    name: 'preflight rejects CTRADER_LIVE_ENABLE=true',
    passed: !preflightLive.valid && preflightLive.reason?.includes('LIVE_MODE_EXPLICITLY_FORBIDDEN') === true,
    details: `valid=${preflightLive.valid}, reason=${preflightLive.reason}`,
  });

  // Test 2: Preflight rejects non-demo environment
  const preflightEnv = validateReadOnlyPreflight({
    CTRADER_ENVIRONMENT: 'live',
    CTRADER_GATEWAY_PORT: '5036',
  });
  results.push({
    name: 'preflight rejects non-demo environment',
    passed: !preflightEnv.valid && preflightEnv.reason?.includes('LIVE_ENVIRONMENT_FORBIDDEN') === true,
    details: `valid=${preflightEnv.valid}, reason=${preflightEnv.reason}`,
  });

  // Test 3: Preflight rejects port 5035 (legacy/protobuf)
  const preflightPort5035 = validateReadOnlyPreflight({
    CTRADER_ENVIRONMENT: 'demo',
    CTRADER_GATEWAY_PORT: '5035',
  });
  results.push({
    name: 'preflight rejects port 5035 with deprecation note',
    passed: !preflightPort5035.valid && preflightPort5035.reason?.includes('PORT_5035_DEPRECATED') === true,
    details: `valid=${preflightPort5035.valid}, reason=${preflightPort5035.reason}`,
  });

  // Test 4: Preflight rejects missing credentials
  const preflightCreds = validateReadOnlyPreflight({
    CTRADER_ENVIRONMENT: 'demo',
    CTRADER_GATEWAY_PORT: '5036',
  });
  results.push({
    name: 'preflight rejects missing credentials',
    passed: !preflightCreds.valid && preflightCreds.reason?.includes('MISSING_CREDENTIALS') === true,
    details: `valid=${preflightCreds.valid}, reason=${preflightCreds.reason}`,
  });

  // Test 5: Preflight passes with valid demo config
  const preflightValid = validateReadOnlyPreflight({
    CTRADER_ENVIRONMENT: 'demo',
    CTRADER_GATEWAY_PORT: '5036',
    CTRADER_CLIENT_ID: 'demo_client_id',
    CTRADER_ACCESS_TOKEN: 'demo_token',
    CTRADER_ACCOUNT_ID: '12345678',
  });
  results.push({
    name: 'preflight accepts valid demo credentials and enforces port 5036',
    passed: preflightValid.valid && preflightValid.config?.port === 5036 && preflightValid.brokerWrites === false,
    details: `valid=${preflightValid.valid}, port=${preflightValid.config?.port}`,
  });

  // Test 6: Outbound allowlist permits valid read-only requests
  let allowlistPermits = true;
  try {
    assertOutboundMessageAllowed(51);   // HEARTBEAT
    assertOutboundMessageAllowed(2100); // APP_AUTH
    assertOutboundMessageAllowed(2102); // ACCOUNT_AUTH
    assertOutboundMessageAllowed(2114); // SYMBOLS_LIST
    assertOutboundMessageAllowed(2127); // SUBSCRIBE_SPOTS
  } catch {
    allowlistPermits = false;
  }
  results.push({
    name: 'outbound allowlist permits read-only discovery and auth',
    passed: allowlistPermits,
    details: `permitted=${allowlistPermits}`,
  });

  // Test 7: Outbound allowlist blocks NEW_ORDER_REQ (2106) with SAFETY_BLOCKED
  let orderBlocked = false;
  let orderError = '';
  try {
    assertOutboundMessageAllowed(2106);
  } catch (err) {
    orderBlocked = true;
    orderError = err instanceof Error ? err.message : String(err);
  }
  results.push({
    name: 'outbound allowlist blocks NEW_ORDER_REQ (2106) before socket',
    passed: orderBlocked && orderError.includes('SAFETY_BLOCKED'),
    details: `orderBlocked=${orderBlocked}, error=${orderError}`,
  });

  // Test 8: Outbound allowlist blocks RECONCILE_REQ (2124) with SAFETY_BLOCKED
  let reconcileBlocked = false;
  try {
    assertOutboundMessageAllowed(2124);
  } catch (err) {
    reconcileBlocked = (err instanceof Error ? err.message : '').includes('SAFETY_BLOCKED');
  }
  results.push({
    name: 'outbound allowlist blocks RECONCILE_REQ (2124)',
    passed: reconcileBlocked,
    details: `reconcileBlocked=${reconcileBlocked}`,
  });

  // Test 9: Dynamic symbol discovery maps canonical aliases
  const mappedEUR = matchCanonicalSymbol('EURUSD.pro');
  const mappedGold = matchCanonicalSymbol('GOLD');
  const mappedBTC = matchCanonicalSymbol('BTC/USD');
  const mappedUnknown = matchCanonicalSymbol('US30');
  results.push({
    name: 'symbol matcher maps canonical aliases accurately',
    passed: mappedEUR === 'EURUSD' && mappedGold === 'XAUUSD' && mappedBTC === 'BTCUSD' && mappedUnknown === null,
    details: `EUR=${mappedEUR}, Gold=${mappedGold}, BTC=${mappedBTC}, US30=${mappedUnknown}`,
  });

  // Test 10: Missing BTCUSD generates UNAVAILABLE_SYMBOL and forbids fallback ID
  const catalog = [
    { symbolId: 1, symbolName: 'EURUSD' },
    { symbolId: 2, symbolName: 'GBPUSD' },
    { symbolId: 3, symbolName: 'USDJPY' },
    { symbolId: 4, symbolName: 'XAUUSD' },
  ];
  const { discovered, unavailable } = processDiscoveredSymbols(catalog);
  results.push({
    name: 'catalog discovery handles missing BTCUSD with unavailable record and no fallback ID',
    passed: discovered.length === 4 && unavailable.includes('BTCUSD') && !discovered.some(d => d.canonicalSymbol === 'BTCUSD'),
    details: `discovered=${discovered.length}, unavailable=${unavailable.join(',')}`,
  });

  // Test 11: Bar accumulator collects ticks and produces closed M1 and M5 bars
  const accumulator = new ReadOnlyBarAccumulator();
  const closedBars: Array<{ timeframe: string; candle: unknown }> = [];
  accumulator.onBarClosed(event => {
    closedBars.push({ timeframe: event.timeframe, candle: event.candle });
  });

  // Minute 0 ticks (0 to 59,999)
  accumulator.ingestQuote('EURUSD', 1.0850, 1.0852, 1000);
  accumulator.ingestQuote('EURUSD', 1.0855, 1.0857, 15000);
  accumulator.ingestQuote('EURUSD', 1.0848, 1.0850, 45000);

  // Minute 1 tick (60,000) -> triggers Minute 0 M1 close
  accumulator.ingestQuote('EURUSD', 1.0860, 1.0862, 60000);

  const m1Closed = closedBars.find(b => b.timeframe === '1M');
  results.push({
    name: 'bar accumulator produces closed M1 bar on boundary transition',
    passed: Boolean(m1Closed) && (m1Closed?.candle as { isClosed?: boolean })?.isClosed === true,
    details: `closedBars=${closedBars.length}`,
  });

  // Test 12: Transport instance guarantees brokerWrites: false and blocks send(2106)
  if (preflightValid.config) {
    const transport = new CTraderReadOnlyTransport(preflightValid.config);
    let transportSendBlocked = false;
    try {
      await transport.send(2106, {});
    } catch (err) {
      transportSendBlocked = (err instanceof Error ? err.message : '').includes('SAFETY_BLOCKED');
    }

    results.push({
      name: 'transport guarantees brokerWrites: false and blocks order dispatch in send()',
      passed: transport.brokerWrites === false && transportSendBlocked,
      details: `brokerWrites=${transport.brokerWrites}, sendBlocked=${transportSendBlocked}`,
    });
  }

  return results;
}
