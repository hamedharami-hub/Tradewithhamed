/**
 * قراردادها و تایپ‌های تخصصی سیستم مدیریت سفارش‌ها (OMS) و صندوق تراکنشی در مرحله ۵
 * شامل شناسه‌های علیت (Causation) و همبستگی (Correlation)، و ترنزیشن‌های خطا و بازتطبیق (Reconciliation)
 */
import { SymbolId } from './market';
import { CandidateDirection } from './strategy';

export type VerifiedOrderType = 'LIMIT'; // در مرحله ۵ منحصراً سفارش LIMIT تایید و فعال می‌شود؛ بقیه غیرفعالند

export type TransactionalExecutionState =
  | 'DRAFT'
  | 'VALIDATED'
  | 'AWAITING_USER_CONFIRMATION'
  | 'SUBMITTING'                  // پیش از ارسال در شبکه ثبت می‌شود
  | 'ACKNOWLEDGED'               // دریافت تاییدیه اولیه با brokerOrderId
  | 'FILLED'                     // اجرای کامل سفارش در بروکر
  | 'PARTIALLY_FILLED'           // اجرای بخشی از حجم
  | 'REJECTED_BY_BROKER'         // رد شدن توسط بروکر با کد خطا
  | 'PROTECTION_FAILED'          // معامله باز شد ولی ثبت حد ضرر/سود با خطا مواجه شد
  | 'UNKNOWN_RECONCILE_REQUIRED' // تایم‌اوت شبکه یا پاسخ مبهم؛ نیازمند بازتطبیق اجباری قبل از هرگونه اقدام
  | 'RECONCILED'                 // تطبیق موفقیت‌آمیز وضعیت از روی اطلاعات زنده بروکر
  | 'CANCELLED';

export interface TransactionalOutboxRecord {
  intentId: string;
  correlationId: string; // شناسه یکتای ردیابی سراسری
  causationId: string;   // شناسه رخداد آغازگر
  idempotencyKey: string;// کلید ضد تکرار (Double-click / Refresh Guard)
  symbol: SymbolId;
  orderType: VerifiedOrderType;
  direction: CandidateDirection;
  volumeLots: number;
  limitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  state: TransactionalExecutionState;
  
  // شواهد و مهرهای زمانی
  createdAt: number;
  submittedAt?: number;
  acknowledgedAt?: number;
  reconciledAt?: number;

  // اطلاعات دریافتی از بروکر
  brokerOrderId?: string;
  brokerPositionId?: string;
  brokerDealId?: string;
  brokerError?: string;
  
  // محافظت‌های سمت بروکر (Broker-Side Protections)
  isBrokerStopLossConfirmed: boolean;
  isBrokerTakeProfitConfirmed: boolean;
  
  // محیط و حساب
  environment?: 'PAPER_LIVE' | 'BROKER_DEMO' | 'BROKER_LIVE' | 'PAPER_REPLAY';
  accountType: 'DEMO' | 'LIVE' | 'PAPER';
  accountMaskedId: string;
  executorEpoch?: number;
  deviceLabel?: 'windows' | 'pixel';
}

export interface OrderSubmissionRequest {
  intentId: string;
  idempotencyKey: string;
  symbol: SymbolId;
  direction: CandidateDirection;
  volumeLots: number;
  limitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  userConfirmationTimestamp: number;
  environment?: 'PAPER_LIVE' | 'BROKER_DEMO' | 'BROKER_LIVE';
  executorSessionId?: string;
  executorEpoch?: number;
  deviceLabel?: 'windows' | 'pixel';
}

export interface OrderSubmissionResponse {
  success: boolean;
  state: TransactionalExecutionState;
  record: TransactionalOutboxRecord;
  requiresReconciliation: boolean;
  error?: string;
}
