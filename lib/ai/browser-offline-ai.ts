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
  /** Exact artifact size used to reject truncated LiteRT CacheStorage entries. */
  artifactBytes?: number;
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
    id: 'gemma-4-e4b-litert',
    mlcModelId: '',
    name: 'Gemma 4 E4B (آزمایش LiteRT-LM Web)',
    family: 'Gemma',
    version: 'Gemma-4-E4B-it-web',
    params: '۴.۵B مؤثر (۸B با embedding)',
    quantization: 'int4 .litertlm Web',
    runtime: 'LiteRT-LM-Web',
    downloadSizeMB: 2969,
    estimatedVRAMMB: 3300,
    descriptionFa: 'مسیر آزمایشی Gemma با runtime مستقل LiteRT-LM Web. فقط متن را پردازش می‌کند و در Worker اجرا نمی‌شود. مدل WebLLM مقیم فقط پس از کامل‌شدن artifact و پیش از ساخت Engine LiteRT از GPU تخلیه می‌شود. خروجی advisory پس از اعتبارسنجی JSON پذیرفته می‌شود.',
    targetDeviceFa: 'دسکتاپ یا تبلت مجهز به WebGPU؛ سازگاری و حافظه روی هر دستگاه باید جداگانه آزمون شود.',
    isExperimental: true,
    isBuiltIn: false,
    artifactRevision: 'gemma-4-e4b-it-web-litertlm@2eee7ac325f20eb8c9ac1d0e972f7c84663062da',
    artifactBytes: 2_969_059_328,
    modelUrl: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/2eee7ac325f20eb8c9ac1d0e972f7c84663062da/gemma-4-E4B-it-web.litertlm',
    densityTier: 'HEAVY_POWER',
    densityBadgeFa: 'آزمایش مستقل LiteRT (۲٫۹۷GB)',
    recommendedDevices: ['SNAPDRAGON_PC', 'TABLET'],
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
const LITERT_MODEL_CACHE_NAME = 'hamed-trading-litert-model-v1';
const LITERT_WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@litert-lm/core@0.17.0/wasm';
const LITERT_ARTIFACT_BYTES_HEADER = 'X-TradeWithHamed-Artifact-Bytes';
const LITERT_ARTIFACT_REVISION_HEADER = 'X-TradeWithHamed-Artifact-Revision';

type LiteRTRuntimeModule = {
  Engine: {
    create: (settings: {
      model: ReadableStream<Uint8Array>;
      mainExecutorSettings?: { maxNumTokens?: number };
    }) => Promise<any>;
  };
  getOrLoadGlobalLiteRtLm: (path?: string) => Promise<unknown>;
  unloadLiteRtLm: () => void;
};

export interface ProgressReportPayload {
  percent: number;
  downloadedMB: number;
  totalMB: number;
  speedMBs: number;
  text: string;
}

export interface ModelDownloadReadiness {
  canStart: boolean;
  reasonFa: string;
  availableStorageMB: number;
}

interface InferenceOptions {
  systemPrompt?: string;
  maxTokens?: number;
}

