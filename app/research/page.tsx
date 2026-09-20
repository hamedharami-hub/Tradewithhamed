'use client';

import React, { useState, useMemo } from 'react';
import { EnvironmentNavBar } from '@/components/navigation/environment-nav-bar';
import { MultiStyleBacktestModal } from '@/components/trading/multi-style-backtest-modal';
import { DataProvenance } from '@/lib/contracts/provenance';
import { SymbolId, Candle, SYMBOL_SPECS } from '@/lib/contracts/market';
import { TradingStyleType, TRADING_STYLES_CONFIG } from '@/lib/contracts/regimes';
import { DataWorkbench } from '@/lib/core/data-workbench';
import { ResearchLab, PerformanceMetrics } from '@/lib/core/research-lab';
import { GOLD_CANDLES_FIXTURE_5M } from '@/lib/replay/fixtures/gold-candles';
import { bundledDatasetForSymbol } from '@/lib/research/bundled-historical-datasets';
import {
  FlaskConical,
  Database,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Play,
  Dice5,
  Upload,
  Info,
  TrendingUp,
  TrendingDown,
  Clock,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';

export default function ResearchPage() {
  const [viewMode, setViewMode] = useState<'SIMPLE' | 'ADVANCED'>('SIMPLE');
  const [isBacktestModalOpen, setIsBacktestModalOpen] = useState(false);

  // وضعیت‌های راهنمای ۶ مرحله‌ای
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [symbol, setSymbol] = useState<SymbolId>('XAUUSD');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [sourceName, setSourceName] = useState<string>('هنوز داده‌ای انتخاب نشده است');
  const [isUserUploaded, setIsUserUploaded] = useState(false);
  const [strategy, setStrategy] = useState<TradingStyleType>('SMC_INTRADAY');

  // پارامترهای هزینه و ریسک با پیش‌فرض‌های آشکار
  const [riskPercent, setRiskPercent] = useState<number>(0.25);
  const [spreadPips, setSpreadPips] = useState<number>(SYMBOL_SPECS.XAUUSD.typicalSpreadPips);
  const [commissionPerLot, setCommissionPerLot] = useState<number>(SYMBOL_SPECS.XAUUSD.commissionPerLot);

  // وضعیت اجرای بک‌تست
  const [isRunning, setIsRunning] = useState(false);
  const [backtestResult, setBacktestResult] = useState<PerformanceMetrics | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [initialTime] = useState(() => Date.now());

  const provenance: DataProvenance = useMemo(() => ({
    originType: isUserUploaded ? 'USER_IMPORTED_CSV' : candles.length > 0 ? 'BUNDLED_HISTORICAL' : 'SAMPLE_FIXTURE',
    originLabelFa: isUserUploaded ? 'دادهٔ واردشده توسط کاربر (CSV)' : candles.length > 0 ? 'دیتاست تاریخی آماده (HistData)' : 'در انتظار انتخاب داده',
    datasetId: `dataset-${symbol.toLowerCase()}`,
    symbol,
    timeframe: '5M',
    timezone: 'UTC',
    lastReceivedAt: initialTime,
    freshnessStatus: 'FRESH',
    stalenessThresholdMs: 86_400_000,
    isVerifiedRealData: candles.length > 0,
    notesFa: 'محیط پژوهش تاریخی؛ محاسبات در مرورگر کلاینت؛ بدون ارسال سفارش به بروکر.',
  }), [isUserUploaded, candles.length, symbol, initialTime]);

  // اعتبارسنجی کیفیت داده
  const dataValidation = useMemo(() => {
    if (candles.length === 0) return { isValid: false, message: 'هیچ کندلی بارگذاری نشده است.' };
    return DataWorkbench.validateCandles(candles, symbol, '5M', sourceName);
  }, [candles, symbol, sourceName]);

  // گام ۱: بارگذاری دیتای آماده
  const handleLoadBundledData = async () => {
    setErrorMessage(null);
    setIsRunning(true);
    try {
      const dataset = bundledDatasetForSymbol(symbol);
      if (!dataset) {
        throw new Error(`دیتاست آماده برای نماد ${symbol} موجود نیست.`);
      }
      const response = await fetch(dataset.url);
      if (!response.ok) throw new Error(`خطای دریافت فایل (کد وضعیت ${response.status})`);
      const parsed = DataWorkbench.parseCSV(await response.text(), 'D1', 0);
      if (parsed.candles.length < 50) throw new Error('تعداد کندل‌های فایل کافی نیست.');

      setCandles(parsed.candles);
      setSourceName(`دیتاست تاریخی ${dataset.labelFa} (${parsed.candles.length} کندل)`);
      setIsUserUploaded(false);
      setCurrentStep(2);
    } catch (err) {
      setErrorMessage(`خطا در بارگذاری داده: ${(err as Error).message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // گام ۱: آپلود فایل CSV کاربر
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = typeof event.target?.result === 'string' ? event.target.result : '';
      const parsed = DataWorkbench.parseCSV(text, '5M', 0);
      if (parsed.candles.length === 0) {
        setErrorMessage('فایل کندل قابل خواندن نیست. ستون‌های time/date، open، high، low و close را کنترل کنید.');
        return;
      }
      setCandles(parsed.candles);
      setSourceName(`دادهٔ واردشده توسط کاربر: ${file.name} (${parsed.candles.length} کندل)`);
      setIsUserUploaded(true);
      setCurrentStep(2);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // گام ۵: اجرای آزمایش بک‌تست تاریخی
  const handleRunBacktest = () => {
    if (candles.length < 50 || !dataValidation.isValid) {
      setErrorMessage('داده‌های کافی یا معتبر برای اجرای بک‌تست وجود ندارد.');
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);

    // اجرای محاسبات تحلیلی شبیه‌ساز در فریم بعدی برای حفظ روانی رابط
    setTimeout(() => {
      try {
        const run = ResearchLab.runBacktest(candles, symbol, {
          initialCash: 10000,
          commissionPerLot,
          defaultSpreadPips: spreadPips,
          style: strategy,
          timeframe: '5M',
        });
        setBacktestResult(run.metrics);
        setCurrentStep(6);
      } catch (err) {
        setErrorMessage(`خطا در اجرای بک‌تست: ${(err as Error).message}`);
      } finally {
        setIsRunning(false);
      }
    }, 50);
  };

  const handleResetWizard = () => {
    setCurrentStep(1);
    setCandles([]);
    setBacktestResult(null);
    setErrorMessage(null);
    setSourceName('هنوز داده‌ای انتخاب نشده است');
    setIsUserUploaded(false);
  };

  return (
    <main className="min-h-screen bg-[#0a0d14] text-zinc-100 flex flex-col font-sans select-none" dir="rtl">
      <EnvironmentNavBar
        currentEnv="RESEARCH"
        provenance={provenance}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
      />

      <div className="flex-1 p-3 sm:p-5 max-w-[1920px] w-full mx-auto space-y-4">
        {/* نوار راهنمای ۶ مرحله‌ای (Stepped Wizard) */}
        <div className="bg-[#101420] border border-[#1d2436] p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between border-b border-[#1b2234] pb-3 mb-4">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-purple-400" />
              <h1 className="text-sm sm:text-base font-bold text-zinc-100">
                مسیر گام‌به‌گام بررسی علمی استراتژی (Research Workflow)
              </h1>
            </div>
            <button
              onClick={handleResetWizard}
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>شروع مجدد آزمایش</span>
            </button>
          </div>

          {/* نوار نشانگر ۶ گام */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
            {[
              { step: 1, title: '۱. انتخاب داده' },
              { step: 2, title: '۲. بررسی کیفیت' },
              { step: 3, title: '۳. انتخاب روش' },
              { step: 4, title: '۴. هزینه و ریسک' },
              { step: 5, title: '۵. اجرای آزمایش' },
              { step: 6, title: '۶. تفسیر نتایج' },
            ].map(s => (
              <div
                key={s.step}
                className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                  currentStep === s.step
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                    : currentStep > s.step
                    ? 'bg-purple-950/40 text-purple-300 border-purple-800'
                    : 'bg-[#151a26] text-zinc-500 border-[#222a3d]'
                }`}
              >
                <span>{s.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* پیام‌های خطا یا هشدار */}
        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs flex items-center justify-between text-rose-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-zinc-400 hover:text-zinc-200">
              بستن
            </button>
          </div>
        )}

        {/* محتوای گام‌های ۶‌گانه */}
        <div className="bg-[#0e121c] border border-[#1b2234] rounded-2xl p-5 shadow-xl">
          {/* گام ۱: انتخاب داده */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">گام ۱: انتخاب نماد و بارگذاری دادهٔ کندل‌ها</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  برای بررسی استراتژی، یکی از گزینه‌های زیر را انتخاب کنید:
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">نماد معاملاتی:</span>
                {(['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'] as SymbolId[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSymbol(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      symbol === s
                        ? 'bg-purple-600 text-white'
                        : 'bg-[#181f30] text-zinc-300 hover:bg-[#222a40]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="bg-[#141926] border border-[#232c40] p-4 rounded-2xl space-y-3">
                  <h3 className="text-xs font-bold text-purple-300 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span>گزینه الف: استفاده از دیتاست تاریخی آماده (HistData)</span>
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    دیتاست‌های استاندارد و پیوستهٔ چندساله که از پیش در سامانه بارگذاری شده‌اند.
                  </p>
                  <button
                    onClick={handleLoadBundledData}
                    disabled={isRunning}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
                  >
                    {isRunning ? 'در حال بارگذاری...' : 'بارگذاری دیتاست تاریخی آماده'}
                  </button>
                </div>

                <div className="bg-[#141926] border border-[#232c40] p-4 rounded-2xl space-y-3">
                  <h3 className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    <span>گزینه ب: بارگذاری فایل CSV اختصاصی شما</span>
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    فایل تاریخچه قیمت خود را با ستون‌های استاندارد OHLCV وارد کنید (برچسب: داده واردشده توسط کاربر).
                  </p>
                  <label className="w-full py-2.5 rounded-xl bg-[#1d2538] hover:bg-[#263148] text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-[#2d3a54] cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>انتخاب و ورود فایل CSV</span>
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* گام ۲: بررسی کیفیت داده */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">گام ۲: گزارش کیفیت و اعتبارسنجی داده</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  سامانه پیش از آزمایش، کیفیت و عدم نگاه به آینده (Look-ahead bias) را بررسی می‌کند:
                </p>
              </div>

              <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">منبع انتخاب‌شده:</span>
                  <span className="font-bold text-purple-300">{sourceName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">تعداد کل کندل‌های معتبر:</span>
                  <span className="font-mono font-bold text-emerald-400">{candles.length} کندل</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">وضعیت اعتبارسنجی:</span>
                  <span className={`font-bold ${dataValidation.isValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {dataValidation.isValid ? 'تأیید شده برای آزمایش' : 'نیازمند بررسی'}
                  </span>
                </div>
              </div>

              {dataValidation.isValid ? (
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 rounded-xl bg-[#1a2132] text-zinc-300 text-xs font-bold"
                  >
                    تغییر داده
                  </button>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md"
                  >
                    تأیید کیفیت و رفتن به انتخاب روش ←
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                  داده‌های بارگذاری‌شده حداقل شرایط لازم را ندارند. لطفاً داده دیگری را انتخاب کنید.
                </div>
              )}
            </div>
          )}

          {/* گام ۳: انتخاب روش و استراتژی */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">گام ۳: انتخاب استراتژی معاملاتی</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  روش معاملاتی مورد نظر خود را برای تست روی این داده انتخاب کنید:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: 'SMC_INTRADAY' as TradingStyleType,
                    title: 'پرایس‌اکشن S0 و سوییپ نقدینگی',
                    desc: 'شکار نقدینگی، تشکیل FVG و ورود در کندل‌های تاییدشده.',
                  },
                  {
                    id: 'TREND_BREAKOUT' as TradingStyleType,
                    title: 'شکست روند (Breakout 55)',
                    desc: 'شکست کانال ۵۵ دوره‌ای هم‌راستا با میانگین متحرک ۲۰۰.',
                  },
                  {
                    id: 'MEAN_REVERSION' as TradingStyleType,
                    title: 'بازگشت به میانگین (Mean Reversion)',
                    desc: 'انحراف آماری از تراز قیمت در بازارهای رنج و فاقد روند.',
                  },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setStrategy(item.id)}
                    className={`p-4 rounded-2xl border text-right space-y-2 transition-all ${
                      strategy === item.id
                        ? 'bg-purple-600/20 border-purple-500 shadow-md'
                        : 'bg-[#141926] border-[#232c40] hover:border-[#2f3b54]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-100">{item.title}</span>
                      {strategy === item.id && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{item.desc}</p>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 rounded-xl bg-[#1a2132] text-zinc-300 text-xs font-bold"
                >
                  بازگشت
                </button>
                <button
                  onClick={() => setCurrentStep(4)}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  تنظیم هزینه و ریسک ←
                </button>
              </div>
            </div>
          )}

          {/* گام ۴: تنظیم هزینه و ریسک */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">گام ۴: هزینه‌های معاملاتی و مدیریت ریسک</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  پیش‌فرض‌های شفاف برای واقع‌گرایانه بودن بک‌تست (عدم نادیده گرفتن اسپرد و کارمزد):
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                  <span className="text-xs text-zinc-400 block">اسپرد معمول (Spread):</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={spreadPips}
                      onChange={e => setSpreadPips(Number(e.target.value) || 0)}
                      className="bg-[#1a2132] border border-[#28334a] rounded-xl px-3 py-1.5 text-xs text-zinc-100 font-mono w-24"
                    />
                    <span className="text-xs text-zinc-500">پیپ</span>
                  </div>
                </div>

                <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                  <span className="text-xs text-zinc-400 block">کارمزد بروکر (Commission):</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      value={commissionPerLot}
                      onChange={e => setCommissionPerLot(Number(e.target.value) || 0)}
                      className="bg-[#1a2132] border border-[#28334a] rounded-xl px-3 py-1.5 text-xs text-zinc-100 font-mono w-24"
                    />
                    <span className="text-xs text-zinc-500">دلار در هر لات</span>
                  </div>
                </div>

                <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                  <span className="text-xs text-zinc-400 block">سقف ریسک هر معامله:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-cyan-400 font-mono">{riskPercent}%</span>
                    <div className="flex items-center gap-1">
                      {[0.1, 0.25, 0.5].map(r => (
                        <button
                          key={r}
                          onClick={() => setRiskPercent(r)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            riskPercent === r ? 'bg-cyan-500 text-black' : 'bg-[#1a2132] text-zinc-400'
                          }`}
                        >
                          {r}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2 rounded-xl bg-[#1a2132] text-zinc-300 text-xs font-bold"
                >
                  بازگشت
                </button>
                <button
                  onClick={() => setCurrentStep(5)}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  آماده‌سازی برای اجرا ←
                </button>
              </div>
            </div>
          )}

          {/* گام ۵: اجرای آزمایش */}
          {currentStep === 5 && (
            <div className="space-y-4 text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto">
                <Play className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-zinc-100">آماده اجرای آزمایش بک‌تست تاریخی</h2>
                <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                  تست استراتژی «{TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy}» بر روی {candles.length} کندل با اسپرد {spreadPips} پیپ و کارمزد ${commissionPerLot}.
                </p>
              </div>

              <button
                onClick={handleRunBacktest}
                disabled={isRunning}
                className="px-8 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-2 transition-all shadow-xl hover:shadow-purple-500/25"
              >
                {isRunning ? (
                  <span>در حال انجام محاسبات در پس‌زمینه...</span>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>اجرای بک‌تست تاریخی</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* گام ۶: توضیح و تفسیر نتایج */}
          {currentStep === 6 && backtestResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#1b2234] pb-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">گام ۶: نتیجه و تفسیر عملکرد استراتژی</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    خلاصه شفاف و قابل‌فهم از شبیه‌سازی گذشته:
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep(5)}
                  className="text-xs text-purple-400 hover:text-purple-300 font-bold"
                >
                  اجرای مجدد با پارامترهای دیگر
                </button>
              </div>

              {/* کارت‌های شاخص‌های کلیدی */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-[#141926] p-3 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">سود/زیان خالص کل:</span>
                  <span className={`text-base font-bold font-mono mt-1 block ${
                    backtestResult.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    ${backtestResult.netProfit.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">با کسر کامل کارمزد و اسپرد</span>
                </div>

                <div className="bg-[#141926] p-3 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">حداکثر افت سرمایه (Drawdown):</span>
                  <span className="text-base font-bold text-amber-400 font-mono mt-1 block">
                    {backtestResult.maxDrawdownPercent}%
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">بزرگ‌ترین کاهش موجودی از اوج</span>
                </div>

                <div className="bg-[#141926] p-3 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">تعداد معاملات / نرخ برد:</span>
                  <span className="text-base font-bold text-zinc-200 font-mono mt-1 block">
                    {backtestResult.totalTrades} معامله ({backtestResult.winRatePercent}٪)
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">درصد معاملات سودآور</span>
                </div>

                <div className="bg-[#141926] p-3 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">فاکتور سود (Profit Factor):</span>
                  <span className="text-base font-bold text-cyan-400 font-mono mt-1 block">
                    {backtestResult.profitFactor}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">نسبت مجموع سود به مجموع زیان</span>
                </div>
              </div>

              {/* خلاصه و تفسیر انسانی */}
              <div className="p-4 bg-[#141926] border border-[#232c40] rounded-2xl space-y-2 text-xs text-zinc-300">
                <div className="flex items-center gap-2 font-bold text-purple-300">
                  <Info className="w-4 h-4" />
                  <span>تفسیر نتایج به زبان ساده:</span>
                </div>
                <p className="leading-relaxed text-zinc-400">
                  استراتژی در بازه مورد بررسی با احتساب کامل اسپرد و کارمزد توانسته فاکتور سود {backtestResult.profitFactor} را ثبت کند. حداکثر دراودان {backtestResult.maxDrawdownPercent}٪ نشان‌دهندهٔ میزان تحملی است که سرمایه‌گذار در بدترین سناریو باید داشته باشد.
                </p>
                <div className="text-[11px] text-zinc-500 border-t border-[#1f2738] pt-2">
                  ⚠️ <strong>محدودیت داده‌های گذشته:</strong> سودآوری در گذشته هرگز تضمینی برای سودآوری در آینده نیست و این گزارش صرفاً ارزش آماری و تحلیلی دارد.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* حالت پیشرفته: آزمایشگاه مونت‌کارلو و بهینه‌سازی پارامترها */}
        {viewMode === 'ADVANCED' && (
          <div className="bg-[#121624] border border-purple-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-300">
                <Sliders className="w-4 h-4" />
                <h3 className="text-xs font-bold">بخش پیشرفته: آزمایشگاه ۱ ساله مونت‌کارلو و شبیه‌سازی ۱۰۰۰ مسیره</h3>
              </div>
              <button
                onClick={() => setIsBacktestModalOpen(true)}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                باز کردن آزمایشگاه پیشرفته مونت‌کارلو
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              دسترسی به شبیه‌سازی آماری بقا در چالش‌های پراپ‌فرم، تحلیل ماتریس شکست و توزیع صدک‌های ۹۵٪.
            </p>
          </div>
        )}
      </div>

      {/* مودال آزمایشگاه جامع ۱ ساله */}
      <MultiStyleBacktestModal
        isOpen={isBacktestModalOpen}
        onClose={() => setIsBacktestModalOpen(false)}
        candles={candles.length > 0 ? candles : GOLD_CANDLES_FIXTURE_5M}
        symbol={symbol}
      />
    </main>
  );
}
