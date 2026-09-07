export type RateLimitCategory =
  | 'AUTH'
  | 'ORDER_SUBMIT'
  | 'ORDER_RECONCILE'
  | 'JOURNAL'
  | 'DISASTER_RECOVERY';

export interface RateLimitPolicy {
  category: RateLimitCategory;
  windowMs: number;
  maxRequests: number;
  minIntervalMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterSec: number;
  clientIp: string;
  category: RateLimitCategory;
}

export interface RateLimiterMetrics {
  totalRequests: number;
  totalAllowed: number;
  totalBlocked: number;
  blockedByCategory: Record<RateLimitCategory, number>;
  activeTrackedIps: number;
}

export interface EncryptedTokenPayload {
  algorithm: 'AES-256-GCM';
  ciphertextHex: string;
  ivHex: string;
  authTagHex: string;
  createdAt: number;
}

export interface DisasterRecoverySnapshot {
  schemaVersion: 'v1.0-DR';
  generatedAt: number;
  checksum: string; // SHA-256 digest
  omsState: {
    recordsCount: number;
    records: Array<{
      intentId: string;
      idempotencyKey: string;
      symbol: string;
      state: string;
      createdAt: number;
      brokerOrderId?: string;
    }>;
    idempotencyKeys: Array<[string, string]>;
  };
  journalState: {
    positionsCount: number;
    auditLogsCount: number;
    statistics: {
      totalTrades: number;
      winRatePercent: number;
      netPnL: number;
      profitFactor: number;
    };
  };
  securityAudit: {
    environment: 'demo';
    tokenVaultActive: boolean;
    zeroSecretsCompliant: boolean;
  };
}

export interface DisasterRecoveryRestoreResult {
  success: boolean;
  schemaVersion: string;
  checksumVerified: boolean;
  restoredRecordsCount: number;
  restoredPositionsCount: number;
  ordersMovedToReconcile: number;
  message: string;
}