export class BrowserOfflineAIManager {
  private static activeEngine: any = null;
  private static activeWorker: Worker | null = null;
  private static activeLiteRTEngine: any = null;
  private static activeLiteRTConversation: any = null;
  private static activeLiteRTRuntime: LiteRTRuntimeModule | null = null;
  private static currentResidentModelId: string | null = null;
  private static abortController: AbortController | null = null;
  private static loadAbortController: AbortController | null = null;
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
    if (model.runtime === 'LiteRT-LM-Web') {
      return typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        Boolean((navigator as any).gpu) &&
        typeof caches !== 'undefined';
    }
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
    if (model.runtime === 'LiteRT-LM-Web') {
      try {
        const cache = await caches.open(LITERT_MODEL_CACHE_NAME);
        await this.removeLiteRTArtifacts(cache, model, true);
        const cached = await cache.match(model.modelUrl);
        if (this.isValidLiteRTCachedArtifact(cached, model)) return true;
        if (cached) await cache.delete(model.modelUrl);
        return false;
      } catch { return false; }
    }
    try {
      const webllm = await import('@mlc-ai/web-llm');
      if (await webllm.hasModelInCache(model.mlcModelId)) return true;
      const fallbackId = model.mlcModelId.replace('q4f16_1', 'q4f32_1');
      return fallbackId !== model.mlcModelId &&
        webllm.prebuiltAppConfig.model_list.some(item => item.model_id === fallbackId) &&
        await webllm.hasModelInCache(fallbackId);
    } catch { return false; }
  }

  static async getDownloadReadiness(modelId: string): Promise<ModelDownloadReadiness> {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    if (!model) return { canStart: false, reasonFa: 'مدل در فهرست برنامه وجود ندارد.', availableStorageMB: 0 };
    if (model.runtime === 'Core-Deterministic') return { canStart: true, reasonFa: 'این موتور نیازی به دانلود ندارد.', availableStorageMB: 0 };
    if (model.runtime === 'Chrome-Builtin') return { canStart: false, reasonFa: 'Chrome Prompt API در این نسخه پیاده‌سازی نشده است.', availableStorageMB: 0 };
    if (!(await this.isModelSupported(modelId))) {
      const reasonFa = model.runtime === 'LiteRT-LM-Web'
        ? 'LiteRT-LM Web به WebGPU و CacheStorage در یک زمینهٔ امن مرورگر نیاز دارد.'
        : 'artifact این مدل در registry نسخهٔ نصب‌شدهٔ WebLLM وجود ندارد.';
      return { canStart: false, reasonFa, availableStorageMB: 0 };
    }
    const hardware = await this.probeHardware();
    if (!hardware.hasWebGPU) return { canStart: false, reasonFa: 'WebGPU در این مرورگر یا دستگاه فعال نیست.', availableStorageMB: 0 };
    const availableStorageMB = Math.max(0, hardware.estimatedStorageQuotaMB - hardware.estimatedStorageUsageMB);
    if (hardware.estimatedStorageQuotaMB > 0 && availableStorageMB < Math.ceil(model.downloadSizeMB * 1.2)) {
      return { canStart: false, reasonFa: `فضای cache کافی نیست: حدود ${availableStorageMB}MB آزاد است، اما حداقل ${Math.ceil(model.downloadSizeMB * 1.2)}MB لازم است.`, availableStorageMB };
    }
    const reasonFa = model.runtime === 'LiteRT-LM-Web'
      ? 'آمادهٔ دریافت artifact و runtime LiteRT-LM است؛ سازگاری نهایی به شبکه، GPU و quota مرورگر بستگی دارد.'
      : 'آمادهٔ دانلود و بارگذاری است؛ نتیجهٔ نهایی به شبکه و GPU دستگاه وابسته است.';
    return { canStart: true, reasonFa, availableStorageMB };
  }

  private static useFastMirror: boolean = false;

  static setUseFastMirror(enabled: boolean): void {
    this.useFastMirror = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('trade_offline_ai_use_mirror', enabled ? '1' : '0');
    }
  }

  static getUseFastMirror(): boolean {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('trade_offline_ai_use_mirror');
      if (stored !== null) return stored === '1';
    }
    return this.useFastMirror;
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
    const readiness = await this.getDownloadReadiness(modelId);
    if (!readiness.canStart) return { success: false, messageFa: readiness.reasonFa };
    if ((this.activeEngine || this.activeLiteRTEngine) && this.currentResidentModelId === modelId) return { success: true, messageFa: `مدل ${model.name} از قبل در حافظه اجراست.` };
    if (model.runtime === 'LiteRT-LM-Web') return this.loadLiteRTModelToMemory(model, onProgress);
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

      const useMirror = this.getUseFastMirror();
      let appConfig = webllm.prebuiltAppConfig;
      if (useMirror) {
        appConfig = {
          ...webllm.prebuiltAppConfig,
          model_list: webllm.prebuiltAppConfig.model_list.map((m: any) => ({
            ...m,
            model_url: typeof m.model_url === 'string' ? m.model_url.replace('https://huggingface.co/', 'https://hf-mirror.com/') : m.model_url,
            model: typeof m.model === 'string' ? m.model.replace('https://huggingface.co/', 'https://hf-mirror.com/') : m.model,
          })),
        };
      }

      let engine: any;
      let worker: Worker | null = null;
      try {
        if (typeof Worker !== 'undefined') {
          worker = new Worker(new URL('./web-llm.worker.ts', import.meta.url), { type: 'module' });
          engine = await webllm.CreateWebWorkerMLCEngine(worker, mlcId, { initProgressCallback, appConfig });
        }
      } catch (error) {
        worker?.terminate();
        worker = null;
        console.warn('WebLLM worker creation failed; direct engine is attempted.', error);
      }
      if (!engine) engine = await webllm.CreateMLCEngine(mlcId, { initProgressCallback, appConfig });
      this.assertOperation(operationId);
      this.activeEngine = engine;
      this.activeWorker = worker;
      this.currentResidentModelId = modelId;
      this.setSelectedModelId(modelId);
      return { success: true, messageFa: `مدل ${model.name} به‌صورت محلی در WebGPU بارگذاری شد. دانلود اولیه ممکن است به شبکه نیاز داشته باشد.` };
    } catch (error) {
      const rawError = error instanceof Error ? error.message : 'MODEL_LOAD_FAILED';
      this.lastError = rawError;
      await this.disposeActiveEngine();

      let friendlyMsg = `خطا در بارگذاری مدل: ${rawError}`;
      if (rawError.includes('Failed to fetch') || rawError.includes('NetworkError') || rawError.includes('fetch failed')) {
        friendlyMsg = `دانلود یا دسترسی به artifact ناموفق بود (${this.getUseFastMirror() ? 'mirror' : 'Hugging Face مستقیم'}). اتصال شبکه و تنظیم mirror را بررسی و دوباره تلاش کنید.`;
      } else if (rawError.includes('QuotaExceededError')) {
        friendlyMsg = 'حافظه کش مرورگر پر شده است. لطفاً کش مدل‌های قبلی را حذف کنید تا فضا آزاد شود.';
      }
      return { success: false, messageFa: friendlyMsg };
    } finally { this.finishOperation(operationId); }
  }

  private static async loadLiteRTModelToMemory(model: BrowserAIModelRecord, onProgress?: (progress: ProgressReportPayload) => void): Promise<{ success: boolean; messageFa: string }> {
    const operationId = this.beginOperation('LOADING');
    const startedAt = performance.now();
    const loadAbortController = new AbortController();
    this.loadAbortController = loadAbortController;
    let replacedResidentRuntime = false;
    let warmedLiteRTRuntime: LiteRTRuntimeModule | null = null;
    try {
      const probe = await this.probeHardware();
      if (!probe.hasWebGPU) throw new Error('WEBGPU_UNAVAILABLE: اجرای Gemma LiteRT بدون WebGPU مجاز نیست.');
      onProgress?.({ percent: 0, downloadedMB: 0, totalMB: model.downloadSizeMB, speedMBs: 0, text: 'در حال آماده‌سازی runtime LiteRT-LM و بررسی CacheStorage...' });
      const prepared = await this.prepareLiteRTModelStream(model, startedAt, loadAbortController.signal, onProgress);
      this.throwIfLiteRTLoadCancelled(loadAbortController.signal);
      // Cancellation only applies while receiving the artifact. From this point
      // the cache is complete and an Engine.create() cancellation would leave the
      // resident-model switch ambiguous, so the UI must stop offering it.
      if (this.loadAbortController === loadAbortController) this.loadAbortController = null;
      const litert = await import('@litert-lm/core') as unknown as LiteRTRuntimeModule;
      await litert.getOrLoadGlobalLiteRtLm(LITERT_WASM_BASE_URL);
      warmedLiteRTRuntime = litert;
      this.assertOperation(operationId);
      this.throwIfLiteRTLoadCancelled(loadAbortController.signal);
      onProgress?.({ percent: 100, downloadedMB: model.downloadSizeMB, totalMB: model.downloadSizeMB, speedMBs: 0, text: 'runtime LiteRT-LM آماده است؛ مدل Gemma در WebGPU بارگذاری می‌شود...' });
      // The cached artifact and LiteRT runtime are now ready. Preserve the old resident
      // model until this point so a failed or cancelled download never evicts it.
      await this.disposeActiveEngine();
      replacedResidentRuntime = true;
      this.activeLiteRTRuntime = litert;
      const engine = await litert.Engine.create({
        model: prepared.stream,
        mainExecutorSettings: { maxNumTokens: 4096 },
      });
      this.assertOperation(operationId);
      this.activeLiteRTEngine = engine;
      this.currentResidentModelId = model.id;
      this.setSelectedModelId(model.id);
      return {
        success: true,
        messageFa: `مدل ${model.name} با LiteRT-LM در WebGPU بارگذاری و artifact آن در CacheStorage ذخیره شد. آزمون آفلاین کامل LiteRT فقط پس از بررسی جداگانهٔ runtime روی همان دستگاه معتبر است.`,
      };
    } catch (error) {
      const rawError = error instanceof Error ? error.message : 'LITERT_MODEL_LOAD_FAILED';
      this.lastError = rawError;
      const cancelled = loadAbortController.signal.aborted || rawError.includes('LITERT_MODEL_DOWNLOAD_CANCELLED');
      if (replacedResidentRuntime) await this.disposeActiveEngine();
      else if (warmedLiteRTRuntime) {
        try { warmedLiteRTRuntime.unloadLiteRtLm(); } catch { /* best effort cleanup of a warm runtime */ }
      }
      if (cancelled) {
        return { success: false, messageFa: 'دریافت artifact Gemma لغو شد؛ مدل قبلی در حافظه GPU بدون تغییر باقی ماند.' };
      }
      let messageFa = `خطا در بارگذاری LiteRT: ${rawError}`;
      if (rawError.includes('Failed to fetch') || rawError.includes('NetworkError') || rawError.includes('fetch failed')) {
        messageFa = 'دریافت Gemma یا runtime LiteRT ناموفق بود. اتصال شبکه، دسترسی به Hugging Face و jsDelivr، و WebGPU دستگاه را بررسی کنید.';
      } else if (rawError.includes('QuotaExceededError') || rawError.includes('LITERT_CACHE_WRITE_FAILED')) {
        messageFa = 'فضای CacheStorage برای نگه‌داری artifact Gemma کافی نبود؛ قبل از اجرای مجدد فضای مرورگر را آزاد کنید.';
      }
      return { success: false, messageFa };
    } finally {
      if (this.loadAbortController === loadAbortController) this.loadAbortController = null;
      this.finishOperation(operationId);
    }
  }

  static cancelModelLoad(): boolean {
    if (!this.loadAbortController || this.loadAbortController.signal.aborted) return false;
    this.loadAbortController.abort();
    return true;
  }

  private static throwIfLiteRTLoadCancelled(signal: AbortSignal): void {
    if (signal.aborted) throw new Error('LITERT_MODEL_DOWNLOAD_CANCELLED');
  }

  private static async prepareLiteRTModelStream(model: BrowserAIModelRecord, startedAt: number, signal: AbortSignal, onProgress?: (progress: ProgressReportPayload) => void): Promise<{ stream: ReadableStream<Uint8Array> }> {
    const cache = await caches.open(LITERT_MODEL_CACHE_NAME);
    await this.removeLiteRTArtifacts(cache, model, true);
    const cached = await cache.match(model.modelUrl);
    if (this.isValidLiteRTCachedArtifact(cached, model)) {
      onProgress?.({ percent: 100, downloadedMB: model.downloadSizeMB, totalMB: model.downloadSizeMB, speedMBs: 0, text: 'artifact Gemma از CacheStorage محلی خوانده می‌شود...' });
      const cachedBody = cached.body;
      if (cachedBody) return { stream: cachedBody };
    }
    if (cached) await cache.delete(model.modelUrl);
    this.throwIfLiteRTLoadCancelled(signal);

    onProgress?.({ percent: 0, downloadedMB: 0, totalMB: model.downloadSizeMB, speedMBs: 0, text: 'در حال دریافت artifact Gemma از مخزن عمومی...' });
    try {
      const response = await fetch(model.modelUrl, { cache: 'no-store', credentials: 'omit', signal });
      if (!response.ok || !response.body) throw new Error(`LITERT_MODEL_FETCH_FAILED: HTTP ${response.status}`);
      const contentLength = Number(response.headers.get('content-length'));
      const expectedBytes = model.artifactBytes || (Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0);
      if (!Number.isFinite(expectedBytes) || expectedBytes <= 0) throw new Error('LITERT_ARTIFACT_SIZE_UNKNOWN');
      if (Number.isFinite(contentLength) && contentLength > 0 && contentLength !== expectedBytes) {
        throw new Error(`LITERT_ARTIFACT_SIZE_MISMATCH: expected ${expectedBytes}, received header ${contentLength}`);
      }
      const cachedHeaders = new Headers(response.headers);
      cachedHeaders.set(LITERT_ARTIFACT_BYTES_HEADER, String(expectedBytes));
      cachedHeaders.set(LITERT_ARTIFACT_REVISION_HEADER, model.artifactRevision);
      await cache.put(model.modelUrl, new Response(
        this.createProgressStream(response.body, expectedBytes, model.downloadSizeMB, startedAt, signal, onProgress),
        { status: response.status, statusText: response.statusText, headers: cachedHeaders },
      ));
      this.throwIfLiteRTLoadCancelled(signal);
    } catch (error) {
      await cache.delete(model.modelUrl);
      throw new Error(`LITERT_CACHE_WRITE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
    const stored = await cache.match(model.modelUrl);
    if (!this.isValidLiteRTCachedArtifact(stored, model)) {
      await cache.delete(model.modelUrl);
      throw new Error('LITERT_CACHE_WRITE_FAILED: artifact ذخیره‌شده معتبر یا قابل خواندن نیست.');
    }
    const storedBody = stored.body;
    if (!storedBody) {
      await cache.delete(model.modelUrl);
      throw new Error('LITERT_CACHE_WRITE_FAILED: artifact ذخیره‌شده قابل خواندن نیست.');
    }
    return { stream: storedBody };
  }

  private static createProgressStream(source: ReadableStream<Uint8Array>, expectedBytes: number, totalMB: number, startedAt: number, signal: AbortSignal, onProgress?: (progress: ProgressReportPayload) => void): ReadableStream<Uint8Array> {
    const reader = source.getReader();
    let receivedBytes = 0;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (signal.aborted) {
          await reader.cancel('LITERT_MODEL_DOWNLOAD_CANCELLED');
          controller.error(new Error('LITERT_MODEL_DOWNLOAD_CANCELLED'));
          return;
        }
        const next = await reader.read();
        if (signal.aborted) {
          await reader.cancel('LITERT_MODEL_DOWNLOAD_CANCELLED');
          controller.error(new Error('LITERT_MODEL_DOWNLOAD_CANCELLED'));
          return;
        }
        if (next.done) {
          if (receivedBytes !== expectedBytes) {
            controller.error(new Error(`LITERT_ARTIFACT_SIZE_MISMATCH: expected ${expectedBytes}, received ${receivedBytes}`));
            return;
          }
          onProgress?.({ percent: 100, downloadedMB: totalMB, totalMB, speedMBs: Number((totalMB / Math.max(0.1, (performance.now() - startedAt) / 1000)).toFixed(1)), text: 'دریافت artifact کامل شد؛ در حال اعتبارسنجی و ساخت منابع WebGPU...' });
          controller.close();
          return;
        }
        receivedBytes += next.value.byteLength;
        const elapsedSec = Math.max(0.1, (performance.now() - startedAt) / 1000);
        const downloadedMB = Math.min(totalMB, (receivedBytes / expectedBytes) * totalMB);
        onProgress?.({
          percent: Math.min(99, Math.round((receivedBytes / expectedBytes) * 100)),
          downloadedMB: Number(downloadedMB.toFixed(1)),
          totalMB,
          speedMBs: Number((downloadedMB / elapsedSec).toFixed(1)),
          text: 'در حال دریافت و ذخیرهٔ artifact Gemma در CacheStorage...',
        });
        controller.enqueue(next.value);
      },
      async cancel(reason) { await reader.cancel(reason); },
    });
  }

  private static isValidLiteRTCachedArtifact(response: Response | undefined, model: BrowserAIModelRecord): response is Response {
    if (!response?.ok || !response.body || !model.artifactBytes) return false;
    return Number(response.headers.get(LITERT_ARTIFACT_BYTES_HEADER)) === model.artifactBytes &&
      response.headers.get(LITERT_ARTIFACT_REVISION_HEADER) === model.artifactRevision;
  }

  private static async removeLiteRTArtifacts(cache: Cache, model: BrowserAIModelRecord, keepCurrent: boolean): Promise<boolean> {
    const modelUrl = new URL(model.modelUrl);
    const resolveIndex = modelUrl.pathname.indexOf('/resolve/');
    const repositoryPath = resolveIndex >= 0 ? modelUrl.pathname.slice(0, resolveIndex + 1) : modelUrl.pathname;
    const requests = await cache.keys();
    let deleted = false;
    for (const request of requests) {
      const candidate = new URL(request.url);
      const belongsToRepository = candidate.origin === modelUrl.origin && candidate.pathname.startsWith(repositoryPath);
      if (belongsToRepository && (!keepCurrent || request.url !== model.modelUrl)) {
        deleted = (await cache.delete(request)) || deleted;
      }
    }
    return deleted;
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
    if (!model || (model.runtime !== 'WebLLM-WebGPU' && model.runtime !== 'LiteRT-LM-Web')) return false;
    const operationId = this.beginOperation('DELETING');
    try {
      if (this.currentResidentModelId === modelId) await this.disposeActiveEngine();
      if (model.runtime === 'LiteRT-LM-Web') {
        const cache = await caches.open(LITERT_MODEL_CACHE_NAME);
        const deleted = await this.removeLiteRTArtifacts(cache, model, false);
        this.removeOfflineVerification(modelId);
        return deleted;
      }
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
    if (model.runtime === 'LiteRT-LM-Web') return this.runLiteRTInferenceTest(model, customQuestion, symbol, currentPrice, onToken, options);
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

  private static async runLiteRTInferenceTest(model: BrowserAIModelRecord, customQuestion: string, symbol: string, currentPrice: number, onToken?: (text: string) => void, options: InferenceOptions = {}): Promise<{ text: string; latencyMs: number; ttftMs: number; chunksPerSec: number; isOfflineVerified: boolean }> {
    if (!this.activeLiteRTEngine || this.currentResidentModelId !== model.id) {
      const loaded = await this.loadModelToMemory(model.id);
      if (!loaded.success) throw new Error(loaded.messageFa);
    }
    const operationId = this.beginOperation('GENERATING');
    const startedAt = performance.now();
    const abortController = new AbortController();
    this.abortController = abortController;
    let conversation: any = null;
    try {
      const systemPrompt = options.systemPrompt || `You are an educational market-analysis assistant. State clearly when evidence is insufficient. Never authorize or execute an order. Respond concisely in English. Symbol: ${symbol}; price: ${currentPrice}.`;
      conversation = await this.activeLiteRTEngine.createConversation({
        preface: { messages: [{ role: 'system', content: systemPrompt }] },
        sessionConfig: { maxOutputTokens: Math.min(512, Math.max(1, options.maxTokens || 384)), samplerParams: { temperature: 0.1 } },
      });
      this.activeLiteRTConversation = conversation;
      const reader = conversation.sendMessageStreaming({ role: 'user', content: customQuestion.trim() || 'Evidence is insufficient. Review the situation.' }).getReader();
      let text = '';
      let chunkCount = 0;
      let ttftMs = 0;
      let wasStopped = false;
      try {
        while (true) {
          if (abortController.signal.aborted) {
            wasStopped = true;
            conversation.cancel();
            break;
          }
          const next = await reader.read();
          if (next.done) break;
          const delta = this.extractLiteRTText(next.value);
          if (!delta) continue;
          if (chunkCount === 0) ttftMs = Number((performance.now() - startedAt).toFixed(1));
          chunkCount += 1;
          text += delta;
          onToken?.(text);
        }
      } catch (error) {
        if (abortController.signal.aborted) wasStopped = true;
        else throw error;
      } finally { reader.releaseLock(); }
      if (wasStopped) {
        text += '\n[تولید پاسخ متوقف شد.]';
        onToken?.(text);
      }
      const latencyMs = Number((performance.now() - startedAt).toFixed(1));
      return { text, latencyMs, ttftMs: ttftMs || latencyMs, chunksPerSec: chunkCount > 0 ? Number(((chunkCount / latencyMs) * 1000).toFixed(1)) : 0, isOfflineVerified: false };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'LITERT_INFERENCE_FAILED';
      throw new Error(`خطا در استنتاج LiteRT: ${this.lastError}`);
    } finally {
      if (this.activeLiteRTConversation === conversation) this.activeLiteRTConversation = null;
      try { conversation?.cancel(); } catch { /* cancellation is best effort */ }
      try { await conversation?.delete?.(); } catch { /* conversation cleanup is best effort */ }
      this.abortController = null;
      this.finishOperation(operationId);
    }
  }

  private static extractLiteRTText(message: any): string {
    const content = message?.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .map(part => typeof part?.text === 'string' ? part.text : '')
      .join('');
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
      source: model.runtime === 'LiteRT-LM-Web' ? 'LITERT_LM_WEB' : 'WEBLLM_WEBGPU',
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
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    if (model?.runtime === 'LiteRT-LM-Web') {
      return { verified: false, messageFa: 'artifact Gemma در CacheStorage نگه‌داری می‌شود، اما runtime LiteRT هنوز از مسیر CDN بارگذاری می‌شود؛ بنابراین تأیید آفلاین کامل این مدل در این نسخه عمداً فعال نیست.' };
    }
    if (typeof navigator === 'undefined' || navigator.onLine) return { verified: false, messageFa: 'برای تأیید آفلاین، ابتدا شبکه را قطع کنید و دوباره آزمون را اجرا کنید.' };
    if (!(await this.isModelDownloaded(modelId))) return { verified: false, messageFa: 'فایل کامل مدل در cache محلی یافت نشد.' };
    try {
      await this.runOfflineInferenceTest(modelId, probeText, 'OFFLINE_TEST', 1);
      this.markOfflineVerified(modelId);
      return { verified: true, messageFa: 'مدل با شبکه قطع‌شده از cache محلی اجرا شد.' };
    } catch (error) { return { verified: false, messageFa: `آزمون آفلاین ناموفق بود: ${(error as Error).message}` }; }
  }

  static stopInference(): void {
    this.abortController?.abort();
    try { this.activeLiteRTConversation?.cancel?.(); } catch { /* cancellation is best effort */ }
  }

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
    const liteRTEngine = this.activeLiteRTEngine;
    const liteRTConversation = this.activeLiteRTConversation;
    const liteRTRuntime = this.activeLiteRTRuntime;
    this.activeEngine = null;
    this.activeWorker = null;
    this.activeLiteRTEngine = null;
    this.activeLiteRTConversation = null;
    this.activeLiteRTRuntime = null;
    this.currentResidentModelId = null;
    try { liteRTConversation?.cancel?.(); } catch { /* best effort */ }
    try { await liteRTConversation?.delete?.(); } catch { /* best effort */ }
    try { await liteRTEngine?.delete?.(); } catch { /* best effort */ }
    try { liteRTRuntime?.unloadLiteRtLm(); } catch { /* LiteRT cannot unload while its WASM is still loading */ }
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
