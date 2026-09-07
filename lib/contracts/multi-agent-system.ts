// lib/contracts/multi-agent-system.ts
// قراردادهای رسمی سیستم ۴ ایجنتی چندمدلی و سبک‌های معاملاتی
// بر اساس اصول متریال ۳، معماری کامپوننت‌های تفکیک‌شده و تضمین ۱۰۰٪ آفلاین

export type TradingStyleId =
  | 'S0_SWEEP_FVG'         // سبک اصلی S0: سوییپ نقدینگی سشن‌ها + FVG + ورود لیمیت در ۵ دقیقه
  | 'BOS_ORDER_BLOCK'      // سبک شکست ساختار: ورود در اردر بلاک هم‌جهت با روند ماژور (ICT / SMC)
  | 'EQUILIBRIUM_DISCOUNT'; // سبک بازگشت به تعادل: خرید در ناحیه تخفیف ۵۰٪ (Discount/Premium)

export interface TradingStyleInfo {
  id: TradingStyleId;
  nameEn: string;
  nameFa: string;
  badgeFa: string;
  descriptionFa: string;
  coreRulesFa: string[];
  minimumRR: number;
}

export const TRADING_STYLES: TradingStyleInfo[] = [
  {
    id: 'S0_SWEEP_FVG',
    nameEn: 'S0 Intraday Session Sweep & FVG',
    nameFa: 'سبک سوییپ سشن و شکاف ارزش منصفانه (S0)',
    badgeFa: 'سبک اصلی و پیش‌فرض S0',
    descriptionFa: 'شکار نقدینگی استاپ‌های بالای سقف یا زیر کف سشن آسیا/لندن و ورود لیمیت در FVG با ریسک به ریوارد بالا.',
    coreRulesFa: [
      'سوییپ قطعی با نفوذ شدو و بسته شدن کلوز داخل رنج (حداقل ۱ پیپ نفوذ)',
      'تشکیل شکاف ارزش منصفانه (FVG) ۳ کندلی معتبر',
      'کاشت سفارش Limit در ناحیه تعادل یا ۵۰٪ گپ',
      'حداقل نسبت ریوارد به ریسک ۱ به ۲٫۵',
    ],
    minimumRR: 2.5,
  },
  {
    id: 'BOS_ORDER_BLOCK',
    nameEn: 'Market Structure Shift & Order Block',
    nameFa: 'سبک شکست ساختار و اردر بلاک روندی (BOS / OB)',
    badgeFa: 'سبک روندی اسمارت مانی',
    descriptionFa: 'تشخیص شکست سقف/کف‌های معتبر و ورود در پولبک به آخرین کندل خلاف جهت پیش از حرکت پرشتاب (Order Block).',
    coreRulesFa: [
      'شکست ساختار ماژور (BOS) یا تغییر ماهیت روند (CHoCH)',
      'شناسایی کندل اردر بلاک دست‌نخورده (Mitigated نشده)',
      'هم‌راستایی جهت معامله با روند تایم‌فریم ۱ ساعته و ۴ ساعته',
      'حد ضرر پشت کف/سقف اردر بلاک با حاشیه امن ATR',
    ],
    minimumRR: 2.0,
  },
  {
    id: 'EQUILIBRIUM_DISCOUNT',
    nameEn: 'Equilibrium 50% Retracement',
    nameFa: 'سبک بازگشت به تعادل در ناحیه تخفیف/پرمیوم',
    badgeFa: 'سبک بازگشت به میانگین',
    descriptionFa: 'اندازه‌گیری طول موج تکانه‌ای و ورود لیمیت در زیر سطح ۵۰٪ برای خرید (تخفیف) یا بالای ۵۰٪ برای فروش (پرمیوم).',
    coreRulesFa: [
      'تشکیل لگ حرکتی پرشتاب و خروج از رنج تعادل قبلی',
      'محاسبه تراز ۵۰٪ گستره قیمتی (Equilibrium Price)',
      'ورود فقط در ناحیه Discount برای BUY و ناحیه Premium برای SELL',
      'پرهیز از ورود در زمان انتشار اخبار پرنوسان اقتصادی',
    ],
    minimumRR: 2.2,
  },
];

