// lib/contracts/w3-ems.ts
// قراردادها و داده‌ساختارهای بسته W3 (Execution Management System & Live Shadow Gateway)

import { SymbolId } from './market';
import { CandidateDirection } from './strategy';
import { TradingEnvironment } from '../core/ports';

export type OrderLifecycleState =
  | 'DRAFT'
  | 'VALIDATED'
  | 'AWAITING_CONFIRMATION'
  | 'SUBMITTING'                  // پیش از خروج به شبکه ثبت می‌شود
  | 'ACKNOWLEDGED'               // دریافت تاییدیه از بروکر با شماره سفارش
  | 'FILLED'                     // اجرای کامل لیمیت اوردر
  | 'PARTIALLY_FILLED'           // اجرای بخشی از حجم
  | 'CANCELLED'                  // لغو شده توسط کاربر یا منقضی
  | 'REJECTED'                   // رد شده به دلیل نقض ریسک یا خطای بروکر
  | 'EXPIRED'                    // انقضای لیمیت اوردر به دلیل عدم لمس قیمت
  | 'UNKNOWN_RECONCILE_REQUIRED' // تایم‌اوت یا پاسخ مبهم شبکه؛ نیازمند بازتطبیق اجباری
  | 'RECONCILED';                // رفع ابهام و تطبیق موفق وضعیت

export interface ExecutionQualityMetric {
  submissionLatencyMs: number;  // زمان ارسال تا پذیرش (Ack)
  fillLatencyMs: number;        // زمان پذیرش تا اجرای قطعی (Fill)
  totalExecutionMs: number;     // کل زمان پردازش
  requestedPrice: number;       // قیمت درخواستی
  executedPrice: number;        // قیمت اجرا شده در بازار
  slippagePips: number;         // لغزش به پیپ
  slippageDirection: 'FAVORABLE' | 'UNFAVORABLE' | 'ZERO';
  spreadPipsAtExecution: number;// اسپرد در لحظه اجرا
  executionQualityScore: number;// امتیاز کیفیت ۰ تا ۱۰۰
  flaggedForDrift: boolean;     // آیا از حد مجاز انحراف داشته است؟
}

export interface ReconciliationIncident {
  incidentId: string;
  intentId: string;
  symbol: SymbolId;
  reason: 'TIMEOUT' | 'NETWORK_DISCONNECT' | 'AMBIGUOUS_RESPONSE' | 'BROKER_MISMATCH';
  detectedTimestamp: number;
  resolvedTimestamp?: number;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  resolutionType?: 'BROKER_CONFIRMED_FILLED' | 'BROKER_CONFIRMED_CANCELLED' | 'MANUAL_OVERRIDE';
  notes: string;
}

export interface LiveShadowOrder {
  id: string;
  intentId: string;
  correlationId: string;
  idempotencyKey: string;
  environment: TradingEnvironment;
  symbol: SymbolId;
  direction: CandidateDirection;
  orderType: 'LIMIT';
  volumeLots: number;
  requestedPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  maxSlippagePips: number;
  state: OrderLifecycleState;
  
  // مهرهای زمانی چرخه حیات
  createdAt: number;
  validatedAt?: number;
  submittedAt?: number;
  acknowledgedAt?: number;
  filledAt?: number;
  closedAt?: number;
  reconciledAt?: number;

  // اطلاعات دریافتی از بروکر
  brokerOrderId?: string;
  brokerPositionId?: string;
  brokerDealId?: string;
  brokerError?: string;

  // شاخص‌های کیفیت اجرا
  qualityMetric?: ExecutionQualityMetric;
  reasonCode: string;
}
