// lib/ai/browser-offline-ai.ts
// موتور رسمی و یکپارچه هوش مصنوعی داخل مرورگر طبق طرح نسخه ۴.۰ حامد حرمی‌پور
// پیاده‌سازی WebLLM و WebGPU با وب‌ورکر اختصاصی. دانلود اولیه مدل به شبکه نیاز دارد.
import { AIModelRuntimeStatus, DeterministicMarketEvidence, OfflineRuntimeState, OfflineVerificationRecord, StructuredCandidateAdvisory } from './offline-ai-contracts';

export type ModelLifecycleState =
  | 'NOT_INSTALLED'     // هنوز دانلود نشده
  | 'DOWNLOADING'       // در حال دریافت بایتی از مخزن
  | 'VERIFYING'         // در حال اعتبارسنجی هش و کامپایل شیدرهای WebGPU
  | 'DOWNLOADED'        // در CacheStorage ذخیره شده ولی در VRAM نیست
  | 'LOADING'           // در حال بارگذاری در حافظه WebGPU
  | 'READY'             // مقیم در VRAM و آماده استنتاج
  | 'GENERATING'        // در حال تولید پاسخ محلی با استریم توکن‌ها
  | 'UNLOADING'         // در حال آزادسازی حافظه گرافیک
  | 'OFFLINE_VERIFIED'  // تست آفلاین با موفقیت تایید شده
  | 'ERROR';            // خطا در WebGPU یا حافظه

export interface WebGPUCapabilityReport {
  hasWebGPU: boolean;
  adapterName: string;
  vendor: string;
  architecture: string;
  hasShaderF16: boolean;
  maxBufferSizeMB: number;
  maxStorageBufferMB: number;
  estimatedStorageQuotaMB: number;
  estimatedStorageUsageMB: number;
  isDedicatedWorkerSupported: boolean;
  isReadyForInference: boolean;
  deviceTier: 'WINDOWS_SNAPDRAGON' | 'PIXEL_FOLD' | 'STANDARD_DESKTOP' | 'LOW_RESOURCE';
  recommendationFa: string;
}

export interface BrowserAIModelRecord {
  id: string;
  mlcModelId: string;
  name: string;
  family: 'Qwen' | 'Gemma' | 'SmolLM' | 'Deterministic' | 'Phi' | 'DeepSeek' | 'Llama' | 'Gemini';
  version: string;
  params: string;
  quantization: string;
  runtime: 'WebLLM-WebGPU' | 'LiteRT-LM-Web' | 'Core-Deterministic' | 'Chrome-Builtin';
  downloadSizeMB: number;
  estimatedVRAMMB: number;
  descriptionFa: string;
  targetDeviceFa: string;
  isExperimental: boolean;
  isBuiltIn: boolean;
  artifactRevision: string;
  modelUrl: string;
  densityTier: 'ULTRA_DENSE' | 'HIGH_DENSE' | 'BALANCED' | 'HEAVY_POWER' | 'ZERO_WEIGHT';
  densityBadgeFa: string;
  recommendedDevices: ('MOBILE_16GB' | 'SNAPDRAGON_PC' | 'TABLET' | 'ALL_DEVICES')[];
}