export type AgentRole = 'SCANNER' | 'ANALYST' | 'CRITIC' | 'JUDGE';

export interface AgentInfo {
  role: AgentRole;
  nameEn: string;
  nameFa: string;
  missionFa: string;
  decisionOutputsFa: string;
}

export const AGENT_ROLES_INFO: Record<AgentRole, AgentInfo> = {
  SCANNER: {
    role: 'SCANNER',
    nameEn: 'Market Structure & Setup Scanner',
    nameFa: 'ایجنت ۱: اسکنر ساختار و ستاپ‌یاب',
    missionFa: 'پایش پیوسته کندل‌به‌کندل، کشف سوییپ نقدینگی، FVG، اردر بلاک و تولید کاندیدای ورود هندسی.',
    decisionOutputsFa: 'کشف ستاپ و تعیین قیمت لیمیت و حد ضرر اولیه',
  },
  ANALYST: {
    role: 'ANALYST',
    nameEn: 'Context & Trend Analyst Agent',
    nameFa: 'ایجنت ۲: تحلیل‌گر بستر و جهت روند',
    missionFa: 'بررسی هم‌راستایی روند تایم بالاتر (4H/1H)، سنجش مومنتوم، ارزیابی عدم قطعیت و صدور رأی تایید با درصد اطمینان.',
    decisionOutputsFa: 'تایید ورود (TRADE) یا رد (NO_TRADE) با درصد اطمینان',
  },
  CRITIC: {
    role: 'CRITIC',
    nameEn: 'Adversarial Risk Critic (Devil\'s Advocate)',
    nameFa: 'ایجنت ۳: منتقد سخت‌گیر ریسک و تضادها',
    missionFa: 'جستجوی فعالانه برای بهانه‌ها و سناریوهای ابطال معامله، تست استرس R:R، بررسی تضادهای نقدینگی و ریسک فومو.',
    decisionOutputsFa: 'صحت‌سنجی تایید (CONFIRMED) یا رد بدبینانه (REJECTED)',
  },
  JUDGE: {
    role: 'JUDGE',
    nameEn: 'Executive Judge & Risk Guardian',
    nameFa: 'ایجنت ۴: داور نهایی و دیده‌بان ریسک',
    missionFa: 'داوری نهایی با اصل شکست امن (Fail-Closed؛ هرگونه اختلاف = عدم ورود)، اعمال سقف ریسک ۰.۲۵٪ و صدور قصد سفارش.',
    decisionOutputsFa: 'صدور مجوز سفارش لیمیت نهایی یا توقف کامل معامله',
  },
};

export interface AgentEngineOption {
  id: string;
  role: AgentRole;
  name: string;
  nameFa: string;
  type: 'DETERMINISTIC' | 'NEURAL_WEBGPU';
  latencyMs: number;
  descriptionFa: string;
}

