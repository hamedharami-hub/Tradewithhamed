import { CTraderSanitizedAccount, CTraderSessionStatus } from '../contracts/ctrader';

export interface CTraderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: 'demo';
}

export interface RawCTraderAccountPayload {
  accountId: number | string;
  accountType?: string;
  isLive?: boolean;
  currency?: string;
  leverage?: number;
  balance?: number;
}

export class CTraderServerSecurity {
  public static getConfig(): { config: CTraderConfig | null; isConfigured: boolean; reason?: string } {
    const clientId = process.env.CTRADER_CLIENT_ID?.trim();
    const clientSecret = process.env.CTRADER_CLIENT_SECRET?.trim();
    const redirectUri = process.env.CTRADER_REDIRECT_URI?.trim();
    const environment = (process.env.CTRADER_ENVIRONMENT?.trim().toLowerCase() || 'demo') as 'demo';

    if (environment !== 'demo') {
      return {
        config: null,
        isConfigured: false,
        reason: 'CRITICAL_SECURITY_VIOLATION: محیط برنامه باید منحصراً demo باشد. محیط live غیرمجاز است.',
      };
    }

    if (!clientId || !clientSecret || !redirectUri) {
      return {
        config: null,
        isConfigured: false,
        reason: 'CREDENTIALS_REQUIRED: کلیدهای cTrader Client ID و Secret در متغیرهای محیطی سرور تنظیم نشده‌اند.',
      };
    }

    return {
      config: {
        clientId,
        clientSecret,
        redirectUri,
        environment: 'demo',
      },
      isConfigured: true,
    };
  }

  public static generateAuthorizationUrl(state: string): { url: string | null; error?: string } {
    const { config, isConfigured, reason } = this.getConfig();
    if (!isConfigured || !config) {
      return { url: null, error: reason };
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'trading',
      response_type: 'code',
      state,
    });

    return {
      url: `https://openapi.ctrader.com/apps/auth?${params.toString()}`,
    };
  }

  public static validateDemoAccountOrReject(account: RawCTraderAccountPayload): CTraderSanitizedAccount {
    const isExplicitLive = account.isLive === true;
    const typeUpper = (account.accountType || '').toUpperCase();
    const isTypeLive = typeUpper === 'LIVE' || typeUpper === 'REAL';

    if (isExplicitLive || isTypeLive) {
      throw new Error(
        'SECURITY_FATAL: حساب ارائه‌شده یک حساب زنده (LIVE / REAL) است. طبق منشور پروژه، هرگونه اتصال به حساب‌های واقعی مسدود است.'
      );
    }

    if (!account.accountId) {
      throw new Error('INVALID_ACCOUNT_DATA: داده‌های دریافتی از بروکر فاقد شناسه حساب معتبر است.');
    }

    const rawIdStr = String(account.accountId);
    const maskedId = rawIdStr.length > 4 ? `DEMO-****${rawIdStr.slice(-4)}` : `DEMO-${rawIdStr}`;

    return {
      accountId: maskedId,
      accountType: 'DEMO',
      depositCurrency: account.currency || 'USD',
      leverage: account.leverage || 100,
      balance: account.balance || 0,
      equity: account.balance || 0,
      isLiveRejected: true,
    };
  }

  public static sanitizeSessionStatus(status: Partial<CTraderSessionStatus>): CTraderSessionStatus {
    return {
      state: status.state || 'DISCONNECTED',
      environment: 'demo',
      isAuthenticated: !!status.isAuthenticated,
      activeAccount: status.activeAccount || null,
      lastHeartbeatTimestamp: status.lastHeartbeatTimestamp || null,
      dataFreshnessMs: status.dataFreshnessMs || null,
      isDataStale: !!status.isDataStale,
      errorMessage: status.errorMessage,
      errorCode: status.errorCode,
      demoBadge: true,
    };
  }
}
