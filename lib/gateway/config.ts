import { GatewayConfig } from './contracts';

const DEFAULT_SYMBOLS = [
  { symbol: 'XAUUSD' as const, symbolId: 1 },
  { symbol: 'EURUSD' as const, symbolId: 2 },
];

export function getGatewayConfig(): { configured: boolean; config: GatewayConfig | null; reason?: string } {
  const accessToken = process.env.CTRADER_ACCESS_TOKEN?.trim();
  const accountId = Number(process.env.CTRADER_ACCOUNT_ID);
  const clientId = process.env.CTRADER_CLIENT_ID?.trim();
  const environment = process.env.CTRADER_ENVIRONMENT?.trim().toLowerCase() || 'demo';
  if (environment !== 'demo') return { configured: false, config: null, reason: 'فقط محیط Demo برای Gateway مجاز است.' };
  if (!accessToken || !Number.isInteger(accountId) || accountId <= 0 || !clientId) {
    return { configured: false, config: null, reason: 'CTRADER_ACCESS_TOKEN، CTRADER_ACCOUNT_ID و CTRADER_CLIENT_ID تنظیم نشده‌اند.' };
  }
  return {
    configured: true,
    config: {
      host: process.env.CTRADER_GATEWAY_HOST?.trim() || 'demo.ctraderapi.com',
      port: Number(process.env.CTRADER_GATEWAY_PORT || 5035),
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
