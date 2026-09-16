// components/trading/offline-ai-manager-modal.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  PLAN_V4_MODELS,
  BrowserAIModelRecord,
  BrowserOfflineAIManager,
  WebGPUCapabilityReport,
  ProgressReportPayload,
  ModelRecommendation,
} from '@/lib/ai/browser-offline-ai';
import type { OfflineModelAvailability } from '@/lib/ai/offline-ai-contracts';
import type { AIRuntimeId } from '@/lib/ai/offline-ai-contracts';
import { createAIRuntimeDiagnosticSnapshot, elapsedRuntimeMs, recordAIRuntimeMetric, recordGenerationMetric, startRuntimeTimer, type AIRuntimeDiagnosticSnapshot } from '@/lib/ai/runtime-diagnostics';
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

const AVAILABILITY_LABELS: Record<OfflineModelAvailability['state'], string> = {
  ONLINE_REQUIRED_FOR_DOWNLOAD: 'دانلود اولیه لازم',
  DOWNLOADING: 'در حال دانلود',
  CACHED: 'فایل ذخیره شده',
  LOADABLE: 'آمادهٔ بارگذاری',
  READY: 'آمادهٔ اجرا',
  OFFLINE_VERIFIED: 'آفلاین تأییدشده',
  ERROR: 'غیرقابل استفاده',
};

