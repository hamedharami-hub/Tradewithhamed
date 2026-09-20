// lib/contracts/multi-agent-system.ts
// قراردادهای رسمی سیستم ۴ ایجنتی چندمدلی و سبک‌های معاملاتی
// بر اساس اصول متریال ۳، معماری کامپوننت‌های تفکیک‌شده و اجرای محلی قابل راستی‌آزمایی

export type TradingStyleId =
  | 'S0_SWEEP_FVG'         // سبک اصلی S0: سوییپ نقدینگی سشن‌ها + FVG + ورود لیمیت در ۵ دقیقه
  | 'BOS_ORDER_BLOCK'      // سبک شکست ساختار: ورود در اردر بلاک هم‌جهت با روند ماژور (ICT / SMC)
  | 'SCALP_M1_M5'          // سبک اسکلپینگ سریع ۱ و ۵ دقیقه با خروج‌های چابک و شکار نقدینگی موضعی
  | 'SWING_MACRO'          // سبک سوئینگ روندی کلان ۴ ساعته و روزانه با اهداف چندروزه
  | 'EQUILIBRIUM_DISCOUNT' // سبک بازگشت به تعادل: خرید در ناحیه تخفیف ۵۰٪ (Discount/Premium)
  | 'TREND_BREAKOUT'       // سبک شکست کانال روندی و خروج پرقدرت از فاز فشردگی
  | 'M1_SCALP'             // نام مستعار اسکلپ ۱ دقیقه برای سازگاری
  | 'SESSION_SWING';       // نام مستعار سوئینگ برای سازگاری

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
    id: 'SCALP_M1_M5',
    nameEn: 'M1/M5 Ultra-Fast Momentum Scalp',
    nameFa: 'سبک اسکلپینگ سریع ۱ و ۵ دقیقه (Fast Scalp)',
    badgeFa: 'اسکلپ سریع (۱M / ۵M)',
    descriptionFa: 'شکار مومنتوم ناگهانی، سوییپ‌های ریزساختار محلی در تایم‌های ۱ و ۵ دقیقه با ورود لحظه‌ای و خروج‌های نقطه‌ای چابک.',
    coreRulesFa: [
      'سوییپ نقدینگی میکروکف یا میکروسقف در تایم‌فریم ۱ یا ۵ دقیقه',
      'تاییدیه بازگشت مومنتوم و بسته شدن کندل در جهت معامله',
      'خروج سریع در اولین سطح نقدینگی مقابل (حداکثر ماندگاری ۱۵ تا ۲۰ دقیقه)',
      'حد ضرر بسیار فشرده با حاشیه امن ATR موضعی و خروج فوری در صورت برگشت',
    ],
    minimumRR: 1.5,
  },
  {
    id: 'SWING_MACRO',
    nameEn: 'Macro Higher-Timeframe Trend Swing',
    nameFa: 'سبک سوئینگ روندی کلان (H4 / D1 Macro Swing)',
    badgeFa: 'سوئینگ کلان چندروزه',
    descriptionFa: 'موقعیت‌گیری هم‌راستا با امواج ماژور ۴ ساعته و روزانه، سوار شدن بر روندهای بزرگ بنیادی و اهداف چندروزه نقدینگی.',
    coreRulesFa: [
      'تثبیت و هم‌راستایی ساختار ماژور در تایم‌فریم‌های ۴ ساعته و روزانه (H4 / D1)',
      'فیلتر کردن نویزهای مقطعی و سوییپ‌های جعلی تایم‌فریم‌های درون‌روزی',
      'تارگت‌گذاری روی سقف‌ها و کف‌های ساختاری چندروزه با پتانسیل سودآوری بالا',
      'مدیریت حجم تطبیقی متناسب با دامنه گسترده حد ضرر ماژور (حداقل R:R ۱ به ۳٫۰)',
    ],
    minimumRR: 3.0,
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
  {
    id: 'TREND_BREAKOUT',
    nameEn: 'Regime-Filtered Trend Breakout',
    nameFa: 'سبک شکست کانال و خروج از فشردگی (Breakout)',
    badgeFa: 'شکست پرقدرت روند',
    descriptionFa: 'تشخیص شکست کانال‌های نوسانی ۵۵ دوره‌ای در جهت شیب میانگین متحرک ۲۰۰ (EMA200) با تاییدیه رژیم بازار.',
    coreRulesFa: [
      'کلوز کندل فراتر از سقف یا کف کانال ۵۵ دوره‌ای بدون نگاه به آینده',
      'هم‌جهتی کامل با شیب میانگین متحرک نمایی ۲۰۰ (EMA200)',
      'تایید رژیم بازار در فاز روند پرشتاب یا خروج از فشردگی (Compression)',
      'حد ضرر ۲ برابر ATR و تارگت سود ۴ برابر ATR با نسبت ۱ به ۲٫۰',
    ],
    minimumRR: 2.0,
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
    missionFa: 'بررسی هم‌راستایی روند در تایم‌فریم ساختار کلان (HTF متناسب با تایم معامله: M15/H1/H4)، سنجش مومنتوم، ارزیابی عدم قطعیت و صدور رأی تایید با درصد اطمینان.',
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
  // ==========================================
  // گزینه‌های ایجنت ۱: اسکنر ساختار (SCANNER)
  // ==========================================
  {
    id: 's0-deterministic-scanner',
    role: 'SCANNER',
    name: 'S0 Pure Deterministic Scanner',
    nameFa: 'موتور محاسباتی قطعی S0 (سریع و آفلاین - ۰MB)',
    type: 'DETERMINISTIC',
    latencyMs: 1,
    descriptionFa: 'پایش فوری سوییپ نقدینگی، FVG و سووینگ‌های قیمتی بر پایه فرمول ریاضی قطعی بدون بار گرافیکی.',
  },
  {
    id: 'multi-session-sweep-scanner',
    role: 'SCANNER',
    name: 'Multi-Session Sweep Scanner',
    nameFa: 'اسکنر سوییپ سشن‌های آسیا و لندن (قطعی)',
    type: 'DETERMINISTIC',
    latencyMs: 2,
    descriptionFa: 'تطبیق هم‌زمان شکست سقف/کف سشن‌های مختلف همراه با فیلتر حداقل نفوذ ۱ پیپ.',
  },
  {
    id: 'bos-structure-scanner',
    role: 'SCANNER',
    name: 'BOS & MSS Structure Scanner',
    nameFa: 'اسکنر شکست ساختار و تغییر کاراکتر بازار (قطعی)',
    type: 'DETERMINISTIC',
    latencyMs: 2,
    descriptionFa: 'شناسایی شکست آخرین سووینگ معتبر و تشکیل اردر بلاک‌های دست‌نخورده.',
  },
  {
    id: 'llama-3.2-3b-scanner',
    role: 'SCANNER',
    name: 'Meta Llama-3.2-3B Neural Scanner',
    nameFa: 'اسکنر عصبی فوق‌سریع Meta Llama-3.2-3B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 18,
    descriptionFa: 'پایش بلادرنگ کندل‌ها با سرعت بالا و مصرف حداقل توان پردازشی روی موبایل، تبلت و پی‌سی.',
  },
  {
    id: 'smollm2-360m-scanner',
    role: 'SCANNER',
    name: 'SmolLM2-360M Ultra-Fast Scanner',
    nameFa: 'اسکنر فوق‌سبک SmolLM2-360M (۲۲۰MB)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 10,
    descriptionFa: 'سریع‌ترین و کم‌حجم‌ترین مدل عصبی برای استنتاج بلادرنگ هندسه کندل‌ها.',
  },
  {
    id: 'qwen3.5-0.8b-scanner',
    role: 'SCANNER',
    name: 'Qwen3.5-0.8B Compact Scanner',
    nameFa: 'اسکنر سبک و اقتصادی Qwen3.5-0.8B (۵۴۰MB)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 15,
    descriptionFa: 'مدل عصبی بهینه برای اسکن پیوسته چارت و تفکیک الگوهای FVG با مصرف باتری حداقلی.',
  },
  {
    id: 'qwen3.5-2b-scanner',
    role: 'SCANNER',
    name: 'Qwen3.5-2B Mobile Scanner',
    nameFa: 'اسکنر متعادل Qwen3.5-2B (موبایل و تبلت)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 25,
    descriptionFa: 'تعادل ایده‌آل سرعت و دقت هندسی برای تشخیص سوییپ‌ها و سووینگ‌های نقدینگی.',
  },

  // ==========================================
  // گزینه‌های ایجنت ۲: تحلیل‌گر بستر (ANALYST)
  // ==========================================
  {
    id: 's0-rule-analyst',
    role: 'ANALYST',
    name: 'S0 Rule-Based Analyst',
    nameFa: 'تحلیل‌گر الگوریتمی قطعی S0 (سبک و آنی - ۰MB)',
    type: 'DETERMINISTIC',
    latencyMs: 2,
    descriptionFa: 'اعتبارسنجی قطعی شواهد نقدینگی و هم‌راستایی مومنتوم بدون مصرف رم یا گرافیک.',
  },
  {
    id: 'gemma-4-e4b-analyst',
    role: 'ANALYST',
    name: 'Google Gemma 4 E4B LiteRT Analyst',
    nameFa: 'تحلیل‌گر نسل جدید گوگل Gemma 4 (LiteRT/WebGPU)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 25,
    descriptionFa: 'مدل بومی نسل چهارم گوگل با معماری بهینه LiteRT و درک عمیق ساختار بازار و نقدینگی.',
  },
  {
    id: 'phi-4-mini-analyst',
    role: 'ANALYST',
    name: 'Microsoft Phi-4-mini Dense Analyst',
    nameFa: 'تحلیل‌گر فوق‌فشرده Microsoft Phi-4-mini (چگالی استدلال ۳.۸B)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 24,
    descriptionFa: 'بالاترین نسبت بهره‌وری استدلال به حجم (۳.۸ میلیارد پارامتر) با توانایی تحلیل ساختار و زمینه ماکرو.',
  },
  {
    id: 'deepseek-r1-7b-analyst',
    role: 'ANALYST',
    name: 'DeepSeek-R1 7B Context Analyst',
    nameFa: 'تحلیل‌گر با تفکر عمیق DeepSeek-R1 7B CoT',
    type: 'NEURAL_WEBGPU',
    latencyMs: 42,
    descriptionFa: 'تحلیل گام‌به‌گام مومنتوم و بستر کلان با استدلال باز <think> و شبیه‌سازی جریان سفارشات نهادی.',
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
    id: 'qwen2.5-7b-analyst',
    role: 'ANALYST',
    name: 'Qwen2.5-7B Instruct Analyst',
    nameFa: 'تحلیل‌گر جامع و چندزبانه Qwen2.5-7B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 40,
    descriptionFa: 'تحلیل عمیق شواهد نقدینگی چندساعته با درک قدرتمند ساختار بازار و متن فارسی.',
  },
  {
    id: 'llama-3.2-3b-analyst',
    role: 'ANALYST',
    name: 'Meta Llama-3.2-3B Rapid Analyst',
    nameFa: 'تحلیل‌گر سریع Meta Llama-3.2-3B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 20,
    descriptionFa: 'ارزیابی سریع جهت و مومنتوم با کمترین مصرف باتری و رم روی انواع دستگاه‌ها.',
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
    id: 'qwen3.5-0.8b-analyst',
    role: 'ANALYST',
    name: 'Qwen3.5-0.8B WebLLM Analyst',
    nameFa: 'تحلیل‌گر عصبی سبک Qwen3.5-0.8B (۵۴۰MB)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 15,
    descriptionFa: 'استنتاج عصبی سبک در مرورگر برای خلاصه شواهد ساختار بازار.',
  },
  {
    id: 'qwen3-1.7b-analyst',
    role: 'ANALYST',
    name: 'Qwen3-1.7B Stable Analyst',
    nameFa: 'تحلیل‌گر عصبی پایدار Qwen3-1.7B (سازگار)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 22,
    descriptionFa: 'آرتیفکت پایدار و تست‌شده در مرورگر با سازگاری گسترده با درایورها.',
  },
  {
    id: 'smollm2-360m-analyst',
    role: 'ANALYST',
    name: 'SmolLM2-360M WebGPU Probe Analyst',
    nameFa: 'تحلیل‌گر فوق‌سبک SmolLM2-360M (۲۲۰MB)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 10,
    descriptionFa: 'مدل سبک برای تست سلامت WebGPU و ارزیابی سریع بستر با حداقل بار.',
  },

  // ==========================================
  // گزینه‌های ایجنت ۳: منتقد سخت‌گیر (CRITIC)
  // ==========================================
  {
    id: 'deep-critic-strict',
    role: 'CRITIC',
    name: 'Deep Liquidity & Risk Critic',
    nameFa: 'منتقد سخت‌گیر نقدینگی قطعی S0 (محاسباتی تنها - پیش‌فرض)',
    type: 'DETERMINISTIC',
    latencyMs: 3,
    descriptionFa: 'غربالگری صرفاً ریاضی و بدون مصرف گرافیک؛ رد معاملات با R:R زیر حد مجاز و سدهای نقدینگی.',
  },
  {
    id: 'deepseek-r1-7b-critic',
    role: 'CRITIC',
    name: 'DeepSeek-R1 Distill 7B CoT Trap Critic',
    nameFa: '🛡️ سپر دوگانه: منتقد قطعی S0 + تفکر عمیق DeepSeek-R1 7B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 42,
    descriptionFa: 'اجرای هم‌زمان فیلترهای قطعی ریاضی در لایه اول + تفکر عمیق <think> برای کشف تله‌های استاپ‌هانتینگ در لایه دوم.',
  },
  {
    id: 'phi-4-mini-critic',
    role: 'CRITIC',
    name: 'Microsoft Phi-4-mini Adversarial Critic',
    nameFa: '🛡️ سپر دوگانه: منتقد قطعی S0 + وکیل مدافع شیطان Phi-4-mini',
    type: 'NEURAL_WEBGPU',
    latencyMs: 26,
    descriptionFa: 'حفاظت ریاضی قطعی همراه با مدل فشرده و متراکم مایکروسافت برای کشف فعال تناقضات ستاپ و نسبت سود به زیان.',
  },
  {
    id: 'qwen3.5-4b-critic',
    role: 'CRITIC',
    name: 'Qwen3.5-4B Adversarial Critic',
    nameFa: '🛡️ سپر دوگانه: منتقد قطعی S0 + نقد عصبی بدبین Qwen3.5-4B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 48,
    descriptionFa: 'پایش خط‌به‌خط ریسک با تلفیق فرمول S0 و استنتاج عصبی عمیق علی‌بابا برای بررسی سناریوهای نقض ستاپ.',
  },
  {
    id: 'gemma-4-e4b-critic',
    role: 'CRITIC',
    name: 'Google Gemma 4 E4B LiteRT Critic',
    nameFa: '🛡️ سپر دوگانه: منتقد قطعی S0 + گوگل Gemma 4 (LiteRT)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 25,
    descriptionFa: 'حفاظت قطعی ریاضی S0 همراه با استدلال نسل چهارم گوگل Gemma 4 برای نقد سخت‌گیرانه و کشف تله‌های نقدینگی.',
  },
  {
    id: 'llama-3.2-3b-critic',
    role: 'CRITIC',
    name: 'Meta Llama-3.2-3B Rapid Risk Critic',
    nameFa: '🛡️ سپر دوگانه: منتقد قطعی S0 + متا لاما ۳.۲ (۳B فوق‌سریع)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 18,
    descriptionFa: 'غربالگری قطعی ریاضی همراه با پایش فوق‌سریع تله‌های بازار و مهار فومو توسط مدل سبک و کم‌مصرف متا.',
  },
  {
    id: 'qwen2.5-7b-critic',
    role: 'CRITIC',
    name: 'Qwen2.5-7B Comprehensive Risk Critic',
    nameFa: '🛡️ سپر دوگانه: منتقد قطعی S0 + منتقد جامع Qwen2.5-7B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 40,
    descriptionFa: 'تلفیق فرمول‌های ریاضی با تحلیل عمیق و چندزبانه نقدینگی و نگارش گزارش تفصیلی عدم قطعیت.',
  },
  {
    id: 'qwen3.5-2b-critic',
    role: 'CRITIC',
    name: 'Qwen3.5-2B Balanced Risk Critic',
    nameFa: '🛡️ سپر دوگانه: منتقد قطعی S0 + منتقد متعادل Qwen3.5-2B',
    type: 'NEURAL_WEBGPU',
    latencyMs: 28,
    descriptionFa: 'حفاظت ریاضی S0 به همراه ارزیابی ریسک بهینه روی تبلت و موبایل با حافظه مصرفی کم.',
  },
  {
    id: 'qwen3.5-0.8b-critic',
    role: 'CRITIC',
    name: 'Qwen3.5-0.8B Lightweight Critic',
    nameFa: '🛡️ سپر دوگانه: منتقد قطعی S0 + منتقد سبک Qwen3.5-0.8B (۵۴۰MB)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 15,
    descriptionFa: 'سپر ریاضی S0 همراه با استنتاج بدبینانه سبک با حجم دانلود کم و اجرای سریع.',
  },
  {
    id: 'smollm2-360m-critic',
    role: 'CRITIC',
    name: 'SmolLM2-360M Ultra-Light Critic',
    nameFa: '🛡️ سپر دوگانه: منتقد قطعی S0 + منتقد سریع SmolLM2-360M (۲۲۰MB)',
    type: 'NEURAL_WEBGPU',
    latencyMs: 10,
    descriptionFa: 'سپر ریاضی همراه با سبک‌ترین مدل عصبی برای غربالگری فوری خطرات آشکار.',
  },

  // ==========================================
  // گزینه‌های ایجنت ۴: داور نهایی (JUDGE)
  // ==========================================
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
    id: 'alpha-consensus-quorum-judge',
    role: 'JUDGE',
    name: 'Alpha Consensus Quorum Council Judge',
    nameFa: 'داور شورای عالی آلفا با حدنصاب رأی‌گیری (Quorum 75%+)',
    type: 'DETERMINISTIC',
    latencyMs: 2,
    descriptionFa: 'ماتریس اجماع کواروم با ارزیابی وزنی ۴ ایجنت؛ رد خودکار در صورت وتوی منتقد نقدینگی.',
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
  requestedEngineId: string;
  executedEngineId: string;
  executionMode: 'DETERMINISTIC_RULES' | 'NEURAL_INFERENCE' | 'NOT_EXECUTED' | 'ERROR';
  executionStatusFa: string;
  isFallback: boolean;
  fallbackReasonFa?: string;
  environment: string;
  dataProvenance: string;
  isAdvisoryOnly: boolean;
  advisoryDisclaimerFa: string;
  verdict: 'APPROVED' | 'REJECTED' | 'NEUTRAL';
  verdictTitleFa: string;
  confidence: number; // بین ۰ تا ۱ (امتیاز انطباق با قوانین استراتژی، نه احتمال برد)
  tradingStyleUsed: TradingStyleId;
  summaryFa: string;
  reasoningBulletsFa: string[];
  timestamp: number;
  latencyMs: number;
}

export interface CouncilConsensusReport {
  alphaConsensusScore: number; // بین ۰ تا ۱۰۰
  quorumReached: boolean;
  vetoTriggered: boolean;
  vetoReasonFa?: string;
  votes: {
    approved: number;
    rejected: number;
    neutral: number;
  };
  agentWeights: Record<AgentRole, number>;
  verdictPersian: string;
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
  councilConsensus?: CouncilConsensusReport;
}