export const AGENT_ENGINE_OPTIONS: AgentEngineOption[] = [
  // گزینه‌های ایجنت ۱: اسکنر ساختار
  {
    id: 's0-deterministic-scanner',
    role: 'SCANNER',
    name: 'S0 Pure Deterministic Scanner',
    nameFa: 'موتور محاسباتی قطعی S0 (سریع و آفلاین)',
    type: 'DETERMINISTIC',
    latencyMs: 1,
    descriptionFa: 'پایش فوری سوییپ نقدینگی، FVG و سووینگ‌های قیمتی بر پایه فرمول ریاضی قطعی بدون بار گرافیکی.',
  },
  {
    id: 'multi-session-sweep-scanner',
    role: 'SCANNER',
    name: 'Multi-Session Sweep Scanner',
    nameFa: 'اسکنر سوییپ سشن‌های آسیا و لندن',
    type: 'DETERMINISTIC',
    latencyMs: 2,
    descriptionFa: 'تطبیق هم‌زمان شکست سقف/کف سشن‌های مختلف همراه با فیلتر حداقل نفوذ ۱ پیپ.',
  },
  {
    id: 'bos-structure-scanner',
    role: 'SCANNER',
    name: 'BOS & MSS Structure Scanner',
    nameFa: 'اسکنر شکست ساختار و تغییر کاراکتر بازار',
    type: 'DETERMINISTIC',
    latencyMs: 2,
    descriptionFa: 'شناسایی شکست آخرین سووینگ معتبر و تشکیل اردر بلاک‌های دست‌نخورده.',
  },

  // گزینه‌های ایجنت ۲: تحلیل‌گر بستر
  {
    id: 's0-rule-analyst',
    role: 'ANALYST',
    name: 'S0 Rule-Based Analyst',
    nameFa: 'تحلیل‌گر الگوریتمی قطعی S0 (سبک و آنی)',
    type: 'DETERMINISTIC',
    latencyMs: 2,
    descriptionFa: 'اعتبارسنجی قطعی شواهد نقدینگی و هم‌راستایی مومنتوم بدون مصرف رم یا گرافیک.',
  },
  {
    id: 'qwen3.5-0.8b-analyst',
    role: 'ANALYST',
    name: 'Qwen3.5-0.8B WebLLM Analyst',
    nameFa: 'تحلیل‌گر عصبی Qwen3.5-0.8B (آزمون سریع WebGPU)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 15,
    descriptionFa: 'استنتاج عصبی سبک در مرورگر برای خلاصه شواهد ساختار بازار.',
  },
  {
    id: 'qwen3.5-2b-analyst',
    role: 'ANALYST',
    name: 'Qwen3.5-2B Balanced Analyst',
    nameFa: 'تحلیل‌گر عصبی Qwen3.5-2B (ویژه موبایل Pixel Fold)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 28,
    descriptionFa: 'تعادل ایده‌آل سرعت و هوش استدلال برای درک سطوح نقدینگی و سناریوهای قیمت.',
  },
  {
    id: 'qwen3.5-4b-analyst',
    role: 'ANALYST',
    name: 'Qwen3.5-4B Desktop Analyst',
    nameFa: 'تحلیل‌گر عصبی عمیق Qwen3.5-4B (دسکتاپ و Snapdragon)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 45,
    descriptionFa: 'بالاترین کیفیت استدلال و ارزیابی چندلایه بستر بازار با دقت زنجیره افکار.',
  },
  {
    id: 'qwen3-1.7b-analyst',
    role: 'ANALYST',
    name: 'Qwen3-1.7B Stable Analyst',
    nameFa: 'تحلیل‌گر عصبی پایدار Qwen3-1.7B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 22,
    descriptionFa: 'آرتیفکت پایدار و تست‌شده در مرورگر با سازگاری گسترده با درایورها.',
  },
  {
    id: 'gemma-4-e2b-analyst',
    role: 'ANALYST',
    name: 'Gemma 4 E2B Web Analyst',
    nameFa: 'تحلیل‌گر پژوهشی گوگل Gemma 4 E2B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 38,
    descriptionFa: 'مدل تحقیقاتی گوگل برای ارزیابی بنچمارک مقایسه‌ای استدلال بازار.',
  },

  // گزینه‌های ایجنت ۳: منتقد سخت‌گیر
  {
    id: 'deep-critic-strict',
    role: 'CRITIC',
    name: 'Deep Liquidity & Risk Critic',
    nameFa: 'منتقد سخت‌گیر نقدینگی قطعی (پیش‌فرض سیستم)',
    type: 'DETERMINISTIC',
    latencyMs: 3,
    descriptionFa: 'غربالگری بدبینانه ستاپ‌ها، رد معاملات با نسبت R:R زیر ۲٫۵ یا شواهد کمتر از ۲ فاکتور.',
  },
  {
    id: 'qwen3.5-4b-critic',
    role: 'CRITIC',
    name: 'Qwen3.5-4B Adversarial Critic',
    nameFa: 'منتقد عصبی بدبین Qwen3.5-4B (وکیل مدافع شیطان)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 48,
    descriptionFa: 'جستجوی فعالانه عیوب و سناریوهای نقض ستاپ با استنتاج چندوجهی در مرورگر.',
  },
  {
    id: 'qwen3.5-2b-critic',
    role: 'CRITIC',
    name: 'Qwen3.5-2B Risk Critic',
    nameFa: 'منتقد عصبی متعادل Qwen3.5-2B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 30,
    descriptionFa: 'نقد هوشمند با تأکید بر موانع احتمالی و اسلیپیج نقدینگی.',
  },
  {
    id: 'gemma-4-e2b-critic',
    role: 'CRITIC',
    name: 'Gemma 4 E2B Critic',
    nameFa: 'منتقد عصبی پژوهشی Gemma 4 E2B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 40,
    descriptionFa: 'ارزیابی سخت‌گیرانه ستاپ‌ها در قالب پرامپت استرس و تناقض‌یاب.',
  },

  // گزینه‌های ایجنت ۴: داور نهایی و دیده‌بان ریسک
  {
    id: 'strict-consensus-fail-closed',
    role: 'JUDGE',
    name: 'Strict Consensus Fail-Closed Judge',
    nameFa: 'داور قطعی اجماع کامل و شکست امن (Fail-Closed)',
    type: 'DETERMINISTIC',
    latencyMs: 1,
    descriptionFa: 'در صورت کوچک‌ترین تضاد بین تحلیل‌گر و منتقد، فوراً وضعیت NO_TRADE اعلام می‌کند (بدون استثنا).',
  },
  {
    id: 'risk-guardian-w4-judge',
    role: 'JUDGE',
    name: 'Risk Guardian W4 Executive Judge',
    nameFa: 'داور یکپارچه با محافظ ریسک حساب W4',
    type: 'DETERMINISTIC',
    latencyMs: 2,
    descriptionFa: 'انطباق هم‌زمان نظر ایجنت‌ها با سقف ریسک ۰.۲۵٪، سقف دروداون روزانه ۱.۵٪ و کلیدهای قطع نوسان.',
  },
  {
    id: 'weighted-bayesian-judge',
    role: 'JUDGE',
    name: 'Weighted Ensemble Judge',
    nameFa: 'داور وزنی تلفیقی (Weighted Ensemble)',
    type: 'DETERMINISTIC',
    latencyMs: 3,
    descriptionFa: 'محاسبه میانگین وزنی درصد اطمینان تحلیل‌گر و منتقد با آستانه حداقل ۸۵٪ جهت صدور مجوز ورود.',
  },
];