export const PLAN_V4_MODELS: BrowserAIModelRecord[] = [
  {
    id: 's0-deterministic',
    mlcModelId: '',
    name: 'موتور محاسباتی قطعی S0 (پیش‌فرض)',
    family: 'Deterministic',
    version: 'v4.0-Core',
    params: 'قوانین ریاضی قطعی',
    quantization: 'Pure TypeScript',
    runtime: 'Core-Deterministic',
    downloadSizeMB: 0,
    estimatedVRAMMB: 0,
    descriptionFa: 'الگوریتم قطعی پایش ساختار بازار، سوییپ نقدینگی، FVG و کنترل ریسک. فوق‌سریع و بدون نیاز به دانلود یا رم گرافیک.',
    targetDeviceFa: 'تمام دستگاه‌ها (ویندوز، تبلت و موبایل)',
    isExperimental: false,
    isBuiltIn: true,
    artifactRevision: 'v4.0.0',
    modelUrl: '',
    densityTier: 'ZERO_WEIGHT',
    densityBadgeFa: 'بدون حجم دانلود (۰ مگابایت)',
    recommendedDevices: ['ALL_DEVICES'],
  },
  {
    id: 'deep-critic-strict',
    mlcModelId: '',
    name: 'منتقد سخت‌گیر نقدینگی (Deep Critic)',
    family: 'Deterministic',
    version: 'v4.0-Strict',
    params: 'فیلتر بدبینانه شواهد',
    quantization: 'Pure TypeScript',
    runtime: 'Core-Deterministic',
    downloadSizeMB: 0,
    estimatedVRAMMB: 0,
    descriptionFa: 'غربالگری سخت‌گیرانه ستاپ‌ها و رد ورود در صورت لغزش بالا یا R:R زیر ۱ به ۲.۵.',
    targetDeviceFa: 'تمام دستگاه‌ها (ویندوز، تبلت و موبایل)',
    isExperimental: false,
    isBuiltIn: true,
    artifactRevision: 'v4.0.0',
    modelUrl: '',
    densityTier: 'ZERO_WEIGHT',
    densityBadgeFa: 'منطق قطعی وکیل مدافع شیطان',
    recommendedDevices: ['ALL_DEVICES'],
  },
  {
    id: 'chrome-gemini-nano',
    mlcModelId: 'window.ai.languageModel',
    name: 'Google Gemini Nano (داخلی مرورگر)',
    family: 'Gemini',
    version: 'Chrome-Builtin-1.0',
    params: 'Gemini Nano On-Device',
    quantization: 'Hardware NPU/GPU',
    runtime: 'Chrome-Builtin',
    downloadSizeMB: 0,
    estimatedVRAMMB: 0,
    descriptionFa: 'مدل توکار مرورگر کروم؛ بدون نیاز به دانلود بایت اضافه، اجرای مستقیم با NPU/GPU دستگاه روی موبایل، تبلت و ویندوز.',
    targetDeviceFa: 'کروم رسمی روی تمام دستگاه‌ها (موبایل و دسکتاپ)',
    isExperimental: true,
    isBuiltIn: true,
    artifactRevision: 'chrome-nano-v1',
    modelUrl: '',
    densityTier: 'ZERO_WEIGHT',
    densityBadgeFa: 'بدون نیاز به دانلود (On-Device)',
    recommendedDevices: ['ALL_DEVICES', 'MOBILE_16GB', 'SNAPDRAGON_PC'],
  },
  {
    id: 'phi-4-mini-instruct-mlc',
    mlcModelId: 'Phi-4-mini-instruct-q4f16_1-MLC',
    name: 'Microsoft Phi-4-mini (بالاترین چگالی استدلال)',
    family: 'Phi',
    version: '3.8B-q4f16_1',
    params: '3.8B Params (128K Context)',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 2150,
    estimatedVRAMMB: 2900,
    descriptionFa: 'پیشرفته‌ترین مدل فوق‌فشرده مایکروسافت با بالاترین ضریب هوش به ازای مگابایت. درک بی‌نظیر فرمول‌های مالی و پرایس‌اکشن فراتر از مدل‌های ۷ میلیاردی.',
    targetDeviceFa: 'موبایل Pixel 9 Pro Fold (۱۶ گیگ)، تبلت و لپ‌تاپ Snapdragon',
    isExperimental: false,
    isBuiltIn: false,
    artifactRevision: 'phi-4-mini-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/Phi-4-mini-instruct-q4f16_1-MLC',
    densityTier: 'ULTRA_DENSE',
    densityBadgeFa: 'بالاترین IQ به ازای مگابایت (Dense 3.8B)',
    recommendedDevices: ['MOBILE_16GB', 'TABLET', 'SNAPDRAGON_PC'],
  },
  {
    id: 'deepseek-r1-distill-qwen-7b-mlc',
    mlcModelId: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
    name: 'DeepSeek-R1 Distill Qwen-7B (تفکر عمیق CoT)',
    family: 'DeepSeek',
    version: '7B-q4f16_1-R1',
    params: '7B Params (Chain-of-Thought)',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 4250,
    estimatedVRAMMB: 5400,
    descriptionFa: 'موتور استدلال گام‌به‌گام با تگ‌های <think> برای کشف تله‌های نقدینگی، اوردر فلو و راستی‌آزمایی ریاضی ستاپ با نقد استدلالی.',
    targetDeviceFa: 'موبایل ۱۶ گیگابایت (Pixel Fold)، تبلت و سیستم‌های اسنپ‌دراگون',
    isExperimental: false,
    isBuiltIn: false,
    artifactRevision: 'deepseek-r1-7b-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
    densityTier: 'HIGH_DENSE',
    densityBadgeFa: 'زنجیره تفکر عمیق (DeepSeek R1)',
    recommendedDevices: ['MOBILE_16GB', 'TABLET', 'SNAPDRAGON_PC'],
  },
  {
    id: 'deepseek-r1-distill-qwen-14b-mlc',
    mlcModelId: 'DeepSeek-R1-Distill-Qwen-14B-q4f16_1-MLC',
    name: 'DeepSeek-R1 Distill Qwen-14B (ابرقدرت استدلال)',
    family: 'DeepSeek',
    version: '14B-q4f16_1-R1',
    params: '14B Params (Heavy CoT)',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 7900,
    estimatedVRAMMB: 9800,
    descriptionFa: 'غول استدلال ۱۴ میلیاردی DeepSeek بهینه‌شده با کوانتیزاسیون ۴بیتی. تحلیل چندلایه‌ای و ارزیابی موشکافانه ریسک در دستگاه‌های ۱۶ گیگابایت.',
    targetDeviceFa: 'Pixel 9 Pro Fold (۱۶ گیگابایت رم) و لپ‌تاپ Snapdragon X Plus',
    isExperimental: true,
    isBuiltIn: false,
    artifactRevision: 'deepseek-r1-14b-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/DeepSeek-R1-Distill-Qwen-14B-q4f16_1-MLC',
    densityTier: 'HEAVY_POWER',
    densityBadgeFa: 'ابرقدرت ۱۴ میلیاردی استدلال نقدینگی',
    recommendedDevices: ['MOBILE_16GB', 'SNAPDRAGON_PC'],
  },
  {
    id: 'llama-3.2-3b-instruct-mlc',
    mlcModelId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Meta Llama-3.2-3B (اسکنر سریع و بهینه)',
    family: 'Llama',
    version: '3B-q4f16_1',
    params: '3B Params (Ultra-Fast)',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 1850,
    estimatedVRAMMB: 2400,
    descriptionFa: 'معماری جدید و سبک متا برای پایش و اسکن بلادرنگ ستاپ‌ها با سرعت تولید بالای توکن و مصرف بسیار کم باتری و حافظه.',
    targetDeviceFa: 'انواع موبایل، تبلت و لپ‌تاپ‌های کم‌مصرف',
    isExperimental: false,
    isBuiltIn: false,
    artifactRevision: 'llama-3.2-3b-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC',
    densityTier: 'ULTRA_DENSE',
    densityBadgeFa: 'فوق‌سریع و فشرده (Meta Llama 3.2)',
    recommendedDevices: ['ALL_DEVICES', 'MOBILE_16GB', 'TABLET'],
  },
  {
    id: 'qwen2.5-7b-instruct-mlc',
    mlcModelId: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5-7B Instruct (جامع و چندزبانه)',
    family: 'Qwen',
    version: '7B-q4f16_1',
    params: '7B Params (Multilingual)',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 4150,
    estimatedVRAMMB: 5200,
    descriptionFa: 'مدل استاندارد تحلیل ساختار مالی با پشتیبانی بی‌نظیر از زبان فارسی و تفسیر پیشرفته الگوهای کندل‌استیک.',
    targetDeviceFa: 'موبایل ۱۶ گیگابایت، تبلت و ویندوز',
    isExperimental: false,
    isBuiltIn: false,
    artifactRevision: 'qwen2.5-7b-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/Qwen2.5-7B-Instruct-q4f16_1-MLC',
    densityTier: 'BALANCED',
    densityBadgeFa: 'هوش زبانی و تحلیلی متعادل',
    recommendedDevices: ['MOBILE_16GB', 'TABLET', 'SNAPDRAGON_PC'],
  },
  {
    id: 'qwen2.5-14b-instruct-mlc',
    mlcModelId: 'Qwen2.5-14B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5-14B Instruct (سنگین‌وزن تخصصی)',
    family: 'Qwen',
    version: '14B-q4f16_1',
    params: '14B Params (Heavy Financial)',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 8100,
    estimatedVRAMMB: 10200,
    descriptionFa: 'مدل سنگین ۱۴ میلیاردی برای درک عمیق ساختارهای ماکرو، واگرایی‌ها و نگارش گزارش تفصیلی در موبایل و سیستم‌های با رم بالا.',
    targetDeviceFa: 'Pixel 9 Pro Fold با ۱۶ گیگابایت رم و Snapdragon X Plus',
    isExperimental: true,
    isBuiltIn: false,
    artifactRevision: 'qwen2.5-14b-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/Qwen2.5-14B-Instruct-q4f16_1-MLC',
    densityTier: 'HEAVY_POWER',
    densityBadgeFa: 'تحلیل‌گر کلان ۱۴ میلیاردی',
    recommendedDevices: ['MOBILE_16GB', 'SNAPDRAGON_PC'],
  },
  {
    id: 'smollm2-360m-mlc',
    mlcModelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2-360M (آزمون سریع اتصالات WebGPU)',
    family: 'SmolLM',
    version: '360M-q4f16_1',
    params: '360M Params',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 220,
    estimatedVRAMMB: 600,
    descriptionFa: 'فوق‌سبک و سریع برای اثبات فوری سلامت خط لوله WebGPU و وب‌ورکر با حجم دانلود بسیار کم.',
    targetDeviceFa: 'تست فوری اولیه روی کلیه دستگاه‌ها',
    isExperimental: false,
    isBuiltIn: false,
    artifactRevision: 'smollm2-360m-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/SmolLM2-360M-Instruct-q4f16_1-MLC',
    densityTier: 'ULTRA_DENSE',
    densityBadgeFa: 'سبک‌ترین مدل تست (۲۲۰ مگابایت)',
    recommendedDevices: ['ALL_DEVICES'],
  },
  {
    id: 'qwen3.5-0.8b-mlc',
    mlcModelId: 'Qwen3.5-0.8B-q4f16_1-MLC',
    name: 'Qwen3.5-0.8B (مدل اصلی و سبک W1)',
    family: 'Qwen',
    version: '0.8B-q4f16_1',
    params: '800M Params',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 540,
    estimatedVRAMMB: 1629,
    descriptionFa: 'مدل عصبی سبک و سریع WebLLM طبق طرح ۴.۰؛ پشتیبانی از زبان فارسی و درک ستاپ‌های معاملاتی با مصرف کم رم.',
    targetDeviceFa: 'موبایل Pixel 9 Pro Fold و سیستم‌های سبک',
    isExperimental: false,
    isBuiltIn: false,
    artifactRevision: 'qwen3.5-0.8b-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/Qwen3.5-0.8B-q4f16_1-MLC',
    densityTier: 'BALANCED',
    densityBadgeFa: 'سبک و اقتصادی (۵۴۰ مگابایت)',
    recommendedDevices: ['ALL_DEVICES', 'MOBILE_16GB'],
  },
  {
    id: 'qwen3.5-2b-mlc',
    mlcModelId: 'Qwen3.5-2B-q4f16_1-MLC',
    name: 'Qwen3.5-2B (نامزد متعادل موبایل)',
    family: 'Qwen',
    version: '2B-q4f16_1',
    params: '2B Params',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 1250,
    estimatedVRAMMB: 2245,
    descriptionFa: 'مدل منتخب متعادل برای اجرای مستقل روی Pixel 9 Pro Fold با کیفیت زبانی فارسی و درک کامل snapshot بازار.',
    targetDeviceFa: 'Pixel 9 Pro Fold و تبلت‌ها',
    isExperimental: false,
    isBuiltIn: false,
    artifactRevision: 'qwen3.5-2b-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC',
    densityTier: 'BALANCED',
    densityBadgeFa: 'متعادل موبایل و تبلت',
    recommendedDevices: ['MOBILE_16GB', 'TABLET', 'ALL_DEVICES'],
  },
  {
    id: 'qwen3.5-4b-mlc',
    mlcModelId: 'Qwen3.5-4B-q4f16_1-MLC',
    name: 'Qwen3.5-4B (نامزد کیفیت برتر ویندوز)',
    family: 'Qwen',
    version: '4B-q4f16_1',
    params: '4B Params',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 2390,
    estimatedVRAMMB: 3868,
    descriptionFa: 'تحلیل‌گر و منتقد عمیق بازار با درک قوی منطق پرایس‌اکشن، بهینه‌شده برای لپ‌تاپ Snapdragon X Plus با ۱۶ گیگابایت رم.',
    targetDeviceFa: 'ویندوز اسنپ‌دراگون و رایانه‌های قدرتمند',
    isExperimental: false,
    isBuiltIn: false,
    artifactRevision: 'qwen3.5-4b-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC',
    densityTier: 'HIGH_DENSE',
    densityBadgeFa: 'استدلال دقیق و باکیفیت',
    recommendedDevices: ['SNAPDRAGON_PC', 'MOBILE_16GB', 'TABLET'],
  },
  {
    id: 'qwen3-1.7b-mlc',
    mlcModelId: 'Qwen3-1.7B-q4f16_1-MLC',
    name: 'Qwen3-1.7B (مسیر بازگشت پایدار Fallback)',
    family: 'Qwen',
    version: '1.7B-q4f16_1',
    params: '1.7B Params',
    quantization: 'q4f16_1 MLC',
    runtime: 'WebLLM-WebGPU',
    downloadSizeMB: 1100,
    estimatedVRAMMB: 1800,
    descriptionFa: 'آرتیفکت پایدار و تثبیت‌شده WebLLM در صورت بروز ناسازگاری در ترکیب‌های جدید مرورگر.',
    targetDeviceFa: 'مسیر جایگزین مطمئن موبایل و ویندوز',
    isExperimental: false,
    isBuiltIn: false,
    artifactRevision: 'qwen3-1.7b-v1',
    modelUrl: 'https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC',
    densityTier: 'BALANCED',
    densityBadgeFa: 'پایدار و سازگار با درایورها',
    recommendedDevices: ['ALL_DEVICES'],
  },
];

