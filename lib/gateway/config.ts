import { GatewayConfig } from './contracts';

const READ_ONLY_DEMO_HOST = 'demo.ctraderapi.com';
const READ_ONLY_JSON_PORT = 5036;

const DEFAULT_SYMBOLS = [
  { symbol: 'XAUUSD' as const, symbolId: 1 },
  { symbol: 'EURUSD' as const, symbolId: 2 },
];

export function getGatewayConfig(): { configured: boolean; config: GatewayConfig | null; reason?: string } {
  const accessToken = process.env.CTRADER_ACCESS_TOKEN?.trim();
  const accountId = Number(process.env.CTRADER_ACCOUNT_ID);
  const clientId = process.env.CTRADER_CLIENT_ID?.trim();
  const clientSecret = process.env.CTRADER_CLIENT_SECRET?.trim();
  const environment = process.env.CTRADER_ENVIRONMENT?.trim().toLowerCase() || 'demo';
  const host = process.env.CTRADER_GATEWAY_HOST?.trim() || READ_ONLY_DEMO_HOST;
  const port = Number(process.env.CTRADER_GATEWAY_PORT || READ_ONLY_JSON_PORT);
  if (environment !== 'demo') return { configured: false, config: null, reason: 'فقط محیط Demo برای Gateway مجاز است.' };
  if (process.env.CTRADER_LIVE_ENABLE?.trim().toLowerCase() === 'true' || process.env.RUN_CTRADER !== '1' || process.env.REQUIRE_CTRADER !== '1') {
    return { configured: false, config: null, reason: 'Gateway فقط با guardrailهای read-only Demo فعال می‌شود.' };
  }
  if (host !== READ_ONLY_DEMO_HOST || port !== READ_ONLY_JSON_PORT) {
    return { configured: false, config: null, reason: 'Gateway JSON فقط به demo.ctraderapi.com:5036 متصل می‌شود.' };
  }
  if (!accessToken || !Number.isInteger(accountId) || accountId <= 0 || !clientId || !clientSecret) {
    return { configured: false, config: null, reason: 'CTRADER_CLIENT_ID، CTRADER_CLIENT_SECRET، CTRADER_ACCESS_TOKEN و CTRADER_ACCOUNT_ID تنظیم نشده‌اند.' };
  }
  return {
    configured: true,
    config: {
      host,
      port,
      accessToken,
      accountId,
      clientId,
      symbols: DEFAULT_SYMBOLS,
      heartbeatMs: 10000,
      staleAfterMs: 4000,
      maxReconnectAttempts: 10,
    },
  };
}
