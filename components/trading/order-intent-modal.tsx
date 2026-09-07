'use client';

import React, { useState } from 'react';
import { StrategyCandidate } from '@/lib/contracts/strategy';
import { RiskPreviewResult } from '@/lib/contracts/risk';
import { ShieldCheck, AlertCircle, Clock, CheckCircle2, Lock, Send, ZapOff } from 'lucide-react';

interface OrderIntentModalProps {
  candidate: StrategyCandidate;
  riskPreview: RiskPreviewResult;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSubmit: (options?: { simulateTimeout?: boolean; simulateRejection?: boolean }) => Promise<void>;
  isSubmitting: boolean;
  isBlockedByReconciliation: boolean;
  blockingReason?: string;
}

export const OrderIntentModal: React.FC<OrderIntentModalProps> = ({
  candidate,
  riskPreview,
  isOpen,
  onClose,
  onConfirmSubmit,
  isSubmitting,
  isBlockedByReconciliation,
  blockingReason,
}) => {
  const [testMode, setTestMode] = useState<'NORMAL' | 'TIMEOUT' | 'REJECTION'>('NORMAL');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isSubmitting || isBlockedByReconciliation) return;
    await onConfirmSubmit({
      simulateTimeout: testMode === 'TIMEOUT',
      simulateRejection: testMode === 'REJECTION',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* سربرگ مودال با نشان برجسته دمو */}
        <div className="bg-zinc-950 p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                تأیید نهایی ارسال سفارش به cTrader
                <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  DEMO ONLY
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">مرحله ۵ — بررسی جامع پارامترهای ریسک و قصد معامله</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-zinc-500 hover:text-zinc-300 text-lg font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* بدنه محتوا */}
        <div className="p-5 space-y-4 text-xs">
          {/* هشدار قفل سراسری در صورت وجود سفارش نیازمند بازتطبیق */}
          {isBlockedByReconciliation && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">ارسال سفارش مسدود است (Fail-Closed)</div>
                <div className="text-[11px] mt-0.5">{blockingReason}</div>
              </div>
            </div>
          )}

          {/* جدول مشخصات نهایی سفارش */}
          <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono">
            <div className="flex justify-between py-1 border-b border-zinc-850">
              <span className="text-zinc-400">نماد معاملاتی:</span>
              <span className="font-bold text-zinc-100">{candidate.symbol}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-850">
              <span className="text-zinc-400">جهت معامله:</span>
              <span className={`font-bold ${candidate.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {candidate.direction}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-850">
              <span className="text-zinc-400">نوع سفارش (تایید شده):</span>
              <span className="font-bold text-cyan-400">LIMIT (مرحله ۵)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-850">
              <span className="text-zinc-400">حجم نهایی:</span>
              <span className="font-bold text-zinc-100">{riskPreview.adjustedVolumeLots} لات</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-850">
              <span className="text-zinc-400">قیمت ورود لیمیت:</span>
              <span className="text-zinc-200">{candidate.entryPrice}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-850">
              <span className="text-zinc-400">اسپرد تخمینی:</span>
              <span className="text-zinc-400">{candidate.symbol === 'XAUUSD' ? '2.0 pips' : '0.8 pips'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-400">حد ضرر قطعی (SL):</span>
              <span className="text-rose-400 font-bold">{candidate.stopLossPrice}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-400">حد سود قطعی (TP):</span>
              <span className="text-emerald-400 font-bold">{candidate.takeProfitPrice}</span>
            </div>
          </div>

          {/* خلاصه کنترل ریسک */}
          <div className="p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-1.5">
            <div className="flex justify-between">
              <span className="text-zinc-400">حداکثر ریسک برنامه‌ریزی شده:</span>
              <span className="font-mono font-bold text-amber-400">
                ${riskPreview.plannedRiskAmount} ({riskPreview.plannedRiskPercent}٪ سرمایه)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">کارمزد دوطرفه بروکر:</span>
              <span className="font-mono text-zinc-300">${riskPreview.commissionEstimated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">نسبت سود به زیان خالص (Net R:R):</span>
              <span className="font-mono font-bold text-emerald-400">1 به {riskPreview.netRiskRewardRatio}</span>
            </div>
            <div className="flex justify-between text-[11px] pt-1 border-t border-zinc-800 text-zinc-400">
              <span>حساب مقصد:</span>
              <span className="text-zinc-200 font-mono">cTrader DEMO (****5678)</span>
            </div>
          </div>

          {/* کنترل تست مسیرهای ناموفق و خطا (الزامات مرحله ۵) */}
          <div className="p-3 bg-zinc-850 rounded-xl border border-zinc-700/60 space-y-2">
            <div className="text-[11px] font-bold text-zinc-300">آزمون مسیرهای اجرای مرحله ۵ (تست عدم موفقیت و تایم‌اوت):</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTestMode('NORMAL')}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-colors ${
                  testMode === 'NORMAL'
                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                ارسال عادی دمو
              </button>
              <button
                type="button"
                onClick={() => setTestMode('TIMEOUT')}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-colors ${
                  testMode === 'TIMEOUT'
                    ? 'bg-rose-950 border-rose-600 text-rose-300'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                شبیه‌سازی تایم‌اوت
              </button>
              <button
                type="button"
                onClick={() => setTestMode('REJECTION')}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-colors ${
                  testMode === 'REJECTION'
                    ? 'bg-amber-950 border-amber-600 text-amber-300'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                رد توسط بروکر
              </button>
            </div>
          </div>
        </div>

        {/* دکمه‌های اقدام و محافظت کلیک دوبل */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
          >
            انصراف
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || isBlockedByReconciliation}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              isSubmitting || isBlockedByReconciliation
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
            }`}
          >
            {isSubmitting ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                <span>در حال ثبت در صندوق و ارسال به شبکه (SUBMITTING)...</span>
              </>
            ) : isBlockedByReconciliation ? (
              <>
                <Lock className="w-4 h-4" />
                <span>مسدود: ابتدا بازتطبیق را کامل کنید</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>تأیید صریح و ارسال سفارش LIMIT به Demo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