const DIAGNOSTIC_RUNTIME: Record<BrowserAIModelRecord['runtime'], AIRuntimeId> = {
  'WebLLM-WebGPU': 'WEBLLM_WEBGPU', 'LiteRT-LM-Web': 'LITERT_LM_WEB',
  'Core-Deterministic': 'CORE_DETERMINISTIC', 'Chrome-Builtin': 'CHROME_BUILTIN',
};

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
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, OfflineModelAvailability>>({});
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
  const [modelRecommendation, setModelRecommendation] = useState<ModelRecommendation | null>(null);
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
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [shellCached, setShellCached] = useState<boolean | null>(null);
  const [diagnostics, setDiagnostics] = useState<AIRuntimeDiagnosticSnapshot | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<'ALL' | 'FAST' | 'BALANCED' | 'DEEP' | 'ZERO_WEIGHT'>('ALL');
  const [useFastMirror, setUseFastMirror] = useState<boolean>(() => BrowserOfflineAIManager.getUseFastMirror());
  const cancelledLiteRTLoadRef = useRef<string | null>(null);
  const selectedModel = PLAN_V4_MODELS.find((model) => model.id === selectedModelId);
  const downloadingModel = PLAN_V4_MODELS.find((model) => model.id === downloadingModelId);
  const isLiteRTMirrorInapplicable = selectedModel?.runtime === 'LiteRT-LM-Web'
    || downloadingModel?.runtime === 'LiteRT-LM-Web';

  const refreshDiagnostics = (report = hardwareReport, resident = residentModelId, runtime = runtimeState) => {
    setDiagnostics(createAIRuntimeDiagnosticSnapshot({ selectedModelId, residentModelId: resident, runtimeState: runtime, webGPUAvailable: report?.hasWebGPU ?? false, shellCached }));
  };

  const handleToggleFastMirror = () => {
    if (isLiteRTMirrorInapplicable) {
      setActionMessage('میرور کمکی فقط برای مدل‌های WebLLM است؛ artifact پین‌شده LiteRT مستقیماً دریافت می‌شود.');
      return;
    }
    const next = !useFastMirror;
    setUseFastMirror(next);
    BrowserOfflineAIManager.setUseFastMirror(next);
    setActionMessage(next ? 'میرور پرسرعت کمکی (hf-mirror.com) فعال شد.' : 'دانلود مستقیم از مخزن اصلی هاگینگ‌فیس فعال شد.');
  };

  const handleCancelLiteRTDownload = () => {
    if (!downloadingModel || downloadingModel.runtime !== 'LiteRT-LM-Web') return;
    const wasCancelled = BrowserOfflineAIManager.cancelModelLoad();
    if (!wasCancelled) {
      setActionMessage('دریافت artifact تمام شده و بارگذاری WebGPU قابل لغو ایمن نیست.');
      return;
    }
    cancelledLiteRTLoadRef.current = downloadingModel.id;
    setActionMessage('درخواست لغو دانلود LiteRT ارسال شد؛ مدل مقیم قبلی تا پایان لغو در حافظه می‌ماند.');
  };

  const handleClose = () => {
    if (downloadingModel?.runtime === 'LiteRT-LM-Web') {
      handleCancelLiteRTDownload();
    }
    onClose();
  };

  // به‌روزرسانی وضعیت و سنجش سخت‌افزار
  const refreshStatus = async () => {
    const [report, recommendation] = await Promise.all([BrowserOfflineAIManager.probeHardware(), BrowserOfflineAIManager.recommendModel()]);
    const resident = BrowserOfflineAIManager.getResidentModelId();
    const runtime = BrowserOfflineAIManager.getRuntimeStatus();
    const entries = await Promise.all(PLAN_V4_MODELS.map(async model => [model.id, await BrowserOfflineAIManager.getOfflineModelAvailability(model.id), await BrowserOfflineAIManager.isModelSupported(model.id)] as const));
    const map = Object.fromEntries(entries.map(([id, availability]) => [id, availability.cached]));
    const availability = Object.fromEntries(entries.map(([id, value]) => [id, value]));
    const supported = Object.fromEntries(entries.map(([id, , isSupported]) => [id, isSupported]));
    setHardwareReport(report);
    setModelRecommendation(recommendation);
    setResidentModelId(resident);
    setRuntimeState(runtime.state);
    setDownloadedMap(map);
    setAvailabilityMap(availability);
    setSupportedMap(supported);
    refreshDiagnostics(report, resident, runtime.state);
  };

  useEffect(() => {
    if (!isOpen) return;
    let isSubscribed = true;

    const runProbe = async () => {
      const [report, recommendation] = await Promise.all([BrowserOfflineAIManager.probeHardware(), BrowserOfflineAIManager.recommendModel()]);
      const resident = BrowserOfflineAIManager.getResidentModelId();
      const runtime = BrowserOfflineAIManager.getRuntimeStatus();
      const entries = await Promise.all(PLAN_V4_MODELS.map(async model => [model.id, await BrowserOfflineAIManager.getOfflineModelAvailability(model.id), await BrowserOfflineAIManager.isModelSupported(model.id)] as const));
      const map = Object.fromEntries(entries.map(([id, availability]) => [id, availability.cached]));
      const availability = Object.fromEntries(entries.map(([id, value]) => [id, value]));
      const supported = Object.fromEntries(entries.map(([id, , isSupported]) => [id, isSupported]));
      if (isSubscribed) {
        setHardwareReport(report);
        setModelRecommendation(recommendation);
        setResidentModelId(resident);
        setRuntimeState(runtime.state);
        setDownloadedMap(map);
        setAvailabilityMap(availability);
        setSupportedMap(supported);
      }
    };

    runProbe();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen]);

  useEffect(() => {
    const receiveShellStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ shellCached?: boolean }>).detail;
      if (typeof detail?.shellCached === 'boolean') setShellCached(detail.shellCached);
    };
    window.addEventListener('tradewithhamed:offline-shell-status', receiveShellStatus);
    return () => window.removeEventListener('tradewithhamed:offline-shell-status', receiveShellStatus);
  }, []);

  if (!isOpen) return null;

  // شروع دانلود واقعی و بارگذاری در WebGPU با تایید کاربر
  const handleStartDownload = async (model: BrowserAIModelRecord) => {
    if (model.runtime === 'Core-Deterministic') {
      onSelectModel(model.id);
      setActionMessage(`موتور قطعی ${model.name} فعال شد.`);
      return;
    }

    const readiness = await BrowserOfflineAIManager.getDownloadReadiness(model.id);
    if (!readiness.canStart) {
      setActionMessage(`دانلود آغاز نشد: ${readiness.reasonFa}`);
      return;
    }
    const liteRTNotice = model.runtime === 'LiteRT-LM-Web'
      ? '\nاین مسیر آزمایشی است: علاوه بر artifact مدل، runtime LiteRT-LM در اجرای نخست از CDN دریافت می‌شود. فایل مدل در CacheStorage برنامه نگه‌داری می‌شود، اما تأیید آفلاین کامل هنوز فعال نیست.\n'
      : '';
    const consent = confirm(
      `درخواست تایید دانلود فایل‌های مدل:\n` +
      `مدل: ${model.name}\n` +
      `حجم تقریبی فایل‌ها: حدود ${model.downloadSizeMB} مگابایت\n` +
      `محل ذخیره: CacheStorage مرورگر برای artifact مدل\n` +
      liteRTNotice + '\n' +
      `آیا با شروع دانلود و بارگذاری این مدل در حافظه WebGPU موافقید؟`
    );
    if (!consent) return;

    const loadStartedAt = startRuntimeTimer();
    try {
      if (model.runtime === 'LiteRT-LM-Web') {
        cancelledLiteRTLoadRef.current = null;
      }
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
      if (cancelledLiteRTLoadRef.current === model.id) {
        setActionMessage('دانلود LiteRT لغو شد؛ مدل مقیم قبلی بدون تغییر باقی ماند.');
        return;
      }
      if (loadRes.success) {
        onSelectModel(model.id);
        setActionMessage(loadRes.messageFa);
      } else {
        alert(loadRes.messageFa);
      }
      recordAIRuntimeMetric({ kind: 'MODEL_LOAD', modelId: model.id, runtime: DIAGNOSTIC_RUNTIME[model.runtime], success: loadRes.success, durationMs: elapsedRuntimeMs(loadStartedAt), ttftMs: null, outputRate: null, outputRateUnit: null, fallbackUsed: false, fallbackReason: loadRes.success ? null : 'MODEL_LOAD_FAILED' });
    } catch (err) {
      if (cancelledLiteRTLoadRef.current === model.id) {
        setActionMessage('دانلود LiteRT لغو شد؛ مدل مقیم قبلی بدون تغییر باقی ماند.');
        return;
      }
      alert(`خطا در فرآیند بارگذاری: ${(err as Error).message}`);
    } finally {
      if (cancelledLiteRTLoadRef.current === model.id) {
        cancelledLiteRTLoadRef.current = null;
      }
      setDownloadingModelId(null);
    }
  };

  // بارگذاری مدل در رم گرافیک
  const handleLoadModel = async (modelId: string) => {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    const loadStartedAt = startRuntimeTimer();
    setActionMessage('در حال بارگذاری runtime و منابع WebGPU برای استنتاج محلی...');
    try {
      const result = await BrowserOfflineAIManager.loadModelToMemory(modelId);
      if (model) recordAIRuntimeMetric({ kind: 'MODEL_LOAD', modelId, runtime: DIAGNOSTIC_RUNTIME[model.runtime], success: result.success, durationMs: elapsedRuntimeMs(loadStartedAt), ttftMs: null, outputRate: null, outputRateUnit: null, fallbackUsed: false, fallbackReason: result.success ? null : 'MODEL_LOAD_FAILED' });
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
      const model = PLAN_V4_MODELS.find(item => item.id === modelId);
      if (model) recordGenerationMetric({ modelId, runtime: DIAGNOSTIC_RUNTIME[model.runtime], success: true, latencyMs: output.latencyMs, ttftMs: output.ttftMs, chunksPerSec: output.chunksPerSec });
      await refreshStatus();
    } catch (err) {
      setTestResult({
        modelId,
        text: `خطا در استنتاج: ${(err as Error).message}`,
        latencyMs: 0,
      });
    } finally {
      setIsTesting(false);
      refreshDiagnostics();
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
                  WebLLM + LiteRT-LM / WebGPU
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                استنتاج محلی در مرورگر؛ دانلود اولیه مدل ممکن است به شبکه نیاز داشته باشد.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
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
              {modelRecommendation && (
                <div className="mt-2.5 p-3 bg-cyan-950/30 border border-cyan-800/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-cyan-200">پیشنهاد خودکار: {PLAN_V4_MODELS.find(model => model.id === modelRecommendation.modelId)?.name || modelRecommendation.modelId}</div>
                    <div className="mt-1 text-[10px] text-cyan-100/70">{modelRecommendation.reasonFa} انتخاب دستی همچنان حفظ می‌شود.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectModel(modelRecommendation.modelId)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-[10px] whitespace-nowrap"
                  >
                    انتخاب پیشنهاد
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="bg-[#171b25] border border-[#283142] rounded-2xl p-4">
            <button
              type="button"
              onClick={() => {
                const next = !showDiagnostics;
                setShowDiagnostics(next);
                if (next) refreshDiagnostics();
              }}
              className="w-full flex items-center justify-between text-zinc-100 font-bold text-xs"
            >
              <span className="flex items-center gap-2 text-cyan-400"><Cpu className="w-4 h-4" />تشخیص و Benchmark پیشرفته</span>
              <span className="text-zinc-400 flex items-center gap-1">{showDiagnostics ? 'بستن' : 'نمایش'} {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
            </button>
            {showDiagnostics && diagnostics && (
              <div className="mt-3 pt-3 border-t border-[#232938] space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                  <div className="bg-[#10131b] rounded-lg p-2"><span className="text-zinc-500 block">مرورگر / دستگاه</span><span className="text-zinc-200 font-mono">{diagnostics.browser} / {diagnostics.platform}</span></div>
                  <div className="bg-[#10131b] rounded-lg p-2"><span className="text-zinc-500 block">WebGPU / شبکه</span><span className="text-zinc-200 font-mono">{diagnostics.webGPUAvailable ? 'Available' : 'Unavailable'} / {diagnostics.online === null ? 'Unknown' : diagnostics.online ? 'Online' : 'Offline'}</span></div>
                  <div className="bg-[#10131b] rounded-lg p-2"><span className="text-zinc-500 block">Runtime / مدل</span><span className="text-zinc-200 font-mono">{diagnostics.runtimeState} / {diagnostics.selectedModelId}</span></div>
                  <div className="bg-[#10131b] rounded-lg p-2"><span className="text-zinc-500 block">App shell</span><span className="text-zinc-200 font-mono">{diagnostics.shellCached === null ? 'Unknown' : diagnostics.shellCached ? 'Cached' : 'Not cached'}</span></div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">فقط داده‌های عملکردی نگه‌داری می‌شوند؛ prompt، قیمت، حساب و شواهد معاملاتی ثبت نمی‌شوند.</span>
                  <button type="button" onClick={() => refreshDiagnostics()} className="px-2 py-1 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px]">به‌روزرسانی</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] text-right">
                    <thead className="text-zinc-500"><tr><th className="p-1">عملیات</th><th className="p-1">مدل</th><th className="p-1">زمان</th><th className="p-1">TTFT / نرخ</th><th className="p-1">Fallback</th></tr></thead>
                    <tbody>
                      {diagnostics.recentMetrics.map((metric) => <tr key={`${metric.recordedAt}-${metric.kind}-${metric.modelId}`} className="border-t border-[#232938] text-zinc-300"><td className="p-1 font-mono">{metric.kind}</td><td className="p-1 font-mono">{metric.modelId}</td><td className="p-1 font-mono">{metric.durationMs}ms</td><td className="p-1 font-mono">{metric.ttftMs === null ? '—' : `${metric.ttftMs}ms`} / {metric.outputRate === null ? '—' : `${metric.outputRate} ${metric.outputRateUnit}`}</td><td className="p-1">{metric.fallbackUsed ? metric.fallbackReason || 'Yes' : 'No'}</td></tr>)}
                      {diagnostics.recentMetrics.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-zinc-500">برای ثبت معیار، یک مدل را بارگذاری یا تست محلی را اجرا کنید.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

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
                  • <strong>آفلاین تأییدشده:</strong> وجود فایل در cache به‌تنهایی کافی نیست؛ تنها پس از اجرای موفق آزمون با شبکه قطع‌شده و نسخه artifact فعلی، مدل این نشان را دریافت می‌کند.
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
                روی دستگاه‌هایی مانند <strong className="text-cyan-300">Pixel 9 Pro Fold</strong> و لپ‌تاپ‌های <strong className="text-purple-300">Windows on Snapdragon</strong>، اجرای مدل فقط از مسیر WebLLM/WebGPU انجام می‌شود و دسترسی مرورگر به NPU فرض نمی‌شود. دانلود اولیه به شبکه نیاز دارد و سازگاری نهایی هر مدل باید روی همان دستگاه آزمون شود.
              </span>
            </div>
          </div>

          {/* نوار کنترل شتاب‌دهنده دانلود و دسترسی فوری بدون دانلود */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0c101a] border border-cyan-900/40 flex-wrap gap-2 text-[11px]">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-zinc-200">شتاب‌دهنده دانلود WebLLM (hf-mirror.com): </span>
                <span className="text-zinc-400 hidden sm:inline">برای مدل‌های WebLLM؛ LiteRT artifact پین‌شده را مستقیم دریافت می‌کند</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleToggleFastMirror}
                disabled={isLiteRTMirrorInapplicable}
                title={isLiteRTMirrorInapplicable ? 'میرور فقط برای مدل‌های WebLLM است و برای LiteRT اعمال نمی‌شود.' : undefined}
                className={`px-2.5 py-1 rounded-xl font-bold transition-all text-[11px] flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-55 ${
                  !isLiteRTMirrorInapplicable && useFastMirror
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!isLiteRTMirrorInapplicable && useFastMirror ? 'bg-amber-400 animate-pulse' : 'bg-zinc-500'}`} />
                {isLiteRTMirrorInapplicable ? 'فقط WebLLM' : useFastMirror ? 'میرور کمکی: فعال' : 'سرور اصلی'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectModel('s0-deterministic');
                  setActionMessage('موتور قطعی ریاضی S0 (۰ مگابایت) فوراً فعال شد. آماده معامله بدون نیاز به دانلود.');
                }}
                className="px-2.5 py-1 rounded-xl bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/40 font-bold transition-all text-[11px]"
              >
                ⚡ اجرای فوری S0 (بدون دانلود - ۰MB)
              </button>
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
                  onClick={() => setFilterTier('FAST')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    filterTier === 'FAST'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#181d28] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  سریع (FAST)
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTier('BALANCED')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    filterTier === 'BALANCED'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-[#181d28] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  متعادل (BALANCED)
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTier('DEEP')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    filterTier === 'DEEP'
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#181d28] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  عمیق (DEEP)
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
                if (filterTier === 'FAST') return m.performanceTier === 'FAST';
                if (filterTier === 'BALANCED') return m.performanceTier === 'BALANCED';
                if (filterTier === 'DEEP') return m.performanceTier === 'DEEP';
                if (filterTier === 'ZERO_WEIGHT') return m.densityTier === 'ZERO_WEIGHT';
                return true;
              }).map((model) => {
                const isSelected = selectedModelId === model.id;
                const isSupported = supportedMap[model.id] ?? model.runtime === 'Core-Deterministic';
                const isDownloaded = downloadedMap[model.id] || model.runtime === 'Core-Deterministic';
                const isResident = residentModelId === model.id;
                const isCurrentlyDownloading = downloadingModelId === model.id;
                const isVerified = BrowserOfflineAIManager.isOfflineVerified(model.id);
                const availability = availabilityMap[model.id];

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
                            <span className="px-1.5 py-0.5 text-[9px] rounded font-bold border bg-slate-900 text-slate-300 border-slate-700">
                              {model.performanceTier}
                            </span>
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
                          {availability && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] bg-slate-950/80 text-slate-300 border border-slate-700 font-mono" title={availability.reason}>
                              {AVAILABILITY_LABELS[availability.state]}
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
                          <span className="text-zinc-500">حجم دانلود {model.sizeMetadata.download === 'PINNED_ARTIFACT' ? '(دقیق)' : '(تخمینی)'}: </span>
                          <span className="text-zinc-200 font-mono">
                            {model.downloadSizeMB > 0 ? `${model.downloadSizeMB} MB` : 'صفر (توکار)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">حافظه Runtime (تخمینی): </span>
                          <span className="text-zinc-200 font-mono">
                            {model.estimatedVRAMMB > 0 ? `${model.estimatedVRAMMB} MB` : 'سبک'}
                          </span>
                        </div>
                        <div className="col-span-2 flex items-center gap-1.5 pt-1 border-t border-[#1a1f2c]">
                          <span className="text-zinc-500">دستگاه پیشنهادی: </span>
                          <span className="text-cyan-300 font-medium">{model.targetDeviceFa}</span>
                        </div>
                      </div>

                      {/* نوار پیشرفت در حین دانلود و آماده‌سازی WebGPU */}
                      {isCurrentlyDownloading && (
                        <div className="mt-3 p-3 bg-[#111622] rounded-xl border border-cyan-800/60 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-cyan-300">
                            <span className="truncate max-w-[200px]" title={downloadProgress.text}>
                              {downloadProgress.text || 'در حال آماده‌سازی خط لوله اجرای محلی...'}
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
                              حدود {downloadProgress.downloadedMB} MB از {downloadProgress.totalMB} MB
                            </span>
                            <span>سرعت: {downloadProgress.speedMBs} MB/s</span>
                          </div>
                          {model.runtime === 'LiteRT-LM-Web' && downloadProgress.percent < 100 && (
                            <button
                              type="button"
                              onClick={handleCancelLiteRTDownload}
                              className="w-full py-1.5 px-2.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                            >
                              <StopCircle className="w-3.5 h-3.5" />
                              <span>لغو دانلود LiteRT</span>
                            </button>
                          )}
                        </div>
                      )}
                      {model.runtime === 'LiteRT-LM-Web' && (
                        <div className="mt-3 p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/70 text-[10px] leading-relaxed text-amber-200">
                          LiteRT-LM Web در این نسخه آزمایشی است. artifact مدل در CacheStorage ذخیره می‌شود، اما runtime آن در اجرای نخست از CDN دریافت می‌شود؛ بنابراین وضعیت «آفلاین تأییدشده» برای Gemma عمداً نمایش داده نمی‌شود.
                        </div>
                      )}
                    </div>

                    {/* دکمه‌های کنترلی کارت */}
                    <div className="mt-4 pt-3 border-t border-[#232938] flex items-center justify-between gap-2">
                      {!isSupported ? (
                        <div className="w-full py-2 px-3 rounded-xl bg-rose-950/30 text-rose-300 border border-rose-900 text-xs text-center">
                          runtime یا قابلیت‌های لازم مرورگر برای این مدل در دسترس نیست.
                        </div>
                      ) : !isDownloaded ? (
                        <button
                          type="button"
                          onClick={() => handleStartDownload(model)}
                          disabled={isCurrentlyDownloading}
                          className="w-full py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 text-xs shadow-md"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{model.runtime === 'LiteRT-LM-Web' ? `دانلود آزمایشی LiteRT (${model.downloadSizeMB} MB)` : `درخواست دانلود (${model.downloadSizeMB} MB)`}</span>
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
                              <span>{model.runtime === 'LiteRT-LM-Web' ? 'بارگذاری آزمایشی' : 'بارگذاری در رم'}</span>
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

                          {model.runtime !== 'LiteRT-LM-Web' && (
                            <button
                              type="button"
                              onClick={() => handleVerifyOffline(model.id)}
                              disabled={isVerifyingOffline || model.runtime === 'Core-Deterministic'}
                              className="p-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 text-[11px] disabled:opacity-40"
                              title="تنها با شبکه قطع‌شده، cache مدل را برای اجرای محلی تأیید می‌کند"
                            >
                              تأیید آفلاین
                            </button>
                          )}

                          {/* دکمه حذف مدل از حافظه */}
                          {!model.isBuiltIn && (
                            <button
                              type="button"
                              onClick={() => handleDeleteModel(model.id)}
                              className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 text-[11px]"
                              title={model.runtime === 'LiteRT-LM-Web' ? 'حذف artifact Gemma از CacheStorage برنامه' : 'حذف فایل‌ها از حافظه کش مرورگر'}
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
            onClick={handleClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition-colors"
          >
            تایید و بازگشت به میز کار
          </button>
        </div>
      </div>
    </div>
  );
};
