// components/trading/multi-style-backtest-modal.tsx
// مودال آزمایشگاه بک‌تست تاریخی چند سبکه همراه با اعتبارسنجی شورا و شبیه‌سازی مونت‌کارلو
// محاسبات ۱۰۰٪ کلاینت‌ساید و آفلاین، مناسب برای موبایل و لپ‌تاپ اسنپ‌دراگون

'use client';

import React, { useState } from 'react';
import { Candle, SymbolId } from '@/lib/contracts/market';
import { TradingStyleType } from '@/lib/contracts/regimes';
import {
  BacktestReport,
  BacktestSessionFilter,
} from '@/lib/contracts/backtester';
import { MultiStyleBacktester } from '@/lib/core/multi-style-backtester';
import {
  X,
  Play,
  BarChart3,
  Layers,
  Sparkles,
  Clock,
  ShieldAlert,
  Shield,
  Target,
} from 'lucide-react';

interface MultiStyleBacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  candles: Candle[];
  symbol: SymbolId;
}

export const MultiStyleBacktestModal: React.FC<MultiStyleBacktestModalProps> = ({
  isOpen,
  onClose,
  candles,
  symbol,
}) => {
  const [style, setStyle] = useState<TradingStyleType | 'ALL'>('ALL');
  const [minCouncilScore, setMinCouncilScore] = useState<number>(70);
  const [minMcProb, setMinMcProb] = useState<number>(55);
  const [riskPercent, setRiskPercent] = useState<number>(0.5);
  const [enablePartialTp, setEnablePartialTp] = useState<boolean>(true);
  const [sessionFilter, setSessionFilter] = useState<BacktestSessionFilter>('ALL');
  const [useDynamicSpread, setUseDynamicSpread] = useState<boolean>(true);
  const [rolloverBlackout, setRolloverBlackout] = useState<boolean>(true);
  const [intraBarModel, setIntraBarModel] = useState<'PESSIMISTIC' | 'BAR_POLARITY'>('BAR_POLARITY');
  const [newsFilter, setNewsFilter] = useState<boolean>(true);
  const [adaptiveRiskScaling, setAdaptiveRiskScaling] = useState<boolean>(false);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const handleRunBacktest = () => {
    setIsRunning(true);
    // اجرای ماکروتسک با تاخیر ۵۰ میلی‌ثانیه برای جلوگیری از فریز شدن انیمیشن UI
    setTimeout(() => {
      try {
        const res = MultiStyleBacktester.runBacktest(candles, {
          symbol,
          style,
          minAlphaConsensusScore: minCouncilScore,
          minMonteCarloTpProbability: minMcProb,
          riskPerTradePercent: riskPercent,
          enablePartialTp,
          sessionFilter,
          useDynamicSpread,
          rolloverBlackout,
          intraBarModel,
          newsFilter,
          adaptiveRiskScaling,
        });
        setReport(res);
      } finally {
        setIsRunning(false);
      }
    }, 50);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto" dir="rtl">
      <div className="bg-[#11141c] border border-[#262f40] rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* سربرگ مودال */}
        <div className="p-4 border-b border-[#202838] flex items-center justify-between bg-[#141824]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
                <span>بک‌تست جامع چند سبکه با فیلتر شورا و مونت‌کارلو</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                  {symbol} ({candles.length} کندل)
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                شبیه‌سازی دقیق اسپرد پویای سشن‌ها، رفع ابهام کندلی، خروج پله‌ای ۵۰٪ و فیلتر رول‌اور
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* بدنه محتوا اسکرول‌خور */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* پنل تنظیمات ردیف اول */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0d1017] p-3.5 rounded-2xl border border-[#1d2331]">
            {/* سبک معاملاتی */}
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400">سبک معاملاتی:</label>
              <select
                value={style}
                onChange={e => setStyle(e.target.value as TradingStyleType | 'ALL')}
                className="w-full bg-[#151a24] border border-[#2a3344] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-bold"
              >
                <option value="ALL">همه سبک‌ها (تلفیقی)</option>
                <option value="SCALP_M1_M5">اسکلپ سریع M1/M5</option>
                <option value="SMC_INTRADAY">اسمارت‌مانی دی‌تریدینگ (SMC)</option>
                <option value="SWING_MACRO">سوینگ ساختاری H1/H4</option>
                <option value="MEAN_REVERSION">برگشت به میانگین ۲.۵ سیگما</option>
              </select>
            </div>

            {/* حداقل نمره شورا */}
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>حداقل نمره شورا:</span>
                <span className="font-mono text-cyan-400 font-bold">{minCouncilScore}٪</span>
              </label>
              <input
                type="range"
                min="50"
                max="90"
                step="5"
                value={minCouncilScore}
                onChange={e => setMinCouncilScore(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* فیلتر مونت‌کارلو */}
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>احتمال تارگت مونت‌کارلو:</span>
                <span className="font-mono text-purple-400 font-bold">{minMcProb}٪</span>
              </label>
              <input
                type="range"
                min="45"
                max="80"
                step="5"
                value={minMcProb}
                onChange={e => setMinMcProb(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            {/* ریسک در هر معامله */}
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>ریسک هر پوزیشن:</span>
                <span className="font-mono text-amber-400 font-bold">{riskPercent}٪</span>
              </label>
              <div className="flex gap-1">
                {[0.25, 0.5, 1.0].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRiskPercent(r)}
                    className={`flex-1 py-1 rounded-lg font-mono text-[10px] font-bold border ${
                      riskPercent === r
                        ? 'bg-amber-950 text-amber-300 border-amber-700'
                        : 'bg-[#151a24] text-zinc-400 border-[#262f40]'
                    }`}
                  >
                    {r}٪
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* پنل تنظیمات ردیف دوم: ریزساختار بازار، سشن‌ها و ابهام‌زدایی */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-[#0d1017] p-3.5 rounded-2xl border border-[#1d2331]">
            {/* فیلتر سشن معاملاتی */}
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>فیلتر سشن زمانی:</span>
              </label>
              <select
                value={sessionFilter}
                onChange={e => setSessionFilter(e.target.value as BacktestSessionFilter)}
                className="w-full bg-[#151a24] border border-[#2a3344] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-bold"
              >
                <option value="ALL">همه سشن‌ها (۲۴ ساعته)</option>
                <option value="LONDON">سشن لندن (07:00-13:00 UTC)</option>
                <option value="LONDON_NY_OVERLAP">هم‌پوشانی طلایی لندن و NY (13:00-16:30)</option>
                <option value="NEW_YORK">سشن نیویورک عصر (16:30-21:00 UTC)</option>
                <option value="ASIA">سشن آسیا (00:00-07:00 UTC)</option>
              </select>
            </div>

            {/* مدل حل ابهام درون‌کندلی */}
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400">رفع ابهام برخورد SL/TP:</label>
              <select
                value={intraBarModel}
                onChange={e => setIntraBarModel(e.target.value as 'PESSIMISTIC' | 'BAR_POLARITY')}
                className="w-full bg-[#151a24] border border-[#2a3344] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-bold"
              >
                <option value="BAR_POLARITY">قطبیت بدنه کندل (Bar Polarity - واقع‌گرایانه)</option>
                <option value="PESSIMISTIC">سخت‌گیرانه بدبینانه (Pessimistic SL)</option>
              </select>
            </div>

            {/* تاگل اسپرد متغیر پویا */}
            <div className="flex items-center justify-between sm:justify-center gap-2 bg-[#151a24] px-3 py-2 rounded-xl border border-[#262f40]">
              <label className="flex items-center gap-2 cursor-pointer w-full justify-between">
                <span className="text-[11px] text-zinc-300 font-bold">اسپرد پویای سشن‌ها</span>
                <input
                  type="checkbox"
                  checked={useDynamicSpread}
                  onChange={e => setUseDynamicSpread(e.target.checked)}
                  className="rounded accent-cyan-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            {/* تاگل فیلتر رول‌اور شبانه */}
            <div className="flex items-center justify-between sm:justify-center gap-2 bg-[#151a24] px-3 py-2 rounded-xl border border-[#262f40]">
              <label className="flex items-center gap-2 cursor-pointer w-full justify-between">
                <span className="text-[11px] text-zinc-300 font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>بلک‌اوت رول‌اور شبانه</span>
                </span>
                <input
                  type="checkbox"
                  checked={rolloverBlackout}
                  onChange={e => setRolloverBlackout(e.target.checked)}
                  className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            {/* تاگل فیلتر اخبار پرریسک تقویم */}
            <div className="flex items-center justify-between sm:justify-center gap-2 bg-[#151a24] px-3 py-2 rounded-xl border border-[#262f40]">
              <label className="flex items-center gap-2 cursor-pointer w-full justify-between">
                <span className="text-[11px] text-zinc-300 font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  <span>فیلتر اخبار ماکرو (News)</span>
                </span>
                <input
                  type="checkbox"
                  checked={newsFilter}
                  onChange={e => setNewsFilter(e.target.checked)}
                  className="rounded accent-rose-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            {/* تاگل ریسک تطبیقی ضد تیلت */}
            <div className="flex items-center justify-between sm:justify-center gap-2 bg-[#151a24] px-3 py-2 rounded-xl border border-[#262f40]">
              <label className="flex items-center gap-2 cursor-pointer w-full justify-between">
                <span className="text-[11px] text-zinc-300 font-bold flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ریسک تطبیقی (ضد تیلت)</span>
                </span>
                <input
                  type="checkbox"
                  checked={adaptiveRiskScaling}
                  onChange={e => setAdaptiveRiskScaling(e.target.checked)}
                  className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* نوار اکشن و تاگل خروج پله‌ای */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#141924] p-3 rounded-2xl border border-[#232c3d]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enablePartialTp}
                onChange={e => setEnablePartialTp(e.target.checked)}
                className="rounded accent-emerald-500 w-4 h-4"
              />
              <span className="text-zinc-200 text-xs font-bold">
                فعال‌سازی خروج ۵۰٪ در ۱.۲R و ریسک‌فری خودکار (فاز ۲)
              </span>
            </label>

            <button
              type="button"
              onClick={handleRunBacktest}
              disabled={isRunning}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              {isRunning ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>در حال شبیه‌سازی و بررسی شورا...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>اجرای فوری بک‌تست تاریخی</span>
                </>
              )}
            </button>
          </div>

          {/* نتایج بک‌تست */}
          {report && (
            <div className="space-y-4 pt-2">
              {/* کارت‌های شاخص‌های کلیدی عملکرد */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
                <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                  <span className="text-[10px] text-zinc-400">تعداد کل معاملات</span>
                  <div className="font-mono text-base font-bold text-zinc-100">{report.summary.totalTrades}</div>
                </div>

                <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                  <span className="text-[10px] text-zinc-400">وین‌ریت (درصد برد)</span>
                  <div className={`font-mono text-base font-bold ${
                    report.summary.winRatePercent >= 55 ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {report.summary.winRatePercent}٪
                  </div>
                </div>

                <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                  <span className="text-[10px] text-zinc-400">سود خالص (دلار)</span>
                  <div className={`font-mono text-base font-bold ${
                    report.summary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`} dir="ltr">
                    {report.summary.netProfit >= 0 ? `+$${report.summary.netProfit}` : `-$${Math.abs(report.summary.netProfit)}`}
                  </div>
                </div>

                <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                  <span className="text-[10px] text-zinc-400">پرافیت فاکتور</span>
                  <div className="font-mono text-base font-bold text-cyan-400">{report.summary.profitFactor}</div>
                </div>

                <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                  <span className="text-[10px] text-zinc-400">حداکثر افت سرمایه (DD)</span>
                  <div className="font-mono text-base font-bold text-rose-400">{report.summary.maxDrawdownPercent}٪</div>
                </div>

                <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                  <span className="text-[10px] text-zinc-400">نسبت شارپ</span>
                  <div className="font-mono text-base font-bold text-purple-400">{report.summary.sharpeRatio}</div>
                </div>
              </div>

              {/* منحنی اکوئیتی SVG */}
              {report.equityCurve.length > 1 && (
                <div className="p-3.5 bg-[#0e121a] rounded-2xl border border-[#1e2535] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-200">منحنی رشد سرمایه (Equity Curve)</span>
                    <span className="text-zinc-400 text-[10px]">
                      موجودی اولیه: ${report.config.initialCapital} → پایانی: ${report.equityCurve[report.equityCurve.length - 1].equity}
                    </span>
                  </div>
                  <div className="h-36 w-full relative">
                    <svg className="w-full h-full" viewBox="0 0 500 120" preserveAspectRatio="none">
                      {/* خط پایه سرمایه اولیه */}
                      <line x1="0" y1="60" x2="500" y2="60" stroke="#263042" strokeDasharray="3,3" strokeWidth="1" />
                      {/* خط منحنی اکوئیتی */}
                      {(() => {
                        const minEq = Math.min(...report.equityCurve.map(p => p.equity), report.config.initialCapital * 0.95);
                        const maxEq = Math.max(...report.equityCurve.map(p => p.equity), report.config.initialCapital * 1.05);
                        const range = maxEq - minEq || 1;
                        const points = report.equityCurve.map((p, idx) => {
                          const x = (idx / (report.equityCurve.length - 1)) * 500;
                          const y = 110 - ((p.equity - minEq) / range) * 100;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        }).join(' ');

                        return (
                          <polyline
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={points}
                          />
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              )}

              {/* تفکیک عملکرد بر اساس رژیم بازار و دقت مونت‌کارلو */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* ارزیابی همبستگی مونت‌کارلو */}
                <div className="p-3 bg-[#0d1017] rounded-xl border border-[#1e2535] space-y-1.5">
                  <span className="font-bold text-purple-300 flex items-center gap-1.5 text-[11px]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>سنجش دقت پیش‌بینی موتور مونت‌کارلو</span>
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-center text-[10px] pt-1">
                    <div className="p-2 rounded-lg bg-[#141822]">
                      <span className="text-zinc-400">وین‌ریت پیش‌بینی بالا (&ge;۶۵٪)</span>
                      <div className="font-mono text-emerald-400 font-bold text-xs">
                        {report.monteCarloAccuracy.highProbWinRate}٪ ({report.monteCarloAccuracy.highProbTradesCount} معامله)
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#141822]">
                      <span className="text-zinc-400">وین‌ریت پیش‌بینی معمولی</span>
                      <div className="font-mono text-zinc-300 font-bold text-xs">
                        {report.monteCarloAccuracy.lowProbWinRate}٪ ({report.monteCarloAccuracy.lowProbTradesCount} معامله)
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 pt-1">
                    {report.monteCarloAccuracy.correlationNoteFa}
                  </p>
                </div>

                {/* تفکیک بر اساس سبک یا رژیم */}
                <div className="p-3 bg-[#0d1017] rounded-xl border border-[#1e2535] space-y-1.5">
                  <span className="font-bold text-cyan-300 flex items-center gap-1.5 text-[11px]">
                    <Layers className="w-3.5 h-3.5" />
                    <span>توزیع سود بر اساس رژیم‌های بازار</span>
                  </span>
                  <div className="space-y-1 pt-1 max-h-28 overflow-y-auto">
                    {Object.entries(report.regimePerformance).map(([regKey, stat]) => (
                      <div key={regKey} className="flex items-center justify-between p-1.5 rounded bg-[#131722] text-[10px]">
                        <span className="text-zinc-300 font-mono">{regKey}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-400">{stat?.tradesCount} معامله</span>
                          <span className="text-cyan-400 font-mono font-bold">{stat?.winRate}٪</span>
                          <span className={`font-mono font-bold ${
                            (stat?.netProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`} dir="ltr">
                            ${stat?.netProfit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ارزیابی بقا و ریسک ورشکستگی مونت‌کارلو در پراپ‌فرم */}
              {report.equityMonteCarlo && (
                <div className="p-4 bg-gradient-to-br from-[#101420] to-[#0c1018] rounded-2xl border border-[#232c40] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c2436] pb-2.5">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-zinc-100 text-xs">
                        تحلیل مونت‌کارلو توالی معاملات و بقا در چالش‌های پراپ‌فرم ({report.equityMonteCarlo.iterations} تکرار)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                        report.equityMonteCarlo.safetyRating === 'INSTITUTIONAL_SAFE'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : report.equityMonteCarlo.safetyRating === 'ROBUST_EDGE'
                          ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                          : report.equityMonteCarlo.safetyRating === 'MODERATE_RISK'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}>
                        {report.equityMonteCarlo.safetyRating === 'INSTITUTIONAL_SAFE'
                          ? 'امنیت سطح سازمانی'
                          : report.equityMonteCarlo.safetyRating === 'ROBUST_EDGE'
                          ? 'برتری آماری مستحکم'
                          : report.equityMonteCarlo.safetyRating === 'MODERATE_RISK'
                          ? 'ریسک متوسط'
                          : 'هشدار ریسک ورشکستگی'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                    <div className="p-2 rounded-xl bg-[#141926] border border-[#1f2638]">
                      <span className="text-zinc-400 text-[10px]">احتمال قبولی در چالش</span>
                      <div className="font-mono font-bold text-emerald-400 text-sm">
                        {report.equityMonteCarlo.riskMetrics.propFirmPassProbabilityPercent}٪
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-[#141926] border border-[#1f2638]">
                      <span className="text-zinc-400 text-[10px]">احتمال ورشکستگی (Ruin)</span>
                      <div className={`font-mono font-bold text-sm ${
                        report.equityMonteCarlo.riskMetrics.ruinProbabilityPercent <= 5 ? 'text-cyan-400' : 'text-rose-400'
                      }`}>
                        {report.equityMonteCarlo.riskMetrics.ruinProbabilityPercent}٪
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-[#141926] border border-[#1f2638]">
                      <span className="text-zinc-400 text-[10px]">دراودان سناریوی ۹۵٪</span>
                      <div className="font-mono font-bold text-amber-400 text-sm">
                        {report.equityMonteCarlo.drawdownDistribution.p95}٪
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-[#141926] border border-[#1f2638]">
                      <span className="text-zinc-400 text-[10px]">میانه بدترین زنجیره ضرر</span>
                      <div className="font-mono font-bold text-zinc-200 text-sm">
                        {report.equityMonteCarlo.riskMetrics.medianMaxConsecutiveLosses} معامله
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-300 bg-[#121622] p-2.5 rounded-xl border border-[#1e2536] leading-relaxed">
                    {report.equityMonteCarlo.summaryFa}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
