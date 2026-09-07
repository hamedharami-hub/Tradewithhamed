// lib/contracts/monte-carlo.ts
// قراردادهای رسمی موتور شبیه‌سازی ۱۰۰۰ مسیره مونت‌کارلو و همگام‌سازی چندتایم‌فریمه
// پیاده‌سازی ۱۰۰٪ آفلاین، محاسباتی قطعی و منطبق بر مدیریت ریسک سرمایه W4

export interface MonteCarloSimulationConfig {
  iterations: number;          // تعداد مسیرهای شبیه‌سازی (پیش‌فرض: ۱۰۰۰ مسیر)
  steps: number;               // افق پیش‌بینی گام‌های زمانی (مثلاً ۵۰ کندل)
  initialPrice: number;        // قیمت فعلی ورود
  targetPrice: number;         // قیمت حد سود (Take Profit)
  stopLossPrice: number;       // قیمت حد ضرر (Stop Loss)
  annualizedVolatility: number;// نوسان‌پذیری تاریخی سالانه یا روزانه (Sigma)
  drift: number;               // رانش و روند جهت‌دار تخمینی (Mu)
  seed?: number;               // بذر تصادفی برای تکرارپذیری آزمون‌ها
}

export interface PercentileStepPoint {
  step: number;
  p5: number;   // صدک ۵ (بدترین حالت بدبینانه ۹۵٪)
  p25: number;  // چارک اول
  p50: number;  // میانه (محتمل‌ترین مسیر)
  p75: number;  // چارک سوم
  p95: number;  // صدک ۹۵ (بهترین حالت خوش‌بینانه)
}

export interface MonteCarloSimulationResult {
  config: MonteCarloSimulationConfig;
  probabilityOfProfit: number;       // احتمال لمس حد سود قبل از حد ضرر (درصد ۰ تا ۱۰۰)
  probabilityOfStopLoss: number;     // احتمال لمس حد ضرر قبل از حد سود (درصد ۰ تا ۱۰۰)
  expectedMaxDrawdownPercent: number;// حداکثر افت سرمایه مورد انتظار در طول مسیرها (درصد)
  riskOfRuin: number;                // احتمال نابودی سرمایه بر مبنای استاپ یا افت فراتر از ۵٪
  medianFinalPrice: number;          // میانه قیمت پایانی در پایان گام‌ها
  var95Percent: number;              // ارزش در معرض ریسک در سطح اطمینان ۹۵٪ (Value-at-Risk)
  cvar95Percent: number;             // ارزش در معرض ریسک شرطی (CVaR / Expected Shortfall)
  percentileCone: PercentileStepPoint[]; // مخروط صدک‌های پنج‌گانه برای ترسیم گرافیکی
  totalPaths: number;
  tpFirstCount: number;
  slFirstCount: number;
  neitherCount: number;
  persianRiskAssessment: string;
  isTradeViable: boolean;            // آیا بر اساس شاخص‌های مونت‌کارلو ورود توجیه‌پذیر است؟
}

export interface MultiTimeframeLevel {
  id: string;
  labelFa: string;
  labelEn: string;
  price: number;
  timeframe: 'H4' | 'H1' | 'M15' | 'M5';
  type: 'PDH' | 'PDL' | 'ASIA_HIGH' | 'ASIA_LOW' | 'LONDON_HIGH' | 'LONDON_LOW' | 'FVG_TOP' | 'FVG_BOTTOM' | 'EQUILIBRIUM';
  color: string;
}

export interface MultiTimeframeSyncState {
  macroTimeframe: 'H1' | 'H4';
  microTimeframe: 'M5' | 'M1';
  crosshairPrice: number | null;
  crosshairTimestamp: number | null;
  sharedLevels: MultiTimeframeLevel[];
  isCrosshairSynced: boolean;
}
