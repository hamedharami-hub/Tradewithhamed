// components/trading/offline-ai-manager-modal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  PLAN_V4_MODELS,
  BrowserAIModelRecord,
  BrowserOfflineAIManager,
  WebGPUCapabilityReport,
  ProgressReportPayload,
} from '@/lib/ai/browser-offline-ai';
import {
  Bot,
  Download,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  HardDrive,
  X,
  Sparkles,
  Zap,
  HelpCircle,
  Cpu,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Play,
  Square,
  AlertCircle,
  StopCircle,
} from 'lucide-react';

interface OfflineAIManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  currentPrice: number;
  symbol: string;
}

export const OfflineAIManagerModal: React.FC<OfflineAIManagerModalProps> = ({
  isOpen,
  onClose,
  selectedModelId,
  onSelectModel,
  currentPrice,
  symbol,
}) => {
  const [downloadedMap, setDownloadedMap] = useState<Record<string, boolean>>({});
  const [supportedMap, setSupportedMap] = useState<Record<string, boolean>>({});
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ProgressReportPayload>({
    percent: 0,
    downloadedMB: 0,
    totalMB: 0,
    speedMBs: 0,
    text: '',
  });

  const [residentModelId, setResidentModelId] = useState<string | null>(null);
  const [runtimeState, setRuntimeState] = useState('IDLE');
  const [hardwareReport, setHardwareReport] = useState<WebGPUCapabilityReport | null>(null);
  const [testResult, setTestResult] = useState<{
    modelId: string;
    text: string;
    latencyMs: number;
    ttftMs?: number;
    chunksPerSec?: number;
  } | null>(null);
  const [customPrompt, setCustomPrompt] = useState('وضعیت سوییپ نقدینگی و FVG در این تایم‌فریم را تحلیل کن و پیشنهاد ورود بده.');
  const [isTesting, setIsTesting] = useState(false);
  const [isVerifyingOffline, setIsVerifyingOffline] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<'ALL' | 'ULTRA_DENSE' | 'HEAVY_POWER' | 'MOBILE_TABLET' | 'ZERO_WEIGHT'>('ALL');

  // به‌روزرسانی وضعیت و سنجش سخت‌افزار
  const refreshStatus = async () => {
    const report = await BrowserOfflineAIManager.probeHardware();
    const resident = BrowserOfflineAIManager.getResidentModelId();
    const runtime = BrowserOfflineAIManager.getRuntimeStatus();
    const entries = await Promise.all(PLAN_V4_MODELS.map(async model => [model.id, await BrowserOfflineAIManager.isModelDownloaded(model.id), await BrowserOfflineAIManager.isModelSupported(model.id)] as const));
    const map = Object.fromEntries(entries.map(([id, downloaded]) => [id, downloaded]));
    const supported = Object.fromEntries(entries.map(([id, , isSupported]) => [id, isSupported]));
    setHardwareReport(report);
    setResidentModelId(resident);
    setRuntimeState(runtime.state);
    setDownloadedMap(map);
    setSupportedMap(supported);
  };

  useEffect(() => {
    if (!isOpen) return;
    let isSubscribed = true;

    const runProbe = async () => {
      const report = await BrowserOfflineAIManager.probeHardware();
      const resident = BrowserOfflineAIManager.getResidentModelId();
      const runtime = BrowserOfflineAIManager.getRuntimeStatus();
      const entries = await Promise.all(PLAN_V4_MODELS.map(async model => [model.id, await BrowserOfflineAIManager.isModelDownloaded(model.id), await BrowserOfflineAIManager.isModelSupported(model.id)] as const));
      const map = Object.fromEntries(entries.map(([id, downloaded]) => [id, downloaded]));
      const supported = Object.fromEntries(entries.map(([id, , isSupported]) => [id, isSupported]));
      if (isSubscribed) {
        setHardwareReport(report);
        setResidentModelId(resident);
        setRuntimeState(runtime.state);
        setDownloadedMap(map);
        setSupportedMap(supported);
      }
    };

    runProbe();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // شروع دانلود واقعی و بارگذاری در WebGPU با تایید کاربر
  const handleStartDownload = async (model: BrowserAIModelRecord) => {
    if (model.runtime === 'Core-Deterministic') {
      onSelectModel(model.id);
      setActionMessage(`موتور قطعی ${model.name} فعال شد.`);
      return;
    }

    const consent = confirm(
      `درخواست تایید دانلود فایل‌های مدل:\n` +
      `مدل: ${model.name}\n` +
      `حجم تقریبی فایل‌ها: حدود ${model.downloadSizeMB} مگابایت\n` +
      `محل ذخیره: CacheStorage مرورگر (کاملاً محلی بدون دخالت سرور)\n\n` +
      `آیا با شروع دانلود و بارگذاری این مدل در حافظه WebGPU موافقید؟`
    );
    if (!consent) return;

    try {
      setDownloadingModelId(model.id);
      setDownloadProgress({
        percent: 0,
        downloadedMB: 0,
        totalMB: model.downloadSizeMB,
        speedMBs: 0,
        text: 'در حال آماده‌سازی و اتصال به مخزن مدل...',
      });

      const loadRes = await BrowserOfflineAIManager.loadModelToMemory(model.id, (prog) => {
        setDownloadProgress(prog);
      });

      await refreshStatus();
      if (loadRes.success) {
        onSelectModel(model.id);
        setActionMessage(loadRes.messageFa);
      } else {
        alert(loadRes.messageFa);
      }
    } catch (err) {
      alert(`خطا در فرآیند بارگذاری: ${(err as Error).message}`);
    } finally {
      setDownloadingModelId(null);
    }
  };

  // بارگذاری مدل در رم گرافیک
  const handleLoadModel = async (modelId: string) => {
    setActionMessage('در حال بارگذاری شیدرهای WebGPU و خط لوله استنتاج...');
    try {
      const result = await BrowserOfflineAIManager.loadModelToMemory(modelId);
      await refreshStatus();
      if (result.success) {
        onSelectModel(modelId);
        setActionMessage(result.messageFa);
      } else {
        setActionMessage(result.messageFa);
      }
    } catch (error) {
      setActionMessage(`خطای بارگذاری: ${(error as Error).message}`);
    }
  };

  // تخلیه مدل از رم گرافیک
  const handleUnloadModel = async () => {
    try {
      const result = await BrowserOfflineAIManager.unloadModelFromMemory();
      await refreshStatus();
      setActionMessage(result.messageFa);
    } catch (error) {
      setActionMessage(`خطای تخلیه مدل: ${(error as Error).message}`);
    }
  };

  // حذف فایل‌های مدل از CacheStorage
  const handleDeleteModel = async (modelId: string) => {
    if (confirm('آیا مطمئن هستید می‌خواهید فایل‌های کش این مدل را از مرورگر پاک کنید؟')) {
      try {
        const deleted = await BrowserOfflineAIManager.deleteModel(modelId);
        await refreshStatus();
        if (deleted && selectedModelId === modelId) {
          onSelectModel('s0-deterministic');
        }
        setActionMessage(deleted ? 'فایل‌های مدل از حافظه کش مرورگر پاک شدند.' : 'حذف فایل مدل انجام نشد.');
      } catch (error) {
        setActionMessage(`خطای حذف مدل: ${(error as Error).message}`);
      }
    }
  };

  // اجرای استنتاج زنده با استریم توکن‌ها
  const handleRunTest = async (modelId: string) => {
    setIsTesting(true);
    setTestResult({ modelId, text: '', latencyMs: 0 });
    try {
      const output = await BrowserOfflineAIManager.runOfflineInferenceTest(
        modelId,
        customPrompt,
        symbol,
        currentPrice,
        (partialText) => {
          setTestResult((prev) =>
            prev
              ? { ...prev, text: partialText }
              : { modelId, text: partialText, latencyMs: 0 }
          );
        }
      );
      setTestResult({
        modelId,
        text: output.text,
        latencyMs: output.latencyMs,
        ttftMs: output.ttftMs,
        chunksPerSec: output.chunksPerSec,
      });
      await refreshStatus();
    } catch (err) {
      setTestResult({
        modelId,
        text: `خطا در استنتاج: ${(err as Error).message}`,
        latencyMs: 0,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // توقف فوری تولید پاسخ
  const handleStopTest = () => {
    BrowserOfflineAIManager.stopInference();
    setIsTesting(false);
  };

  const handleVerifyOffline = async (modelId: string) => {
    setIsVerifyingOffline(true);
    try {
      const result = await BrowserOfflineAIManager.verifyCachedModelOffline(modelId);
      setActionMessage(result.messageFa);
      await refreshStatus();
    } finally {
      setIsVerifyingOffline(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-[#12151d] border border-[#262c3b] w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-right font-sans">
        {/* سربرگ مرکز مدل با طراحی متریال ۳ */}
        <div className="px-5 py-4 border-b border-[#232938] flex items-center justify-between bg-[#10131a]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-700/60 text-cyan-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm md:text-base font-bold text-zinc-100">
                  مرکز مدل‌های هوش مصنوعی داخل مرورگر (Browser AI v4.0)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-mono">
                  WebLLM / WebGPU Worker
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                استنتاج محلی در مرورگر؛ دانلود اولیه مدل ممکن است به شبکه نیاز داشته باشد.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-[#1b202c] hover:bg-[#252c3c] text-zinc-400 hover:text-white transition-colors border border-[#2b3345]"
            aria-label="بستن پنجره"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* پیام اطلاع‌رسانی وضعیت آخرین عملیات */}
        {actionMessage && (
          <div className="px-5 py-2 bg-cyan-950/40 border-b border-cyan-800/40 text-cyan-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{actionMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-cyan-400 hover:text-cyan-200 text-xs"
            >
              بستن
            </button>
          </div>
        )}

        {/* بدنه اسکرول‌شونده خلوت و مناسب مطالعه */}
        <div className="p-4 md:p-6 space-y-4 overflow-y-auto text-xs">
          {/* کارت پایش سلامت و قابلیت‌های سخت‌افزاری مرورگر (Capability Probe) */}
          {hardwareReport && (
            <div className="bg-[#171b25] border border-[#283142] rounded-2xl p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-[#242b3a]">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-zinc-200">وضعیت سخت‌افزار و شتاب‌دهنده مرورگر:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      hardwareReport.hasWebGPU
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {hardwareReport.hasWebGPU ? 'WebGPU ACTIVE' : 'NO WEBGPU (FALLBACK TO CORE)'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 space-y-1">
                  <div>
                    مدل مقیم فعلی در رم گرافیک:{' '}
                    <span className="font-bold text-amber-300 font-mono">
                      {residentModelId || 'خالی (هیچ مدلی در رم نیست)'}
                    </span>
                  </div>
                  <div>وضعیت عملیات: <span className="font-mono text-cyan-300">{runtimeState}</span></div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-[11px]">
                <div className="bg-[#12151e] p-2.5 rounded-xl border border-[#212735]">
                  <span className="text-zinc-400 block text-[10px]">کارت گرافیک شناسایی‌شده:</span>
                  <span className="text-zinc-200 font-mono truncate block" title={hardwareReport.adapterName}>
                    {hardwareReport.adapterName}
                  </span>
                </div>
                <div className="bg-[#12151e] p-2.5 rounded-xl border border-[#212735]">
                  <span className="text-zinc-400 block text-[10px]">پشتیبانی Shader-F16:</span>
                  <span
                    className={`font-mono font-bold ${
                      hardwareReport.hasShaderF16 ? 'text-emerald-400' : 'text-zinc-400'
                    }`}
                  >
                    {hardwareReport.hasShaderF16 ? 'پشتیبانی می‌شود (f16)' : 'عدم پشتیبانی (f32 fallback)'}
                  </span>
                </div>
                <div className="bg-[#12151e] p-2.5 rounded-xl border border-[#212735]">
                  <span className="text-zinc-400 block text-[10px]">سهمیه حافظه مرورگر:</span>
                  <span className="text-zinc-200 font-mono">
                    {hardwareReport.estimatedStorageUsageMB} MB / {hardwareReport.estimatedStorageQuotaMB} MB
                  </span>
                </div>
                <div className="bg-[#12151e] p-2.5 rounded-xl border border-[#212735]">
                  <span className="text-zinc-400 block text-[10px]">ورکر پس‌زمینه (Dedicated Worker):</span>
                  <span className={hardwareReport.isDedicatedWorkerSupported ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {hardwareReport.isDedicatedWorkerSupported ? 'قابل استفاده در ترد مجزا' : 'در این مرورگر در دسترس نیست'}
                  </span>
                </div>
              </div>

              <div className="mt-3 p-2.5 bg-[#141824] rounded-xl text-zinc-300 text-[11px] flex items-center justify-between">
                <span>{hardwareReport.recommendationFa}</span>
                {residentModelId && residentModelId !== 's0-deterministic' && (
                  <button
                    type="button"
                    onClick={handleUnloadModel}
                    className="px-2 py-1 rounded-lg bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900 transition-colors text-[10px] flex items-center gap-1"
                  >
                    <Square className="w-3 h-3" />
                    <span>تخلیه رم گرافیک</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* جعبه تاشوی راهنمای آموزشی */}
          <div className="bg-[#171b25] border border-[#283142] rounded-2xl p-4">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between text-zinc-100 font-bold text-xs"
            >
              <div className="flex items-center gap-2 text-cyan-400">
                <HelpCircle className="w-4 h-4" />
                <span>قوانین معماری و تفاوت مدل‌های نسخه ۴.۰ حامد حرمی‌پور</span>
              </div>
              <div className="text-zinc-400 flex items-center gap-1 text-xs">
                <span>{showGuide ? 'بستن' : 'نمایش'}</span>
                {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showGuide && (
              <div className="mt-3 pt-3 border-t border-[#232938] space-y-2 text-zinc-300 text-[11px] leading-relaxed">
                <p>
                  • <strong>تک‌مدلی در حافظه (Resident Rule):</strong> برای جلوگیری از کرش تب مرورگر و مدیریت حرارت، در هر لحظه تنها یک مدل مولد در حافظه WebGPU قرار می‌گیرد.
                </p>
                <p>
                  • <strong>آفلاین قطعی:</strong> پس از یک بار دانلود، با قطع کامل اینترنت و ریستارت سیستم، مدل همچنان از حافظه کش مرورگر اجرا می‌شود.
                </p>
                <p>
                  • <strong>عدم دسترسی مدل به ریسک:</strong> مدل هوش مصنوعی تنها نقش مشورتی و فیلتر شواهد را دارد و هرگز مجاز به تغییر حجم، تعیین ریسک یا ارسال خودکار سفارش به بروکر نیست.
                </p>
              </div>
            )}
          </div>

          {/* بنر آزادی انتخاب مدل‌های سنگین روی موبایل/تبلت ۱۶ گیگابایت */}
          <div className="p-3.5 bg-gradient-to-r from-cyan-950/60 via-purple-950/40 to-slate-900 rounded-2xl border border-cyan-800/50 flex items-start gap-3 text-[11px] text-zinc-300 leading-relaxed shadow-sm">
            <Sparkles className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold text-white block mb-0.5">
                راهنمای سخت‌افزار: انتخاب مدل‌های چگال استدلال و گزینه‌های سنگین
              </span>
              <span>
                بر روی دستگاه‌های قدرتمند نظیر <strong className="text-cyan-300">Google Pixel 9 Pro Fold (۱۶ گیگابایت رم)</strong>، تبلت‌ها و لپ‌تاپ‌های <strong className="text-purple-300">Snapdragon X Plus</strong>، مدل‌های بهینه و چگال با بالاترین راندمان استدلال (Phi-4-mini، Llama-3.2 و Qwen2.5-7B) مستقیماً و به صورت ۱۰۰٪ آفلاین در WebGPU مرورگر اجرا می‌شوند. مدل‌های سنگین‌تر ۱۴ میلیاردی به عنوان معماری‌های تکمیلی برای سناریوهای سرور استنتاج محلی در نظر گرفته شده‌اند.
              </span>
            </div>
          </div>

          {/* فهرست کارت‌های مدل‌های طرح نسخه ۴.۰ */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>کاتالوگ مدل‌های هوش مصنوعی (نسخه ۴.۰):</span>
              </h3>

              {/* فیلتر دسته‌بندی مدل‌ها */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setFilterTier('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    filterTier === 'ALL'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-[#181d28] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  همه ({PLAN_V4_MODELS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTier('ULTRA_DENSE')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    filterTier === 'ULTRA_DENSE'
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#181d28] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  بالاترین چگالی استدلال (Dense)
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTier('HEAVY_POWER')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    filterTier === 'HEAVY_POWER'
                      ? 'bg-rose-600 text-white'
                      : 'bg-[#181d28] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  مدل‌های ۱۴ میلیاردی و سنگین
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTier('MOBILE_TABLET')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    filterTier === 'MOBILE_TABLET'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#181d28] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  بهینه موبایل و تبلت
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTier('ZERO_WEIGHT')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    filterTier === 'ZERO_WEIGHT'
                      ? 'bg-amber-600 text-white'
                      : 'bg-[#181d28] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  بدون دانلود (توکار)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PLAN_V4_MODELS.filter((m) => {
                if (filterTier === 'ALL') return true;
                if (filterTier === 'ULTRA_DENSE') return m.densityTier === 'ULTRA_DENSE';
                if (filterTier === 'HEAVY_POWER') return m.densityTier === 'HEAVY_POWER';
                if (filterTier === 'ZERO_WEIGHT') return m.densityTier === 'ZERO_WEIGHT';
                if (filterTier === 'MOBILE_TABLET') {
                  return m.recommendedDevices?.includes('MOBILE_16GB') || m.recommendedDevices?.includes('TABLET');
                }
                return true;
              }).map((model) => {
                const isSelected = selectedModelId === model.id;
                const isSupported = supportedMap[model.id] ?? model.runtime === 'Core-Deterministic';
                const isDownloaded = downloadedMap[model.id] || model.runtime === 'Core-Deterministic';
                const isResident = residentModelId === model.id;
                const isCurrentlyDownloading = downloadingModelId === model.id;
                const isVerified = BrowserOfflineAIManager.isOfflineVerified(model.id);

                return (
                  <div
                    key={model.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#182030] border-cyan-600/70 shadow-lg ring-1 ring-cyan-500/30'
                        : 'bg-[#151924] border-[#252d3d] hover:border-[#313b50]'
                    }`}
                  >
                    <div>
                      {/* ردیف عنوان، تگ‌ها و وضعیت */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-zinc-100 text-xs">{model.name}</h4>
                            {model.runtime === 'Core-Deterministic' && (
                              <span className="px-1.5 py-0.5 text-[9px] bg-emerald-950 text-emerald-300 rounded font-bold border border-emerald-800">
                                توکار
                              </span>
                            )}
                            {model.densityBadgeFa && (
                              <span
                                className={`px-1.5 py-0.5 text-[9px] rounded font-bold border ${
                                  model.densityTier === 'ULTRA_DENSE'
                                    ? 'bg-purple-950 text-purple-300 border-purple-800'
                                    : model.densityTier === 'HEAVY_POWER'
                                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                                    : model.densityTier === 'ZERO_WEIGHT'
                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                    : 'bg-cyan-950 text-cyan-300 border-cyan-800'
                                }`}
                              >
                                {model.densityBadgeFa}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400 font-mono mt-1 block">
                            {model.params} • {model.quantization} • {model.runtime}
                          </span>
                        </div>

                        {/* نشان وضعیت اقامت در رم یا تایید آفلاین */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {isResident && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1 animate-pulse">
                              <Zap className="w-2.5 h-2.5" />
                              <span>مقیم در VRAM</span>
                            </span>
                          )}
                          {isVerified && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              <span>آفلاین تاییدشده</span>
                            </span>
                          )}
                          {!isSupported && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] bg-rose-950/80 text-rose-300 border border-rose-800">
                              artifact پشتیبانی نمی‌شود
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-zinc-300 mt-2.5 leading-relaxed">
                        {model.descriptionFa}
                      </p>

                      {/* اطلاعات فنی و حجم */}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] bg-[#10131b] p-2.5 rounded-xl border border-[#1f2533]">
                        <div>
                          <span className="text-zinc-500">حجم دانلود: </span>
                          <span className="text-zinc-200 font-mono">
                            {model.downloadSizeMB > 0 ? `${model.downloadSizeMB} MB` : 'صفر (توکار)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">تخمین رم/VRAM: </span>
                          <span className="text-zinc-200 font-mono">
                            {model.estimatedVRAMMB > 0 ? `${model.estimatedVRAMMB} MB` : 'سبک'}
                          </span>
                        </div>
                        <div className="col-span-2 flex items-center gap-1.5 pt-1 border-t border-[#1a1f2c]">
                          <span className="text-zinc-500">دستگاه پیشنهادی: </span>
                          <span className="text-cyan-300 font-medium">{model.targetDeviceFa}</span>
                        </div>
                      </div>

                      {/* نوار پیشرفت در حین دانلود و کامپایل شیدرهای WebGPU */}
                      {isCurrentlyDownloading && (
                        <div className="mt-3 p-3 bg-[#111622] rounded-xl border border-cyan-800/60 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-cyan-300">
                            <span className="truncate max-w-[200px]" title={downloadProgress.text}>
                              {downloadProgress.text || 'در حال آماده‌سازی خط لوله WebLLM...'}
                            </span>
                            <span className="font-mono">{downloadProgress.percent}٪</span>
                          </div>
                          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-cyan-500 h-2 transition-all duration-150"
                              style={{ width: `${downloadProgress.percent}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                            <span>
                              {downloadProgress.downloadedMB} MB از {downloadProgress.totalMB} MB
                            </span>
                            <span>سرعت: {downloadProgress.speedMBs} MB/s</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* دکمه‌های کنترلی کارت */}
                    <div className="mt-4 pt-3 border-t border-[#232938] flex items-center justify-between gap-2">
                      {!isSupported ? (
                        <div className="w-full py-2 px-3 rounded-xl bg-rose-950/30 text-rose-300 border border-rose-900 text-xs text-center">
                          این مدل در WebLLM registry یا runtime فعلی قابل اجرا نیست.
                        </div>
                      ) : !isDownloaded ? (
                        <button
                          type="button"
                          onClick={() => handleStartDownload(model)}
                          disabled={isCurrentlyDownloading}
                          className="w-full py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 text-xs shadow-md"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>درخواست دانلود ({model.downloadSizeMB} MB)</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 w-full">
                          {/* دکمه بارگذاری یا انتخاب */}
                          {!isResident ? (
                            <button
                              type="button"
                              onClick={() => handleLoadModel(model.id)}
                              className="flex-1 py-1.5 px-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white font-bold flex items-center justify-center gap-1 text-xs transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>بارگذاری در رم</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSelectModel(model.id)}
                              className={`flex-1 py-1.5 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1 text-xs transition-colors ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isSelected ? 'مدل فعال' : 'انتخاب مدل'}</span>
                            </button>
                          )}

                          {/* دکمه آزمون آفلاین */}
                          <button
                            type="button"
                            onClick={() => handleRunTest(model.id)}
                            disabled={isTesting}
                            className="p-1.5 rounded-xl bg-[#202736] hover:bg-[#2c364b] text-zinc-300 border border-[#2f394f] text-[11px]"
                            title="آزمون استنتاج محلی؛ تأیید آفلاین به اجرای جداگانه با شبکه قطع‌شده نیاز دارد"
                          >
                            تست محلی
                          </button>

                          <button
                            type="button"
                            onClick={() => handleVerifyOffline(model.id)}
                            disabled={isVerifyingOffline || model.runtime === 'Core-Deterministic'}
                            className="p-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 text-[11px] disabled:opacity-40"
                            title="تنها با شبکه قطع‌شده، cache مدل را برای اجرای محلی تأیید می‌کند"
                          >
                            تأیید آفلاین
                          </button>

                          {/* دکمه حذف مدل از حافظه */}
                          {!model.isBuiltIn && (
                            <button
                              type="button"
                              onClick={() => handleDeleteModel(model.id)}
                              className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 text-[11px]"
                              title="حذف فایل‌ها از حافظه کش مرورگر"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* بخش آزمون استنتاج آفلاین با استریم زنده توکن‌ها و سنجش زمان */}
          <div className="bg-[#171b25] border border-[#283142] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-200 flex items-center gap-2 text-xs">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>آزمون استنتاج محلی در مرورگر (Real In-Browser Generation)</span>
              </h3>
              {isTesting && (
                <button
                  type="button"
                  onClick={handleStopTest}
                  className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors"
                >
                  <StopCircle className="w-3 h-3" />
                  <span>توقف تولید (Stop)</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-zinc-400 block text-[11px]">
                پرسش تکنیکال برای آزمایش استنتاج مدل فعال ({selectedModelId}):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="مثال: وضعیت FVG و سوییپ آسیا در این کندل چگونه است؟"
                  className="flex-1 bg-[#10131b] border border-[#262e3e] rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 font-sans"
                  dir="rtl"
                />
                <button
                  type="button"
                  onClick={() => handleRunTest(selectedModelId)}
                  disabled={isTesting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md"
                >
                  {isTesting ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isTesting ? 'در حال استنتاج...' : 'اجرای تست محلی'}</span>
                </button>
              </div>
            </div>

            {testResult && (
              <div className="mt-3 p-3.5 bg-[#10131c] rounded-xl border border-[#232b3b] space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] border-b border-[#1e2535] pb-2">
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>پاسخ استنتاج محلی مدل {testResult.modelId}:</span>
                  </span>
                  <div className="flex items-center gap-3 text-zinc-400 font-mono text-[10px]">
                    {testResult.ttftMs !== undefined && (
                      <span>TTFT: {testResult.ttftMs}ms</span>
                    )}
                    {testResult.chunksPerSec !== undefined && testResult.chunksPerSec > 0 && (
                      <span className="text-cyan-400 font-bold">{testResult.chunksPerSec} chunk/s</span>
                    )}
                    <span>زمان کل: {testResult.latencyMs}ms</span>
                  </div>
                </div>
                <pre className="text-[11px] text-zinc-200 font-sans whitespace-pre-wrap leading-relaxed">
                  {testResult.text || (isTesting ? 'در حال تولید اولین توکن‌ها...' : '')}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* پاورقی مودال */}
        <div className="px-5 py-3 border-t border-[#232938] bg-[#10131a] flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span>مدل فعال ذخیره شده: {selectedModelId}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition-colors"
          >
            تایید و بازگشت به میز کار
          </button>
        </div>
      </div>
    </div>
  );
};
