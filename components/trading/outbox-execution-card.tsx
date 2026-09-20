'use client';

import React, { useState } from 'react';
import { TransactionalOutboxRecord } from '@/lib/contracts/execution';
import { Database, AlertTriangle, CheckCircle, RefreshCcw, ShieldCheck, ArrowRightLeft } from 'lucide-react';

interface OutboxExecutionCardProps {
  records: TransactionalOutboxRecord[];
  isBlocked: boolean;
  blockingReason?: string;
  onReconcile: (intentId: string) => Promise<void>;
  onRefreshOutbox: () => void;
  viewMode?: 'SIMPLE' | 'ADVANCED';
}

export const OutboxExecutionCard: React.FC<OutboxExecutionCardProps> = ({
  records,
  isBlocked,
  blockingReason,
  onReconcile,
  onRefreshOutbox,
  viewMode = 'SIMPLE',
}) => {
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  const handleReconcile = async (intentId: string) => {
    setReconcilingId(intentId);
    try {
      await onReconcile(intentId);
    } finally {
      setReconcilingId(null);
    }
  };

  const getStatusBadge = (state: string) => {
    switch (state) {
      case 'SUBMITTING':
        return (
          <span className="px-2.5 py-0.5 rounded-lg bg-blue-950/70 text-blue-300 border border-blue-800 text-[11px] font-sans font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
            <span>در حال ارسال به بروکر...</span>
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="px-2.5 py-0.5 rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-800 text-[11px] font-sans font-bold flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            <span>تأییدشده در بروکر ✓</span>
          </span>
        );
      case 'UNKNOWN_RECONCILE_REQUIRED':
        return (
          <span className="px-2.5 py-0.5 rounded-lg bg-rose-950/80 text-rose-300 border border-rose-800 text-[11px] font-sans font-bold animate-pulse flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>وضعیت نامشخص — نیازمند استعلام</span>
          </span>
        );
      case 'RECONCILED':
        return (
          <span className="px-2.5 py-0.5 rounded-lg bg-teal-950/70 text-teal-300 border border-teal-800 text-[11px] font-sans font-bold flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-teal-400" />
            <span>استعلام و تطبیق داده شد ✓</span>
          </span>
        );
      case 'REJECTED_BY_BROKER':
        return (
          <span className="px-2.5 py-0.5 rounded-lg bg-rose-950/50 text-rose-400 border border-rose-900 text-[11px] font-sans font-bold">
            رد شده توسط بروکر ✗
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[11px]">
            {state}
          </span>
        );
    }
  };

  const isAdvanced = viewMode === 'ADVANCED' || showTechnicalDetails;

  return (
    <div className="bg-[#0f1422] border border-[#1e2638] rounded-2xl p-4 flex flex-col gap-3">
      {/* سربرگ وضعیت ارسال سفارش‌ها */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-zinc-100">وضعیت ارسال سفارش‌ها به بروکر (صندوق سفارش‌ها)</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#182030] text-zinc-400 font-mono border border-[#243048]">
            {records.length} سفارش
          </span>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'SIMPLE' && (
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="text-[11px] text-zinc-400 hover:text-cyan-300 transition-colors px-2 py-1 rounded bg-[#161c2b] border border-[#252f44]"
            >
              {showTechnicalDetails ? 'مخفی‌سازی جزئیات فنی' : 'نمایش جزئیات فنی'}
            </button>
          )}
          <button
            onClick={onRefreshOutbox}
            title="تازه‌سازی وضعیت سفارش‌ها"
            className="p-1.5 hover:bg-[#1b2336] text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors text-xs flex items-center gap-1.5 border border-[#263148]"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            <span>بروزرسانی وضعیت</span>
          </button>
        </div>
      </div>

      {/* بنر هشدار قفل ایمنی بازتطبیق */}
      {isBlocked && (
        <div className="p-3.5 bg-rose-950/70 border border-rose-800/80 rounded-xl flex items-start gap-2.5 text-xs text-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="font-bold text-rose-100">
              قفل ایمنی فعال است: بررسی وضعیت سفارش نامشخص الزامی است
            </div>
            <div className="text-[11px] text-rose-300/90 leading-relaxed">
              {blockingReason || 'به دلیل عدم دریافت قطعیت پاسخ از بروکر، برای پیشگیری از ثبت تکراری سفارش‌ها، ارسال جدید مسدود شده است. لطفاً سفارش‌های نیازمند بررسی را استعلام فرمایید.'}
            </div>
          </div>
        </div>
      )}

      {/* لیست رکوردهای وضعیت سفارش */}
      {records.length === 0 ? (
        <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-[#232c40] rounded-xl space-y-1">
          <p className="font-bold text-zinc-400">صندوق سفارش‌ها خالی است.</p>
          <p className="text-[11px] text-zinc-500">
            هنوز سفارشی به حساب دموی بروکر ارسال نشده است. تمام سفارش‌های تستی ارسالی در اینجا پایش می‌شوند.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {records.map(record => (
            <div
              key={record.intentId}
              className={`p-3.5 rounded-xl border text-xs flex flex-col gap-2.5 transition-colors ${
                record.state === 'UNKNOWN_RECONCILE_REQUIRED'
                  ? 'bg-rose-950/30 border-rose-900/70 shadow-sm shadow-rose-950/30'
                  : 'bg-[#131826] border-[#222a3d]'
              }`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-zinc-100 text-sm">{record.symbol}</span>
                  <span
                    className={`font-sans text-xs font-bold px-2 py-0.5 rounded ${
                      record.direction === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {record.direction === 'BUY' ? 'خرید' : 'فروش'} {record.volumeLots} لات
                  </span>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    قیمت: {record.limitPrice}
                  </span>
                </div>
                <div>{getStatusBadge(record.state)}</div>
              </div>

              {/* نمایش خلاصه برای کاربر غیرتخصصی */}
              <div className="text-[11px] text-zinc-400 flex items-center justify-between flex-wrap gap-2 border-t border-[#1a2133] pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">حد ضرر/سود در بروکر:</span>
                  <span className={record.isBrokerStopLossConfirmed ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                    {record.isBrokerStopLossConfirmed ? 'ثبت و تأیید شد ✓' : 'در انتظار تأیید'}
                  </span>
                </div>
                {record.brokerOrderId && (
                  <div className="text-zinc-400 font-mono text-[10px]">
                    <span className="text-zinc-500 font-sans">شماره سفارش بروکر:</span> {record.brokerOrderId}
                  </div>
                )}
              </div>

              {/* شناسه‌های فنی فقط در صورت انتخاب حالت پیشرفته یا کلیک دکمه جزئیات فنی */}
              {isAdvanced && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] font-mono text-zinc-400 bg-[#0c101a] p-2.5 rounded-lg border border-[#1b2336]">
                  <div className="truncate" title={record.correlationId}>
                    <span className="text-zinc-500 font-sans">شناسه همبستگی (Correlation):</span> {record.correlationId}
                  </div>
                  <div className="truncate" title={record.causationId}>
                    <span className="text-zinc-500 font-sans">شناسه علیت (Causation):</span> {record.causationId}
                  </div>
                  <div className="truncate" title={record.intentId}>
                    <span className="text-zinc-500 font-sans">شناسه قصد (Intent):</span> {record.intentId}
                  </div>
                  <div className="truncate" title={record.idempotencyKey}>
                    <span className="text-zinc-500 font-sans">کلید ضدتکرار (Idempotency):</span> {record.idempotencyKey}
                  </div>
                </div>
              )}

              {/* پیام خطای بروکر در صورت وجود */}
              {record.brokerError && (
                <div className="text-[11px] text-rose-300 bg-rose-950/40 p-2 rounded-lg border border-rose-900/50">
                  <span className="font-bold">پیام بروکر: </span>
                  {record.brokerError}
                </div>
              )}

              {/* بخش بازتطبیق و بررسی وضعیت سفارش نامشخص */}
              {record.state === 'UNKNOWN_RECONCILE_REQUIRED' && (
                <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-3 space-y-2 mt-1">
                  <div className="text-[11px] text-rose-200 leading-relaxed">
                    <strong>توجه:</strong> پاسخی برای این سفارش در زمان تعیین‌شده از سرور بروکر بازنگشت. وضعیت سفارش نامشخص است و برای پیشگیری از سفارش تکراری، ارسال جدید متوقف شده است. لطفاً وضعیت را استعلام نمایید:
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleReconcile(record.intentId)}
                      disabled={reconcilingId === record.intentId}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-rose-950"
                    >
                      {reconcilingId === record.intentId ? (
                        <>
                          <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                          <span>در حال استعلام وضعیت از سرور بروکر...</span>
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>بررسی وضعیت سفارش نامشخص (استعلام فوری از بروکر)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