export const AVAILABLE_OFFLINE_MODELS = PLAN_V4_MODELS;
export type OfflineAIModel = BrowserAIModelRecord;

const STORAGE_SELECTED_MODEL = 'hamed_v4_selected_model_id';
const STORAGE_OFFLINE_VERIFIED = 'hamed_v4_offline_verified_map';

export interface ProgressReportPayload {
  percent: number;
  downloadedMB: number;
  totalMB: number;
  speedMBs: number;
  text: string;
}

interface InferenceOptions {
  systemPrompt?: string;
  maxTokens?: number;
}

export class BrowserOfflineAIManager {
  private static activeEngine: any = null;
  private static activeWorker: Worker | null = null;
  private static currentResidentModelId: string | null = null;
  private static abortController: AbortController | null = null;
  private static runtimeState: OfflineRuntimeState = 'IDLE';
  private static activeOperationId: number | null = null;
  private static operationCounter = 0;
  private static lastError: string | undefined;

  static async probeHardware(): Promise<WebGPUCapabilityReport> {
    const isDedicatedWorkerSupported = typeof Worker !== 'undefined';
    let hasWebGPU = false;
    let adapterName = 'ناشناخته (بدون WebGPU)';
    let vendor = 'نامشخص';
    let architecture = 'نامشخص';
    let hasShaderF16 = false;
    let maxBufferSizeMB = 0;
    let maxStorageBufferMB = 0;
    let estimatedStorageQuotaMB = 0;
    let estimatedStorageUsageMB = 0;
    if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (adapter) {
          hasWebGPU = true;
          const info = adapter.info || {};
          adapterName = info.description || info.device || 'WebGPU Adapter';
          vendor = info.vendor || 'Unknown Vendor';
          architecture = info.architecture || 'GPU Hardware';
          hasShaderF16 = adapter.features ? adapter.features.has('shader-f16') : false;
          maxBufferSizeMB = Math.round((adapter.limits?.maxBufferSize || 0) / (1024 * 1024));
          maxStorageBufferMB = Math.round((adapter.limits?.maxStorageBufferBindingSize || 0) / (1024 * 1024));
        }
      } catch { hasWebGPU = false; }
    }
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        estimatedStorageQuotaMB = Math.round((estimate.quota || 0) / (1024 * 1024));
        estimatedStorageUsageMB = Math.round((estimate.usage || 0) / (1024 * 1024));
      } catch { /* storage estimation is optional */ }
    }
    const deviceTier = !hasWebGPU ? 'LOW_RESOURCE' : maxBufferSizeMB >= 1000 && hasShaderF16 ? 'WINDOWS_SNAPDRAGON' : maxBufferSizeMB >= 500 ? 'PIXEL_FOLD' : 'STANDARD_DESKTOP';
    const recommendationFa = !hasWebGPU
      ? 'WebGPU در دسترس نیست؛ فقط موتورهای قطعی محلی قابل استفاده‌اند.'
      : 'توانایی WebGPU شناسایی شد. قابلیت اجرای نهایی هر مدل فقط پس از بارگذاری واقعی مشخص می‌شود.';
    return { hasWebGPU, adapterName, vendor, architecture, hasShaderF16, maxBufferSizeMB, maxStorageBufferMB, estimatedStorageQuotaMB, estimatedStorageUsageMB, isDedicatedWorkerSupported, isReadyForInference: hasWebGPU, deviceTier, recommendationFa };
  }

  static getRuntimeStatus(): AIModelRuntimeStatus {
    return { state: this.runtimeState, residentModelId: this.currentResidentModelId, selectedModelId: this.getSelectedModelId(), activeOperationId: this.activeOperationId, lastError: this.lastError };
  }

  static getSelectedModelId(): string {
    if (typeof window === 'undefined') return 's0-deterministic';
    return localStorage.getItem(STORAGE_SELECTED_MODEL) || 's0-deterministic';
  }

  static setSelectedModelId(id: string): void {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_SELECTED_MODEL, id);
  }

  static getResidentModelId(): string | null {
    return this.currentResidentModelId;
  }

  static async isModelSupported(modelId: string): Promise<boolean> {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    if (!model) return false;
    if (model.runtime === 'Core-Deterministic') return true;
    if (model.runtime === 'Chrome-Builtin') return false;
    try {
      const webllm = await import('@mlc-ai/web-llm');
      return webllm.prebuiltAppConfig.model_list.some(item => item.model_id === model.mlcModelId);
    } catch { return false; }
  }

  static async isModelDownloaded(modelId: string): Promise<boolean> {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    if (!model) return false;
    if (model.runtime === 'Core-Deterministic') return true;
    if (model.runtime === 'Chrome-Builtin') return false;
    if (typeof window === 'undefined' || !(await this.isModelSupported(modelId))) return false;
    try {
      const webllm = await import('@mlc-ai/web-llm');
      if (await webllm.hasModelInCache(model.mlcModelId)) return true;
      const fallbackId = model.mlcModelId.replace('q4f16_1', 'q4f32_1');
      return fallbackId !== model.mlcModelId &&
        webllm.prebuiltAppConfig.model_list.some(item => item.model_id === fallbackId) &&
        await webllm.hasModelInCache(fallbackId);
    } catch { return false; }
  }

  static async loadModelToMemory(modelId: string, onProgress?: (progress: ProgressReportPayload) => void): Promise<{ success: boolean; messageFa: string }> {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    if (!model) return { success: false, messageFa: 'مدل انتخاب‌شده در catalog یافت نشد.' };
    if (model.runtime === 'Core-Deterministic') {
      this.setSelectedModelId(modelId);
      return { success: true, messageFa: `موتور قطعی ${model.name} بدون مدل عصبی فعال است.` };
    }
    if (model.runtime === 'Chrome-Builtin') return { success: false, messageFa: 'Chrome Prompt API در این نسخه پیاده‌سازی نشده و قابل انتخاب نیست.' };
    if (typeof window === 'undefined') return { success: false, messageFa: 'محیط اجرای مرورگر در دسترس نیست.' };
    if (this.activeEngine && this.currentResidentModelId === modelId) return { success: true, messageFa: `مدل ${model.name} از قبل در حافظه اجراست.` };
    const operationId = this.beginOperation('LOADING');
    try {
      const webllm = await import('@mlc-ai/web-llm');
      let mlcId = model.mlcModelId;
      if (!webllm.prebuiltAppConfig.model_list.some(item => item.model_id === mlcId)) throw new Error(`MODEL_NOT_SUPPORTED: مدل ${mlcId} در رجیستری WebLLM نصب‌شده وجود ندارد.`);
      const probe = await this.probeHardware();
      if (!probe.hasWebGPU) throw new Error('WEBGPU_UNAVAILABLE: اجرای مدل عصبی بدون WebGPU مجاز نیست.');
      if (!probe.hasShaderF16) {
        const fallback = mlcId.replace('q4f16_1', 'q4f32_1');
        if (webllm.prebuiltAppConfig.model_list.some(item => item.model_id === fallback)) mlcId = fallback;
      }
      await this.disposeActiveEngine();
      const startedAt = performance.now();
      const initProgressCallback = (report: { progress?: number; text?: string }) => {
        const progress = Math.max(0, Math.min(1, report.progress || 0));
        const elapsedSec = Math.max(0.1, (performance.now() - startedAt) / 1000);
        onProgress?.({ percent: Math.round(progress * 100), downloadedMB: Number((progress * model.downloadSizeMB).toFixed(1)), totalMB: model.downloadSizeMB, speedMBs: Number(((progress * model.downloadSizeMB) / elapsedSec).toFixed(1)), text: report.text || 'در حال آماده‌سازی مدل محلی...' });
      };
      let engine: any;
      let worker: Worker | null = null;
      try {
        if (typeof Worker !== 'undefined') {
          worker = new Worker(new URL('./web-llm.worker.ts', import.meta.url), { type: 'module' });
          engine = await webllm.CreateWebWorkerMLCEngine(worker, mlcId, { initProgressCallback });
        }
      } catch (error) {
        worker?.terminate();
        worker = null;
        console.warn('WebLLM worker creation failed; direct engine is attempted.', error);
      }
      if (!engine) engine = await webllm.CreateMLCEngine(mlcId, { initProgressCallback });
      this.assertOperation(operationId);
      this.activeEngine = engine;
      this.activeWorker = worker;
      this.currentResidentModelId = modelId;
      this.setSelectedModelId(modelId);
      return { success: true, messageFa: `مدل ${model.name} به‌صورت محلی در WebGPU بارگذاری شد. دانلود اولیه ممکن است به شبکه نیاز داشته باشد.` };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'MODEL_LOAD_FAILED';
      await this.disposeActiveEngine();
      return { success: false, messageFa: `خطا در بارگذاری مدل: ${this.lastError}` };
    } finally { this.finishOperation(operationId); }
  }

  static async unloadModelFromMemory(): Promise<{ success: boolean; messageFa: string }> {
    const operationId = this.beginOperation('UNLOADING');
    const current = this.currentResidentModelId;
    try {
      await this.disposeActiveEngine();
      return { success: true, messageFa: current ? `مدل ${current} از حافظه GPU تخلیه شد.` : 'هیچ مدل عصبی در حافظه GPU نبود.' };
    } finally { this.finishOperation(operationId); }
  }

  static async deleteModel(modelId: string): Promise<boolean> {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    if (!model || model.runtime !== 'WebLLM-WebGPU') return false;
    const operationId = this.beginOperation('DELETING');
    try {
      if (this.currentResidentModelId === modelId) await this.disposeActiveEngine();
      const webllm = await import('@mlc-ai/web-llm');
      await webllm.deleteModelAllInfoInCache(model.mlcModelId);
      const fallbackId = model.mlcModelId.replace('q4f16_1', 'q4f32_1');
      if (fallbackId !== model.mlcModelId && webllm.prebuiltAppConfig.model_list.some(item => item.model_id === fallbackId)) {
        await webllm.deleteModelAllInfoInCache(fallbackId);
      }
      this.removeOfflineVerification(modelId);
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'MODEL_DELETE_FAILED';
      return false;
    } finally { this.finishOperation(operationId); }
  }

  static buildDeterministicAdvisory(modelId: string, evidence: DeterministicMarketEvidence): StructuredCandidateAdvisory {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    const flags: string[] = [];
    const evidenceIds: string[] = [];
    if (!Number.isFinite(evidence.currentPrice) || evidence.currentPrice <= 0) flags.push('INVALID_MARKET_PRICE');
    if (!evidence.sweepDetected) flags.push('SWEEP_NOT_CONFIRMED'); else evidenceIds.push('SWEEP_CONFIRMED');
    if (!evidence.fvgDetected) flags.push('FVG_NOT_CONFIRMED'); else evidenceIds.push('FVG_CONFIRMED');
    if (!evidence.contextConfirmed) flags.push('CONTEXT_NOT_CONFIRMED'); else evidenceIds.push('CONTEXT_CONFIRMED');
    if (!Number.isFinite(evidence.riskRewardRatio) || (evidence.riskRewardRatio || 0) < 2) flags.push('RISK_REWARD_INSUFFICIENT');
    if (evidence.isHighImpactNewsUpcoming) flags.push('HIGH_IMPACT_NEWS');
    if (Number.isFinite(evidence.spreadPips) && Number.isFinite(evidence.maxAllowedSpreadPips) && (evidence.spreadPips || 0) > (evidence.maxAllowedSpreadPips || 0)) flags.push('SPREAD_LIMIT_EXCEEDED');
    const verdict = flags.length === 0 ? 'TRADE' : 'NO_TRADE';
    return {
      modelId,
      modelRevision: model?.artifactRevision || 'unknown',
      source: 'DETERMINISTIC',
      verdict,
      confidence: verdict === 'TRADE' ? 0.7 : 0,
      rationaleFa: verdict === 'TRADE' ? 'شواهد ساختاری، نسبت سود به زیان و قیود ورودی قطعی همگی برقرارند. این نتیجه صرفاً advisory است.' : `عدم تأیید معامله: ${flags.join('، ')}.`,
      riskFlags: flags,
      evidenceIds,
      latencyMs: 0,
      advisoryOnly: true,
    };
  }

  static async runOfflineInferenceTest(modelId: string, customQuestion: string, symbol: string, currentPrice: number, onToken?: (text: string) => void, options: InferenceOptions = {}): Promise<{ text: string; latencyMs: number; ttftMs: number; chunksPerSec: number; isOfflineVerified: boolean }> {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    if (!model) throw new Error('مدل یافت نشد.');
    if (model.runtime === 'Core-Deterministic') {
      const startedAt = performance.now();
      const advisory = this.buildDeterministicAdvisory(modelId, { symbol, currentPrice });
      const text = `[ارزیابی قطعی محلی — صرفاً آموزشی]\n• نماد: ${symbol}، قیمت: ${currentPrice}\n• نتیجه: ${advisory.verdict}\n• دلایل: ${advisory.rationaleFa}\n• این خروجی فاقد داده کافی برای صدور مجوز سفارش است.`;
      onToken?.(text);
      return { text, latencyMs: Number((performance.now() - startedAt).toFixed(1)), ttftMs: 0, chunksPerSec: 0, isOfflineVerified: this.isOfflineVerified(modelId) };
    }
    if (!this.activeEngine || this.currentResidentModelId !== modelId) {
      const loaded = await this.loadModelToMemory(modelId);
      if (!loaded.success) throw new Error(loaded.messageFa);
    }
    const operationId = this.beginOperation('GENERATING');
    const startedAt = performance.now();
    this.abortController = new AbortController();
    try {
      const systemPrompt = options.systemPrompt || `شما یک دستیار آموزشی تحلیل بازار هستید. داده ناکافی را صریحاً اعلام کنید. هیچ‌گاه مجوز اجرای سفارش صادر نکنید. پاسخ را به فارسی و فشرده بنویسید. نماد: ${symbol}; قیمت: ${currentPrice}.`;
      const responseStream = await this.activeEngine.chat.completions.create({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: customQuestion.trim() || 'داده کافی نیست؛ وضعیت را بررسی کن.' }], temperature: 0.1, max_tokens: options.maxTokens || 384, stream: true });
      let text = '';
      let chunkCount = 0;
      let ttftMs = 0;
      for await (const chunk of responseStream) {
        if (this.abortController?.signal.aborted) { text += '\n[تولید پاسخ متوقف شد.]'; break; }
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          if (chunkCount === 0) ttftMs = Number((performance.now() - startedAt).toFixed(1));
          chunkCount += 1;
          text += delta;
          onToken?.(text);
        }
      }
      const latencyMs = Number((performance.now() - startedAt).toFixed(1));
      return { text, latencyMs, ttftMs: ttftMs || latencyMs, chunksPerSec: chunkCount > 0 ? Number(((chunkCount / latencyMs) * 1000).toFixed(1)) : 0, isOfflineVerified: this.isOfflineVerified(modelId) };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'INFERENCE_FAILED';
      throw new Error(`خطا در استنتاج محلی: ${this.lastError}`);
    } finally {
      this.abortController = null;
      this.finishOperation(operationId);
    }
  }

  static async evaluateCandidateAdvisory(modelId: string, evidence: DeterministicMarketEvidence, customSystemPrompt?: string, customUserPrompt?: string): Promise<StructuredCandidateAdvisory> {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    if (!model) throw new Error('مدل انتخاب‌شده نامعتبر است.');
    if (model.runtime === 'Core-Deterministic') return this.buildDeterministicAdvisory(modelId, evidence);
    if (model.runtime === 'Chrome-Builtin') throw new Error('CHROME_PROMPT_API_UNIMPLEMENTED');
    const systemPrompt = customSystemPrompt || 'فقط یک JSON معتبر و بدون markdown برگردان. شکل دقیق: {"verdict":"TRADE|NO_TRADE|REVIEW_REQUIRED","confidence":number,"rationaleFa":string,"riskFlags":string[]}. تو یک ابزار advisory هستی؛ هیچ‌گاه اجازه اجرای سفارش صادر نکن. اگر داده ناکافی، مبهم یا متناقض است verdict باید REVIEW_REQUIRED یا NO_TRADE باشد.';
    const result = await this.runOfflineInferenceTest(modelId, customUserPrompt || JSON.stringify(evidence), evidence.symbol, evidence.currentPrice, undefined, { systemPrompt, maxTokens: 220 });
    const parsed = this.parseStructuredAdvisory(result.text);
    return {
      modelId,
      modelRevision: model.artifactRevision,
      source: 'WEBLLM_WEBGPU',
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      rationaleFa: parsed.rationaleFa,
      riskFlags: parsed.riskFlags,
      evidenceIds: [],
      latencyMs: result.latencyMs,
      advisoryOnly: true,
    };
  }

  static async verifyCachedModelOffline(modelId: string, probeText = 'پاسخ کوتاه بده: آماده'): Promise<{ verified: boolean; messageFa: string }> {
    if (typeof navigator === 'undefined' || navigator.onLine) return { verified: false, messageFa: 'برای تأیید آفلاین، ابتدا شبکه را قطع کنید و دوباره آزمون را اجرا کنید.' };
    if (!(await this.isModelDownloaded(modelId))) return { verified: false, messageFa: 'فایل کامل مدل در cache محلی یافت نشد.' };
    try {
      await this.runOfflineInferenceTest(modelId, probeText, 'OFFLINE_TEST', 1);
      this.markOfflineVerified(modelId);
      return { verified: true, messageFa: 'مدل با شبکه قطع‌شده از cache محلی اجرا شد.' };
    } catch (error) { return { verified: false, messageFa: `آزمون آفلاین ناموفق بود: ${(error as Error).message}` }; }
  }

  static stopInference(): void { this.abortController?.abort(); }

  static isOfflineVerified(modelId: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_OFFLINE_VERIFIED) || '{}') as Record<string, OfflineVerificationRecord>;
      return data[modelId]?.browserOnlineAtVerification === false;
    } catch { return false; }
  }

  static markOfflineVerified(modelId: string): void {
    if (typeof window === 'undefined' || navigator.onLine) return;
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    if (!model) return;
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_OFFLINE_VERIFIED) || '{}') as Record<string, OfflineVerificationRecord>;
      data[modelId] = { verifiedAt: Date.now(), modelRevision: model.artifactRevision, browserOnlineAtVerification: false };
      localStorage.setItem(STORAGE_OFFLINE_VERIFIED, JSON.stringify(data));
    } catch { /* storage persistence is best effort */ }
  }

  private static parseStructuredAdvisory(text: string): { verdict: StructuredCandidateAdvisory['verdict']; confidence: number; rationaleFa: string; riskFlags: string[] } {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first < 0 || last <= first) return { verdict: 'REVIEW_REQUIRED', confidence: 0, rationaleFa: 'خروجی مدل JSON معتبر نبود؛ بررسی انسانی لازم است.', riskFlags: ['INVALID_MODEL_OUTPUT'] };
    try {
      const data = JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>;
      const verdict = data.verdict === 'TRADE' || data.verdict === 'NO_TRADE' || data.verdict === 'REVIEW_REQUIRED' ? data.verdict : 'REVIEW_REQUIRED';
      const confidence = typeof data.confidence === 'number' && Number.isFinite(data.confidence) ? Math.max(0, Math.min(1, data.confidence)) : 0;
      const rationaleFa = typeof data.rationaleFa === 'string' && data.rationaleFa.trim() ? data.rationaleFa.slice(0, 1200) : 'مدل توضیح معتبر ارائه نکرد؛ بررسی انسانی لازم است.';
      const riskFlags = Array.isArray(data.riskFlags) ? data.riskFlags.filter((value): value is string => typeof value === 'string').slice(0, 12) : ['MISSING_RISK_FLAGS'];
      return { verdict, confidence, rationaleFa, riskFlags };
    } catch { return { verdict: 'REVIEW_REQUIRED', confidence: 0, rationaleFa: 'خروجی مدل قابل parse نبود؛ بررسی انسانی لازم است.', riskFlags: ['INVALID_MODEL_JSON'] }; }
  }

  private static beginOperation(state: OfflineRuntimeState): number {
    if (this.runtimeState !== 'IDLE') throw new Error(`AI_OPERATION_BUSY: عملیات ${this.runtimeState} هنوز کامل نشده است.`);
    const id = ++this.operationCounter;
    this.runtimeState = state;
    this.activeOperationId = id;
    this.lastError = undefined;
    return id;
  }

  private static assertOperation(operationId: number): void {
    if (this.activeOperationId !== operationId) throw new Error('AI_OPERATION_SUPERSEDED: نتیجه عملیات قدیمی پذیرفته نشد.');
  }

  private static finishOperation(operationId: number): void {
    if (this.activeOperationId === operationId) {
      this.runtimeState = 'IDLE';
      this.activeOperationId = null;
    }
  }

  private static async disposeActiveEngine(): Promise<void> {
    const engine = this.activeEngine;
    const worker = this.activeWorker;
    this.activeEngine = null;
    this.activeWorker = null;
    this.currentResidentModelId = null;
    try { if (engine?.unload) await engine.unload(); } finally { worker?.terminate(); }
  }

  private static removeOfflineVerification(modelId: string): void {
    if (typeof window === 'undefined') return;
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_OFFLINE_VERIFIED) || '{}') as Record<string, OfflineVerificationRecord>;
      delete data[modelId];
      localStorage.setItem(STORAGE_OFFLINE_VERIFIED, JSON.stringify(data));
    } catch { /* best effort */ }
  }
}
