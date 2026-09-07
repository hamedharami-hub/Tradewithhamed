// components/trading/monte-carlo-modal.tsx
// پنجره پیشرفته شبیه‌سازی ۱۰۰۰ مسیره مونت‌کارلو و ترسیم مخروط احتمالات
// طراحی متریال ۳ گوگل، با SVG بومی بدون کتابخانه سنگین، ۱۰۰٪ آفلاین

'use client';

import React, { useState, useMemo } from 'react';
import {
  MonteCarloSimulator,
} from '@/lib/core/monte-carlo-simulator';
import { MonteCarloSimulationResult } from '@/lib/contracts/monte-carlo';
import {
  X,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  Activity,
  RefreshCw,
  Percent,
  Sliders,
  Sparkles,
  Info,
} from 'lucide-react';

interface MonteCarloModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  symbol: string;
}

export const MonteCarloModal: React.FC<MonteCarloModalProps> = ({
  isOpen,
  onClose,
  initialPrice,
  targetPrice,
  stopLossPrice,
  symbol,
}) => {
  const [iterations, setIterations] = useState<number>(1000);
  const [steps, setSteps] = useState<number>(50);
  const [volatility, setVolatility] = useState<number>(0.16); // 16%
  const [seed, setSeed] = useState<number>(() => Date.now());

  const result: MonteCarloSimulationResult = useMemo(() => {
    return MonteCarloSimulator.runSimulation({
      initialPrice,
      targetPrice,
      stopLossPrice,
      iterations,
      steps,
      annualizedVolatility: volatility,
      seed,
    });
  }, [initialPrice, targetPrice, stopLossPrice, iterations, steps, volatility, seed]);

  if (!isOpen) return null;

  // محاسبه ابعاد و نقاط SVG برای ترسیم مخروط صدک‌ها
  const cone = result.percentileCone;
  const minPrice = Math.min(...cone.map(c => c.p5), stopLossPrice, targetPrice) * 0.998;
  const maxPrice = Math.max(...cone.map(c => c.p95), targetPrice, stopLossPrice) * 1.002;
  const priceRange = maxPrice - minPrice || 1;

  const svgWidth = 600;
  const svgHeight = 240;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const getX = (stepIndex: number) => paddingLeft + (stepIndex / steps) * plotWidth;
  const getY = (price: number) => paddingTop + (1 - (price - minPrice) / priceRange) * plotHeight;

  // مسیرهای SVG برای چندضلعی‌های ابر صدک
  // ۱. ابر ۹۰٪ اطمینان (بین P5 و P95)
  const outerCloudPoints = [
    ...cone.map(c => `${getX(c.step)},${getY(c.p95)}`),
    ...cone.slice().reverse().map(c => `${getX(c.step)},${getY(c.p5)}`),
  ].join(' ');

  // ۲. ابر ۵۰٪ میانی (بین P25 و P75)
  const innerCloudPoints = [
    ...cone.map(c => `${getX(c.step)},${getY(c.p75)}`),
    ...cone.slice().reverse().map(c => `${getX(c.step)},${getY(c.p25)}`),
  ].join(' ');

  // ۳. خط میانه محتمل‌ترین مسیر (P50)
  const medianLinePoints = cone.map(c => `${getX(c.step)},${getY(c.p50)}`).join(' ');

  const handleRerun = () => {
    setSeed(Date.now());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto font-sans"
      dir="rtl"
    >
      <div className="bg-[#12151c] border border-[#272e3d] w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-right">
        {/* سربرگ مودال */}
        <div className="flex items-center justify-between p-4 border-b border-[#212735] bg-[#151922]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">
                  شبیه‌سازی ۱۰۰۰ مسیره مونت‌کارلو (Monte Carlo Engine)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                  {symbol}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                سنجش تصادفی احتمال برخورد به تارگت قبل از استاپ با ۱۰۰۰ سناریوی شبیه‌سازی حرکت براونی
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#202634] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* محتوای مودال */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* کارت‌های آماری کلیدی */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* احتمال برد (PoP) */}
            <div className="p-3 bg-[#161a24] rounded-xl border border-[#262e3e] flex flex-col justify-between">
              <span className="text-[11px] text-zinc-400">احتمال لمس سود (PoP):</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span
                  className={`text-xl font-bold font-mono ${
                    result.probabilityOfProfit >= 50 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {result.probabilityOfProfit}٪
                </span>
                <span className="text-[10px] text-zinc-400">
                  ({result.tpFirstCount}/{result.totalPaths})
                </span>
              </div>
            </div>

            {/* احتمال لمس استاپ */}
            <div className="p-3 bg-[#161a24] rounded-xl border border-[#262e3e] flex flex-col justify-between">
              <span className="text-[11px] text-zinc-400">احتمال برخورد استاپ:</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span
                  className={`text-xl font-bold font-mono ${
                    result.probabilityOfStopLoss < 40 ? 'text-zinc-200' : 'text-rose-400'
                  }`}
                >
                  {result.probabilityOfStopLoss}٪
                </span>
                <span className="text-[10px] text-zinc-400">
                  ({result.slFirstCount}/{result.totalPaths})
                </span>
              </div>
            </div>

            {/* بیشینه افت مورد انتظار */}
            <div className="p-3 bg-[#161a24] rounded-xl border border-[#262e3e] flex flex-col justify-between">
              <span className="text-[11px] text-zinc-400">حداکثر افت مورد انتظار:</span>
              <div className="mt-1">
                <span className="text-xl font-bold font-mono text-cyan-400">
                  {result.expectedMaxDrawdownPercent}٪
                </span>
              </div>
            </div>

            {/* ارزش در معرض ریسک (VaR 95%) */}
            <div className="p-3 bg-[#161a24] rounded-xl border border-[#262e3e] flex flex-col justify-between">
              <span className="text-[11px] text-zinc-400">ارزش در معرض ریسک (VaR 95%):</span>
              <div className="mt-1">
                <span className="text-xl font-bold font-mono text-amber-300">
                  {result.var95Percent}٪
                </span>
              </div>
            </div>
          </div>

          {/* نمودار مخروط احتمالات مونت‌کارلو */}
          <div className="p-4 bg-[#11141b] rounded-2xl border border-[#212735] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>مخروط توزیع صدک‌های ۵ گانه قیمت ({steps} گام):</span>
              </span>
              <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-mono">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/20 border border-cyan-500/40 inline-block" />
                  <span>ابر ۹۰٪ (P5-P95)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/40 inline-block" />
                  <span>ابر ۵۰٪ (P25-P75)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-cyan-300 inline-block" />
                  <span>میانه (P50)</span>
                </span>
              </div>
            </div>

            {/* گرافیک SVG مخروط */}
            <div className="w-full overflow-hidden bg-[#0d1017] rounded-xl border border-[#1b212d] p-1">
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto">
                <defs>
                  <linearGradient id="cloudGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                {/* ابر بیرونی ۹۰٪ */}
                <polygon points={outerCloudPoints} fill="url(#cloudGrad)" />

                {/* ابر درونی ۵۰٪ */}
                <polygon points={innerCloudPoints} fill="#06b6d4" fillOpacity="0.2" />

                {/* خط میانه P50 */}
                <polyline
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  points={medianLinePoints}
                />

                {/* خط افقی حد سود Target */}
                <line
                  x1={paddingLeft}
                  y1={getY(targetPrice)}
                  x2={svgWidth - paddingRight}
                  y2={getY(targetPrice)}
                  stroke="#10b981"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                <text
                  x={paddingLeft + 5}
                  y={getY(targetPrice) - 4}
                  fill="#34d399"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  TP: {targetPrice.toFixed(2)}
                </text>

                {/* خط افقی قیمت ورود */}
                <line
                  x1={paddingLeft}
                  y1={getY(initialPrice)}
                  x2={svgWidth - paddingRight}
                  y2={getY(initialPrice)}
                  stroke="#64748b"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={paddingLeft + 5}
                  y={getY(initialPrice) - 4}
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  ورود: {initialPrice.toFixed(2)}
                </text>

                {/* خط افقی حد ضرر Stop Loss */}
                <line
                  x1={paddingLeft}
                  y1={getY(stopLossPrice)}
                  x2={svgWidth - paddingRight}
                  y2={getY(stopLossPrice)}
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                <text
                  x={paddingLeft + 5}
                  y={getY(stopLossPrice) + 11}
                  fill="#fb7185"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  SL: {stopLossPrice.toFixed(2)}
                </text>

                {/* برچسب‌های محور عمودی Y */}
                <text x="5" y={paddingTop + 8} fill="#64748b" fontSize="8" fontFamily="monospace">
                  {maxPrice.toFixed(1)}
                </text>
                <text x="5" y={svgHeight - paddingBottom} fill="#64748b" fontSize="8" fontFamily="monospace">
                  {minPrice.toFixed(1)}
                </text>
              </svg>
            </div>
          </div>

          {/* گزارش تفسیری ریسک به فارسی */}
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 leading-relaxed text-xs ${
              result.isTradeViable
                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                : 'bg-rose-950/20 border-rose-800/40 text-rose-200'
            }`}
          >
            {result.isTradeViable ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-bold block mb-0.5">
                {result.isTradeViable ? 'ارزیابی آماری: ورود موجه و مجاز' : 'ارزیابی آماری: هشدار پرریسک'}
              </span>
              <span>{result.persianRiskAssessment}</span>
            </div>
          </div>

          {/* تنظیمات پارامترهای شبیه‌سازی */}
          <div className="p-4 bg-[#141822] rounded-xl border border-[#232936] space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>تنظیمات پیشرفته متغیرهای مونت‌کارلو:</span>
              </span>
              <button
                type="button"
                onClick={handleRerun}
                className="px-2.5 py-1 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white font-bold flex items-center gap-1 text-[11px] transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>اجرای مجدد ۱۰۰۰ مسیر</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
              <div>
                <label className="text-zinc-400 block mb-1">تعداد مسیرها (Iterations):</label>
                <select
                  value={iterations}
                  onChange={e => setIterations(Number(e.target.value))}
                  className="w-full bg-[#0e1117] border border-[#2b3344] rounded-lg px-2.5 py-1.5 text-zinc-200"
                >
                  <option value={500}>۵۰۰ مسیر (سریع)</option>
                  <option value={1000}>۱۰۰۰ مسیر (استاندارد W4)</option>
                  <option value={2000}>۲۰۰۰ مسیر (دقت بالا)</option>
                </select>
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">افق کندل‌ها (Steps):</label>
                <select
                  value={steps}
                  onChange={e => setSteps(Number(e.target.value))}
                  className="w-full bg-[#0e1117] border border-[#2b3344] rounded-lg px-2.5 py-1.5 text-zinc-200"
                >
                  <option value={30}>۳۰ کندل</option>
                  <option value={50}>۵۰ کندل (پیش‌فرض)</option>
                  <option value={100}>۱۰۰ کندل (بلندمدت)</option>
                </select>
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">نوسان‌پذیری تخمینی سالانه (Sigma):</label>
                <select
                  value={volatility}
                  onChange={e => setVolatility(Number(e.target.value))}
                  className="w-full bg-[#0e1117] border border-[#2b3344] rounded-lg px-2.5 py-1.5 text-zinc-200"
                >
                  <option value={0.12}>۱۲٪ (آرام / فاز فشردگی)</option>
                  <option value={0.16}>۱۶٪ (نرمال جفت‌ارزها و طلا)</option>
                  <option value={0.25}>۲۵٪ (نوسان شدید اخبار)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* دکمه بستن پایین */}
        <div className="p-3 border-t border-[#212735] bg-[#151922] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition-colors"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
};