export interface MultiAgentConfiguration {
  activeTradingStyle: TradingStyleId;
  scannerEngineId: string;
  analystEngineId: string;
  criticEngineId: string;
  judgeEngineId: string;
}

export const DEFAULT_MULTI_AGENT_CONFIG: MultiAgentConfiguration = {
  activeTradingStyle: 'S0_SWEEP_FVG',
  scannerEngineId: 's0-deterministic-scanner',
  analystEngineId: 's0-rule-analyst',
  criticEngineId: 'deep-critic-strict',
  judgeEngineId: 'strict-consensus-fail-closed',
};

export interface AgentReviewResult {
  agentRole: AgentRole;
  roleTitleFa: string;
  engineId: string;
  engineNameFa: string;
  engineType: 'DETERMINISTIC' | 'NEURAL_WEBGPU';
  verdict: 'APPROVED' | 'REJECTED' | 'NEUTRAL';
  verdictTitleFa: string;
  confidence: number; // بین ۰ تا ۱
  tradingStyleUsed: TradingStyleId;
  summaryFa: string;
  reasoningBulletsFa: string[];
  timestamp: number;
  latencyMs: number;
}

export interface MultiAgentPipelineResult {
  tradingStyle: TradingStyleId;
  tradingStyleInfo: TradingStyleInfo;
  isApprovedForTrading: boolean;
  failClosedTriggered: boolean;
  scannerReview: AgentReviewResult;
  analystReview: AgentReviewResult;
  criticReview: AgentReviewResult;
  judgeReview: AgentReviewResult;
  finalRecommendationFa: string;
  overallConfidence: number;
  timestamp: number;
}
