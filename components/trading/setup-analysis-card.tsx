// components/trading/setup-analysis-card.tsx
// کارت تحلیل ستاپ با نمایش شفاف خط‌لوله ۴ ایجنت هوشمند و سبک معاملاتی
// طراحی متریال ۳ بدون خستگی چشم با هماهنگی کامل راست‌به‌چپ (RTL)

'use client';

import React from 'react';
import { StrategyCandidate } from '@/lib/contracts/strategy';
import { RiskPreviewResult } from '@/lib/contracts/risk';
import { ShadowAnalysisPipelineResult } from '@/lib/core/analyst-critic';
import { MultiAgentPipelineResult } from '@/lib/contracts/multi-agent-system';
import {
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Cpu,
  Bot,
  Sliders,
  Send,
  Target,
  AlertCircle,
  Percent,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface SetupAnalysisCardProps {
  candidate: StrategyCandidate | null;
  riskPreview: RiskPreviewResult | null;
  shadowAnalysis: ShadowAnalysisPipelineResult | null;
  multiAgentResult?: MultiAgentPipelineResult | null;
  isBlocked: boolean;
  onOpenOrderModal: () => void;
  onOpenAIModal: () => void;
  onOpenMultiAgentModal?: () => void;
}

export const SetupAnalysisCard: React.FC<SetupAnalysisCardProps> = React.memo(({
  candidate,
  riskPreview,
  shadowAnalysis,
  multiAgentResult,
  isBlocked,
  onOpenOrderModal,
  onOpenAIModal,
  onOpenMultiAgentModal,
}) => {
  return (
    <div
      className="bg-[#161a22] border border-[#272d3b] rounded-2xl p-4 flex flex-col gap-3 shadow-sm text-right font-sans"
      dir="rtl"
    >
      {/* سربرگ ستاپ و نشانگر سبک معاملاتی */}
      <div className="flex items-center justify-between border-b border-[#232834] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">
              ستاپ نقدینگی و تحلیل استراتژی
            </h2>
            {multiAgentResult && (
              <span className="text-[10px] text-cyan-400 font-medium">
                سبک: {multiAgentResult.tradingStyleInfo.nameFa}
              </span>
            )}
          </div>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono border ${
            candidate
              ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300 font-bold'
              : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400'
          }`}
        >
          {candidate ? 'ستاپ کشف‌شده فعال' : 'در انتظار سوییپ'}
        </span>
      </div>

      {candidate ? (
        <div className="space-y-3 text-xs">
          {/* جهت و نوع پوزیشن */}
          <div className="p-3 bg-[#11141a] rounded-xl border border-[#232835] flex items-center justify-between">
            <span className="text-zinc-300 font-medium">جهت معامله کشف‌شده:</span>
            <span
              dir="ltr"
              className={`font-mono font-bold flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg ${
                candidate.direction === 'BUY'
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                  : 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
              }`}
            >
              {candidate.direction === 'BUY' ? (
                <>
                  <TrendingUp className="w-4 h-4" />
                  <span>BUY / خرید</span>
                </>
              ) : (
                <>
                  <TrendingDown className="w-4 h-4" />
                  <span>SELL / فروش</span>
                </>
              )}
            </span>
          </div>

          {/* پارامترهای قیمتی با چپ‌چین صریح برای اعداد */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-[#11141a] rounded-xl border border-[#232835] flex flex-col justify-between">
              <span className="text-zinc-400 text-[11px]">قیمت ورود (Limit):</span>
              <span dir="ltr" className="font-mono font-bold text-cyan-400 text-sm mt-1">
                {candidate.entryPrice.toFixed(candidate.symbol === 'XAUUSD' ? 2 : 5)}
              </span>
            </div>
            <div className="p-2.5 bg-[#11141a] rounded-xl border border-[#232835] flex flex-col justify-between">
              <span className="text-zinc-400 text-[11px]">حد ضرر (SL):</span>
              <span dir="ltr" className="font-mono font-bold text-rose-400 text-sm mt-1">
                {candidate.stopLossPrice.toFixed(candidate.symbol === 'XAUUSD' ? 2 : 5)}
              </span>
            </div>
            <div className="p-2.5 bg-[#11141a] rounded-xl border border-[#232835] flex flex-col justify-between">
              <span className="text-zinc-400 text-[11px]">حد سود (TP):</span>
              <span dir="ltr" className="font-mono font-bold text-emerald-400 text-sm mt-1">
                {candidate.takeProfitPrice.toFixed(candidate.symbol === 'XAUUSD' ? 2 : 5)}
              </span>
            </div>
            <div className="p-2.5 bg-[#11141a] rounded-xl border border-[#232835] flex flex-col justify-between">
              <span className="text-zinc-400 text-[11px]">نسبت R:R مصوب:</span>
              <span dir="ltr" className="font-mono font-bold text-amber-400 text-sm mt-1">
                1 : {candidate.riskRewardRatio}
              </span>
            </div>
          </div>

          {/* پیش‌نمایش کنترل ریسک ۱٪ */}
          {riskPreview && (
            <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-emerald-300 font-bold">
                <span className="flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5" />
                  حجم محاسبه‌شده (۰٫۲۵٪ سرمایه):
                </span>
                <span dir="ltr" className="font-mono text-sm">
                  {riskPreview.adjustedVolumeLots} Lot
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-zinc-300">
                <span>میزان ریسک دلاری:</span>
                <span dir="ltr" className="font-mono text-zinc-100">
                  ${riskPreview.plannedRiskAmount.toFixed(2)} ({riskPreview.plannedRiskPercent}%)
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-zinc-400 pt-1 border-t border-emerald-900/40">
                <span>کارمزد تخمینی دوطرفه:</span>
                <span dir="ltr" className="font-mono">${riskPreview.commissionEstimated.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* پنل خط‌لوله ۴ ایجنت هوشمند (۴ ایجنت هم‌افزا با سبک معاملاتی) */}
          {multiAgentResult ? (
            <div className="p-3 bg-[#11141a] border border-[#242a37] rounded-xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-[#1f2532] pb-2">
                <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <span>خط‌لوله ۴ ایجنت هوشمند (تیمی)</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenMultiAgentModal || onOpenAIModal}
                  className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-950/90 border border-cyan-700/70 text-cyan-300 hover:bg-cyan-900 font-medium flex items-center gap-1.5 transition-colors"
                  title="تنظیم مدل هر ایجنت و سبک معاملاتی"
                >
                  <Sliders className="w-3 h-3" />
                  <span>اتاق فرمان ۴ ایجنت</span>
                </button>
              </div>

              {/* ۴ ردیف متمایز برای ۴ ایجنت */}
              <div className="space-y-1.5">
                {/* ایجنت ۱: اسکنر */}
                <div className="p-2 rounded-lg bg-[#171b23] border border-[#212733] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 text-[10px] text-cyan-400 flex items-center justify-center font-bold font-mono">
                      1
                    </span>
                    <div>
                      <div className="font-bold text-zinc-200 text-[11px]">اسکنر ساختار (Scanner)</div>
                      <div className="text-[10px] text-zinc-400 truncate max-w-[140px]">{multiAgentResult.scannerReview.engineNameFa}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    multiAgentResult.scannerReview.verdict === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950 text-rose-400'
                  }`}>
                    {multiAgentResult.scannerReview.verdictTitleFa}
                  </span>
                </div>

                {/* ایجنت ۲: تحلیل‌گر */}
                <div className="p-2 rounded-lg bg-[#171b23] border border-[#212733] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 text-[10px] text-cyan-400 flex items-center justify-center font-bold font-mono">
                      2
                    </span>
                    <div>
                      <div className="font-bold text-zinc-200 text-[11px]">تحلیل‌گر بستر (Analyst)</div>
                      <div className="text-[10px] text-zinc-400 truncate max-w-[140px]">{multiAgentResult.analystReview.engineNameFa}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                    multiAgentResult.analystReview.verdict === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950 text-rose-400'
                  }`}>
                    <span>{multiAgentResult.analystReview.verdictTitleFa}</span>
                    <span dir="ltr" className="font-mono text-[9px] text-zinc-400">
                      ({(multiAgentResult.analystReview.confidence * 100).toFixed(0)}%)
                    </span>
                  </span>
                </div>

                {/* ایجنت ۳: منتقد ریسک */}
                <div className="p-2 rounded-lg bg-[#171b23] border border-[#212733] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 text-[10px] text-cyan-400 flex items-center justify-center font-bold font-mono">
                      3
                    </span>
                    <div>
                      <div className="font-bold text-zinc-200 text-[11px]">منتقد ریسک (Critic)</div>
                      <div className="text-[10px] text-zinc-400 truncate max-w-[140px]">{multiAgentResult.criticReview.engineNameFa}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    multiAgentResult.criticReview.verdict === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950 text-rose-400 border border-rose-800/50'
                  }`}>
                    {multiAgentResult.criticReview.verdictTitleFa}
                  </span>
                </div>

                {/* ایجنت ۴: داور نهایی */}
                <div className="p-2 rounded-lg bg-[#171b23] border border-[#212733] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 text-[10px] text-cyan-400 flex items-center justify-center font-bold font-mono">
                      4
                    </span>
                    <div>
                      <div className="font-bold text-zinc-200 text-[11px]">داور و دیده‌بان ریسک (Judge)</div>
                      <div className="text-[10px] text-zinc-400 truncate max-w-[140px]">{multiAgentResult.judgeReview.engineNameFa}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    multiAgentResult.judgeReview.verdict === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950 text-rose-400 border border-rose-800/50'
                  }`}>
                    {multiAgentResult.judgeReview.verdictTitleFa}
                  </span>
                </div>
              </div>

              {/* نتیجه‌گیری نهایی داور */}
              <div className="p-2.5 rounded-lg bg-[#151922] border border-[#222735] text-[11px] text-zinc-300 leading-relaxed">
                <span className="text-cyan-300 font-bold block mb-0.5">داوری نهایی خط‌لوله:</span>
                {multiAgentResult.finalRecommendationFa}
              </div>
            </div>
          ) : shadowAnalysis ? (
            /* حالت Fallback قبلی */
            <div className="p-3 bg-[#11141a] border border-[#242a37] rounded-xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-[#1f2532] pb-2">
                <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <span>ممیزی هوش مصنوعی آفلاین در سایه</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenMultiAgentModal || onOpenAIModal}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-700/70 text-cyan-300 hover:bg-cyan-900 font-medium flex items-center gap-1 transition-colors"
                >
                  <Sliders className="w-2.5 h-2.5" />
                  <span>{shadowAnalysis.activeProfile.nameFa}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-[#171b23] border border-[#222834] flex flex-col justify-between">
                  <span className="text-zinc-400 text-[10px]">رأی تحلیل‌گر (Analyst):</span>
                  <div
                    className={`font-bold flex items-center gap-1 mt-1 ${
                      shadowAnalysis.analystReview.decision === 'TRADE'
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>
                      {shadowAnalysis.analystReview.decision === 'TRADE' ? 'تایید معامله' : 'عدم معامله'}
                    </span>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-[#171b23] border border-[#222834] flex flex-col justify-between">
                  <span className="text-zinc-400 text-[10px]">رأی منتقد (Critic):</span>
                  <div
                    className={`font-bold flex items-center gap-1 mt-1 ${
                      shadowAnalysis.criticReview.verdict === 'CONFIRMED'
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {shadowAnalysis.criticReview.verdict === 'CONFIRMED' ? 'صحت‌سنجی تایید' : 'مردود'}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-zinc-300 leading-relaxed pt-1">
                {shadowAnalysis.explanation}
              </p>
            </div>
          ) : null}

          {/* دکمه ارسال به صندوق صرافی */}
          <button
            type="button"
            onClick={onOpenOrderModal}
            disabled={isBlocked || !riskPreview?.isValid}
            className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 text-xs transition-all shadow-sm ${
              isBlocked
                ? 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>بررسی قصد و ارسال به cTrader Demo (مرحله ۵)</span>
          </button>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-zinc-400 border border-dashed border-[#29303d] rounded-xl space-y-2 bg-[#12151b]">
          <div className="w-8 h-8 rounded-full bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
            <Target className="w-4 h-4" />
          </div>
          <p className="font-medium text-zinc-300">
            هنوز سوییپ نقدینگی معتبر روی این بازه قیمتی شناسایی نشده است.
          </p>
          <p className="text-[11px] text-zinc-400">
            با کلیک روی «کندل بعدی» یا «پخش خودکار»، ریپلی بازار را به جلو ببرید تا اردر بلاک و FVG شناسایی شوند.
          </p>
        </div>
      )}
    </div>
  );
});

SetupAnalysisCard.displayName = 'SetupAnalysisCard';
