// lib/core/s0-knowledge-base.ts
// پایگاه دانش جامع قوانین استراتژی S0 و درس‌های آموخته ژورنال معاملاتی حامد
// نسخه ۴.۰ - پردازش ۱۰۰٪ محلی در مرورگر (بدون وابستگی به هیچ API ابری)

export type S0KnowledgeCategory = 
  | 'CORE_RULE'       // قوانین اصلی استراتژی S0
  | 'SETUP_MODEL'     // الگوهای ورود و خروج
  | 'RISK_POLICY'     // سیاست‌های صلب ریسک و سبد
  | 'JOURNAL_LESSON'  // درس‌های ثبت‌شده در ژورنال از خطاهای واقعی
  | 'PSYCHOLOGY';     // انضباط روانی، دوری از FOMO و انتقام

export interface S0KnowledgeChunk {
  id: string;
  titleFa: string;
  titleEn: string;
  category: S0KnowledgeCategory;
  tags: string[];
  contentFa: string;
  contentEn: string;
  invalidationTriggers: string[];
  executionChecklist: string[];
  weight: number;
}

export const S0_KNOWLEDGE_BASE: S0KnowledgeChunk[] = [
  {
    id: 'S0-RULE-01',
    titleFa: 'قاعده ۱: جهت ساختار کلان و هم‌راستایی در تایم‌فریم‌های ۴ساعته و ۱ساعته',
    titleEn: 'Rule 1: Macro Structure & H4/H1 Timeframe Alignment',
    category: 'CORE_RULE',
    tags: ['ساختار', 'H4', 'H1', 'روند', 'مولتی تایم فریم', 'trend', 'structure', 'htf'],
    contentFa: 'هیچ معامله‌ای نباید خلاف جریان نقدینگی و ساختار اصلی تایم‌فریم ۴ ساعته (H4) و ۱ ساعته (H1) باز شود. معامله‌گر ابتدا باید سقف‌ها و کف‌های معتبر ساختاری (Swing High/Low) را مشخص کرده و مشخص کند آیا بازار در فاز انبساط (Expansion) است یا اصلاح عمیق (Retracement). ورود فقط در جهت چرخش کلان مجاز است.',
    contentEn: 'No position may be opened against the macro liquidity flow and primary market structure of H4 and H1 timeframes. The trader must map major swing highs/lows and determine whether the market is expanding or retracing.',
    invalidationTriggers: [
      'شکست معتبر آخرین کف یا سقف ساختاری H4 در خلاف جهت معامله',
      'بسته شدن بدنه کندل ۴ ساعته زیر ناحیه تقاضای کلان'
    ],
    executionChecklist: [
      'بررسی روند کلی تایم‌فریم H4 (صعودی/نزولی)',
      'شناسایی آخرین تغییر ماهیت ساختار (CHoCH) در H1',
      'اطمینان از قرار نگرفتن در انتهای یک لگ طولانی بدون اصلاح'
    ],
    weight: 1.2
  },
  {
    id: 'S0-RULE-02',
    titleFa: 'قاعده ۲: پاکسازی نقدینگی و هانت استاپ‌ها (Liquidity Sweeps)',
    titleEn: 'Rule 2: Liquidity Sweeps & Stop Hunts',
    category: 'CORE_RULE',
    tags: ['سوییپ', 'نقدینگی', 'استاپ هانت', 'اس ال', 'sweep', 'liquidity', 'stop hunt', 'bsl', 'ssl'],
    contentFa: 'هر ورود معتبر در استراتژی S0 مشروط به وقوع سوییپ نقدینگی است. این سوییپ شامل جمع‌آوری استاپ‌های بالای سقف‌های برابر (EQH) یا زیر کف‌های برابر (EQL)، یا سوییپ سقف/کف سشن آسیا و روز قبل (PDH/PDL) می‌باشد. سوییپ باید با شدو (Wick) رخ دهد و قیمت سریعاً به داخل رنج بازگردد، نه اینکه با کندل مومنتوم تثبیت شود.',
    contentEn: 'Every valid S0 entry requires an unambiguous liquidity sweep. This includes sweeping Buy-side Liquidity (BSL) or Sell-side Liquidity (SSL) from Asian ranges or previous daily high/lows.',
    invalidationTriggers: [
      'عدم مشاهده شدوی نفوذی و پاکسازی سفارشات پشت سطوح کلیدی',
      'کلوز قطعی بدنه کندل پرقدرت بالای سطح نقدینگی (تثبیت به جای سوییپ)'
    ],
    executionChecklist: [
      'علامت‌گذاری سقف و کف روز قبل (PDH / PDL)',
      'مشاهده نفوذ قیمت با شدو و بازگشت سریع (Rejection Wick)',
      'ثبت شناسه سوییپ در اسنپ‌شات تحلیلی'
    ],
    weight: 1.5
  },
  {
    id: 'S0-RULE-03',
    titleFa: 'قاعده ۳: شکست ریزساختار و تغییر جهت روند در تایم‌فریم ورود (BOS & CHoCH)',
    titleEn: 'Rule 3: Break of Structure & Change of Character on Entry Timeframe',
    category: 'CORE_RULE',
    tags: ['شکست ساختار', 'چوچ', 'bos', 'choch', 'ریزساختار', 'تایم ورود', 'm5', 'm15'],
    contentFa: 'پس از وقوع سوییپ نقدینگی در تایم‌فریم بالا، باید در تایم‌فریم معاملاتی (M5 یا M15) یک شکست معتبر ریزساختار (BOS) یا تغییر ماهیت روند (CHoCH) به همراه بسته شدن بدنه کندل ثبت شود. این شکست نشان‌دهنده تغییر توازن قدرت میان خریداران و فروشندگان سازمانی است.',
    contentEn: 'Following a macro liquidity sweep, a valid Break of Structure (BOS) or Change of Character (CHoCH) with full candle body close must occur on the execution timeframe (M5/M15).',
    invalidationTriggers: [
      'نفوذ قیمت فقط با شدو بدون بسته شدن بدنه کندل زیر/بالای سطح ساختاری',
      'ادامه رنج زدن و ناتوانی در شکست آخرین سویینگ معتبر'
    ],
    executionChecklist: [
      'تعیین آخرین دره یا قله ایجادکننده سقف یا کف جدید',
      'تأیید کلوز بدنه کندل فراتر از سطح سویینگ در M5',
      'عدم شتاب‌زدگی پیش از بسته شدن کامل کندل شکست'
    ],
    weight: 1.3
  },
  {
    id: 'S0-RULE-04',
    titleFa: 'قاعده ۴: شناسایی شکاف ارزش منصفانه و عدم‌تعادل نقدینگی (FVG / Imbalance)',
    titleEn: 'Rule 4: Fair Value Gap & Imbalance Entry Zone',
    category: 'CORE_RULE',
    tags: ['شکاف قیمت', 'اف وی جی', 'fvg', 'imbalance', 'عدم تعادل', 'ارزش منصفانه'],
    contentFa: 'ناحیه عدم تعادل ۳ کندلی (Fair Value Gap) پس از شکست پرقدرت ساختار شکل می‌گیرد. محدوده ورود ایده‌آل در سطح تعادل ۵۰٪ (Equilibrium / Consequent Encroachment) این شکاف قرار دارد. اندازه FVG باید حداقل ۰.۳ برابر شاخص ATR14 نماد باشد تا نویز معاملاتی تلقی نگردد.',
    contentEn: 'A 3-candle Fair Value Gap (FVG) forms following displacement. The ideal entry zone is at the 50% Consequent Encroachment (C.E.) of the gap, with minimum size >= 0.3 * ATR14.',
    invalidationTriggers: [
      'پر شدن کامل (Mitigation) و بسته شدن قیمت پشت انتهای FVG',
      'اندازه شکاف کمتر از ۰.۳ ATR که به منزله نویز تصادفی است'
    ],
    executionChecklist: [
      'محاسبه فاصله بین سقف کندل ۱ و کف کندل ۳ در الگوی ۳ کندلی',
      'تعیین سطح ۵۰ درصد یا انتهای باز شکاف به عنوان تریگر لیمیت',
      'بررسی تازگی (Freshness) شکاف نقدینگی'
    ],
    weight: 1.4
  },
  {
    id: 'S0-RULE-05',
    titleFa: 'قاعده ۵: جابجایی تهاجمی قیمت و کندل‌های مومنتوم (Displacement)',
    titleEn: 'Rule 5: Price Displacement & Momentum Confirmation',
    category: 'CORE_RULE',
    tags: ['مومنتوم', 'جابجایی', 'displacement', 'کندل قدرت', 'اسپایک', 'حجم'],
    contentFa: 'حرکت قیمت پس از سوییپ باید با شتاب و جابجایی تهاجمی (Displacement) همراه باشد. کندل‌های کوچک و دارای شدوهای دوجانبه نشان‌دهنده فقدان مشارکت پول هوشمند است. کندل جابجایی باید بدنه بزرگ، شدوهای کوتاه و حجم معاملاتی بالاتر از میانگین داشته باشد.',
    contentEn: 'Price movement after the sweep must demonstrate aggressive displacement with large candle bodies and minimal wicks, signifying institutional sponsorship.',
    invalidationTriggers: [
      'تشکیل کندل‌های دوجی یا پوشش داده شدن بلافاصله کندل مومنتوم با حرکت مخالف',
      'حرکت فرسایشی و طولانی بدون تکانه مشخص'
    ],
    executionChecklist: [
      'مقایسه اندازه بدنه کندل با میانگین ۲۰ کندل گذشته',
      'اطمینان از نسبت بالای ۸۰ درصدی بدنه به کل دامنه کندل'
    ],
    weight: 1.1
  },
  {
    id: 'S0-RULE-06',
    titleFa: 'قاعده ۶: ورود منحصراً با سفارش محدود لیمیت با بافر تعیین‌شده',
    titleEn: 'Rule 6: Limit Order Entry with Defined Buffer (No Market Chasing)',
    category: 'CORE_RULE',
    tags: ['سفارش لیمیت', 'ورود', 'بافر', 'اسلیپیج', 'limit order', 'buffer', 'slippage'],
    contentFa: 'هرگز نباید به صورت مارکت (Market Order) دنبال قیمت دوید. کلیه سفارش‌های ورود باید به صورت لیمیت (Limit Order) در ناحیه FVG یا پولبک به اوردربلاک تنظیم شوند. برای مقابله با اسپرد بروکر، بافر ۰.۵ پیپ به سفارش اضافه می‌شود. در صورت عدم لمس لیمیت و فرار قیمت، موقعیت کان لم یکن تلقی می‌شود.',
    contentEn: 'Never chase price via market orders. All orders must be placed as limit orders at the FVG or mitigation level with a calculated 0.5-pip spread buffer.',
    invalidationTriggers: [
      'ورود هیجانی با سفارش مارکت پس از جهش ناگهانی قیمت',
      'تنظیم لیمیت در نواحی نامتعادل بدون رعایت بافر اسپرد'
    ],
    executionChecklist: [
      'محاسبه دقیق قیمت لیمیت بر مبنای C.E. شکاف نقدینگی',
      'افزودن بافر متناسب با اسپرد حساب cTrader',
      'تعیین انقضای سفارش (Good Till Cancel / TTL)'
    ],
    weight: 1.3
  },
  {
    id: 'S0-RULE-07',
    titleFa: 'قاعده ۷: حد ضرر قطعی و نسبت ریسک به ریوارد حداقل ۱ به ۲ (SL & R:R)',
    titleEn: 'Rule 7: Invalidation Stop Loss & Minimum 1:2 Risk-Reward Ratio',
    category: 'CORE_RULE',
    tags: ['حد ضرر', 'استاپ لاس', 'تارگت', 'ریسک به ریوارد', 'sl', 'tp', 'risk reward'],
    contentFa: 'حد ضرر باید منحصراً در نقطه‌ای قرار گیرد که در صورت لمس آن، فرضیه تحلیل کاملاً باطل شود (پشت کندل سوییپ به علاوه بافر ۱.۵ برابری ATR یا ۱ پیپ). ورود به معاملاتی که نسبت ریوارد به ریسک آنها کمتر از ۱.۵ (در شرایط ایده‌آل کمتر از ۲.۰) است مطلقاً ممنوع می‌باشد.',
    contentEn: 'Stop loss must be placed strictly where the trade thesis is invalidated (beyond the sweep wick + ATR buffer). Minimum acceptable Risk/Reward is 1.5, targeted at >= 2.0.',
    invalidationTriggers: [
      'محاسبه R:R کمتر از ۱.۵ بر اساس اهداف ساختاری واقعی',
      'قرار دادن حد ضرر تصادفی بدون توجیه ساختاری پرایس‌اکشن'
    ],
    executionChecklist: [
      'تعیین دقیق قیمت ابطال ایده (Invalidation Level)',
      'افزودن بافر نوسان به قیمت حد ضرر',
      'محاسبه تارگت بر اساس استخرهای نقدینگی بعدی و ثبت نسبت R:R'
    ],
    weight: 1.4
  },
  {
    id: 'S0-RULE-08',
    titleFa: 'قاعده ۸: زمان‌بندی سشن‌های معاملاتی و پنجره کیل‌زون (London & NY Killzones)',
    titleEn: 'Rule 8: Trading Sessions & Killzone Timing',
    category: 'CORE_RULE',
    tags: ['سشن', 'کیل زون', 'لندن', 'نیویورک', 'زمان', 'session', 'killzone', 'london', 'new york'],
    contentFa: 'معاملات فقط در بازه‌های زمانی با نقدینگی بالا مجاز هستند: کیل‌زون لندن (ساعت ۰۷:۰۰ الی ۱۰:۰۰ UTC) و کیل‌زون نیویورک (ساعت ۱۳:۰۰ الی ۱۶:۰۰ UTC). انجام معامله در سشن آرام آسیا یا در ساعات پایانی روز جمعه به دلیل اسپرد بالا و حرکات فریبنده اکیداً ممنوع است.',
    contentEn: 'Trading is strictly permitted during high-liquidity London (07:00-10:00 UTC) and New York (13:00-16:00 UTC) killzones. Avoid low-volume Asian chop and Friday closes.',
    invalidationTriggers: [
      'تلاش برای ورود به معامله در ساعات خارج از کیل‌زون تعیین‌شده',
      'باز کردن پوزیشن در ۵ دقیقه پیش یا پس از بسته شدن بازار'
    ],
    executionChecklist: [
      'بررسی ساعت محلی و ساعت UTC سشن بازار',
      'بررسی هم‌پوشانی سشن‌ها برای حرکات با نقدینگی بالا',
      'مسدودسازی هرگونه سفارش در رنج فرسایشی آسیا'
    ],
    weight: 1.2
  },
  {
    id: 'S0-RULE-09',
    titleFa: 'قاعده ۹: مدیریت ریسک سبد و سقف مجاز زیان روزانه (Risk Sizing & Circuit Breaker)',
    titleEn: 'Rule 9: Risk Sizing & Daily Drawdown Circuit Breakers',
    category: 'RISK_POLICY',
    tags: ['مدیریت ریسک', 'حجم معامله', 'افت سرمایه', 'دراودان', 'فیوز ریسک', 'risk cap', 'drawdown', 'lot size'],
    contentFa: 'حداکثر ریسک در هر معامله دقیقاً ۱.۰ درصد موجودی کل حساب است. حجم معامله باید بر اساس فاصله دلاری نقطه ورود تا حد ضرر به طور خودکار محاسبه شود. در صورتی که زیان محقق‌شده در یک روز به ۲.۵ الی ۳.۰ درصد برسد، فیوز محافظتی قطع شده و سامانه برای ۲۴ ساعت قفل معاملاتی اعمال می‌کند.',
    contentEn: 'Maximum risk per trade is strictly capped at 1.0% equity. A daily drawdown of 2.5-3.0% activates the circuit breaker, locking the terminal for 24 hours.',
    invalidationTriggers: [
      'تجاوز ریسک محاسبه شده از سقف ۱ درصد سرمایه',
      'فعال شدن فیوز سقف افت روزانه (Daily Drawdown Breach)'
    ],
    executionChecklist: [
      'محاسبه خودکار لات سایز دقیق توسط ماژول قطعی Risk Engine',
      'اعتبارسنجی موجودی در برابر مارجین موردنیاز',
      'چک کردن وضعیت فیوز سقف زیان روزانه'
    ],
    weight: 1.5
  },
  {
    id: 'S0-RULE-10',
    titleFa: 'قاعده ۱۰: انضباط روانی، دوری از فومو و ممنوعیت انتقام (Anti-FOMO & Discipline)',
    titleEn: 'Rule 10: Psychological Discipline, Anti-FOMO & Revenge Trading Prohibition',
    category: 'PSYCHOLOGY',
    tags: ['روانشناسی', 'انتقام', 'فومو', 'صبر', 'انضباط', 'fomo', 'revenge trading', 'discipline'],
    contentFa: 'پس از هر معامله زیان‌ده، ۳۰ دقیقه زمان استراحت و تنفس اجباری برقرار است. ورود مجدد با انگیزه جبران فوری زیان (Revenge Trading) یکی از مخرب‌ترین رفتارهای معاملاتی است. اگر قیمت بدون سفارش ما حرکت کرد، هرگز نباید در میانه راه وارد شد؛ بازار همیشه فرصت جدید ارائه خواهد داد.',
    contentEn: 'Mandatory 30-minute cooldown after any loss. Never revenge trade or enter impulsively due to fear of missing out (FOMO). The market always presents new setups.',
    invalidationTriggers: [
      'ثبت سفارش مجدد بلافاصله پس از بسته شدن پوزیشن در ضرر',
      'افزایش حجم معامله پس از باخت به قصد جبران (الگوی مارتینگل)'
    ],
    executionChecklist: [
      'تایید وضعیت خنثی روانی معامله‌گر پیش از ورود',
      'اجرای تایمر خنک‌سازی ۳۰ دقیقه‌ای پس از هر استاپ',
      'بررسی شاخص خستگی ذهنی و پایبندی به برنامه'
    ],
    weight: 1.3
  },
  // درس‌های ثبت‌شده در ژورنال از تجارب واقعی (Journal Lessons)
  {
    id: 'S0-LESSON-01',
    titleFa: 'درس ۱: دویدن به دنبال کندل‌های بلند در انتهای حرکت منجر به حداکثر افت سرمایه می‌شود',
    titleEn: 'Lesson 1: Chasing Extended Candles Causes Maximum Adverse Excursion',
    category: 'JOURNAL_LESSON',
    tags: ['مارکت اردر', 'تعقیب قیمت', 'ضرر بزرگ', 'chasing', 'adverse excursion', 'درس ژورنال'],
    contentFa: 'تجربه نشان داده است در جفت‌ارزهای طلا و یورو، ورود با مارکت پس از یک کندل بلند مومنتوم معمولاً دقیقا در نقطه بازگشت و اصلاح خریداران بزرگ صورت می‌پذیرد. نتیجه این کار تحمل حداکثر زیان شناور (MAE) و استاپ خوردن پیش از ادامه روند است. همیشه باید صبور بود تا قیمت به ناحیه FVG پولبک بزند.',
    contentEn: 'Entering via market order after an extended momentum candle results in immediate pullback and severe drawdown. Always wait patiently for a retracement into the FVG.',
    invalidationTriggers: [
      'ورود به معامله در حالتی که فاصله با FVG بیش از ۱.۵ برابر ATR است'
    ],
    executionChecklist: [
      'بررسی فاصله قیمت جاری با بیس FVG',
      'پرهیز از ورود در صورت وقوع ۳ کندل متوالی انبساطی بدون اصلاح'
    ],
    weight: 1.1
  },
  {
    id: 'S0-LESSON-02',
    titleFa: 'درس ۲: ریسک‌فری کردن زودهنگام پوزیشن به دلیل ترس، سودهای بزرگ را می‌سوزاند',
    titleEn: 'Lesson 2: Premature Breakeven Exits Destroy Strategy Edge',
    category: 'JOURNAL_LESSON',
    tags: ['ریسک فری', 'ترس', 'بریک ایون', 'breakeven', 'edge', 'خروج زودهنگام'],
    contentFa: 'انتقال عجولانه حد ضرر به نقطه ورود به محض دیدن اندکی سود، بارها باعث خروج در اصلاح طبیعی قیمت شده و پس از آن بازار بدون ما تارگت اصلی را لمس کرده است. حد ضرر فقط زمانی به بریک‌ایون منتقل می‌شود که قیمت سقف ساختاری جدید در تایم ورود ثبت کرده و نقدینگی میانی را درو کرده باشد.',
    contentEn: 'Moving stop loss to breakeven prematurely out of fear gets positions stopped out on normal pullbacks. Only trail stop after a new structural swing is confirmed.',
    invalidationTriggers: [
      'تغییر دستی استاپ لاس به صفر قبل از دستیابی به حداقل ۱R'
    ],
    executionChecklist: [
      'احترام به فضای تنفس بازار تا اولین پولبک ساختاری',
      'مدیریت خروج پله‌ای (Partial Take Profit) به جای دستکاری استاپ'
    ],
    weight: 1.0
  },
  {
    id: 'S0-LESSON-03',
    titleFa: 'درس ۳: معامله ۵ دقیقه قبل و بعد از اخبار قرمز (CPI/NFP/FOMC) فاجعه‌آفرین است',
    titleEn: 'Lesson 3: Trading Near Red-Folder High Impact News Causes Catastrophic Slippage',
    category: 'JOURNAL_LESSON',
    tags: ['اخبار', 'سی پی آی', 'نرخ بهره', 'ان اف پی', 'اسپرد', 'news', 'cpi', 'nfp', 'fomc', 'slippage'],
    contentFa: 'در هنگام رویدادهای پرنوسان اقتصاد کلان نظیر بیانیه نرخ بهره فدرال رزرو (FOMC) یا گزارش اشتغال (NFP)، نقدینگی در عمق دفتر سفارشات محو شده و اسپرد تا ۱۰ برابر افزایش می‌یابد. حد ضررها با اسلیپیج فاحش اجرا می‌شوند. تمام معاملات باید از ۱۰ دقیقه قبل از انتشار خبر بسته یا محافظت شده و تا ۱۵ دقیقه پس از آن هیچ اردر جدیدی گذاشته نشود.',
    contentEn: 'High-impact macroeconomic releases drain order book liquidity and cause extreme spread widening. Do not enter any positions 10 minutes before and 15 minutes after red-folder news.',
    invalidationTriggers: [
      'وجود رویداد خبری با درجه اهمیت بالا در بازه ۱۵ دقیقه‌ای جاری'
    ],
    executionChecklist: [
      'بررسی تقویم اقتصادی پیش از آغاز سشن',
      'فعال‌سازی پرچم isNewsUpcoming در اسنپ‌شات تحلیل‌گر'
    ],
    weight: 1.5
  },
  {
    id: 'S0-LESSON-04',
    titleFa: 'درس ۴: رنج‌های متراکم بدون روند، سرمایه را با زیان‌های پیاپی می‌فرسایند',
    titleEn: 'Lesson 4: Tight Consolidations Lead to Death by a Thousand Cuts',
    category: 'JOURNAL_LESSON',
    tags: ['رنج', 'فرسایش', 'تراکم', 'consolidation', 'chop', 'سرمایه'],
    contentFa: 'وقتی بازار در یک دامنه متراکم بدون جهت در نوسان است، الگوهای سوییپ و FVG مکرراً شکست می‌خورند زیرا بازار در حال انباشت سفارشات است. اقدام به معامله در این فازها منجر به چندین باخت پی‌درپی و فرسایش روانی می‌شود. بهترین تصمیم در رنج‌ها، دست زیر بغل نشستن و تماشا تا زمان خروج شارپ است.',
    contentEn: 'Trading in choppy, tight consolidations produces repeated stop-outs. Best posture during low-volume ranges is flat until high-volume directional breakout occurs.',
    invalidationTriggers: [
      'نوسان قیمت در دامنه‌ای کمتر از ۱ برابر ATR روزانه برای بیش از ۳ ساعت'
    ],
    executionChecklist: [
      'اندازه‌گیری دامنه نوسان و پهنای باند بولینگر',
      'پرهیز از جستجوی ستاپ اجباری در روزهای تعطیل یا کم‌حجم'
    ],
    weight: 1.1
  },
  {
    id: 'S0-LESSON-05',
    titleFa: 'درس ۵: نادیده گرفتن مومنتوم متضاد H4 حتی با ظاهر فریبنده M5 مساوی است با شکست',
    titleEn: 'Lesson 5: Never Trade M5 Setups Against Strong H4 Momentum Expansion',
    category: 'JOURNAL_LESSON',
    tags: ['تضاد تایم فریم', 'شکست تحلیل', 'هانت', 'timeframe conflict', 'h4 expansion'],
    contentFa: 'بسیاری از مواقع در تایم‌فریم ۵ دقیقه یک سوییپ و FVG معکوس و زیبا شکل می‌گیرد، اما چون در دل یک کندل قدرتمند H4 در حال ریزش است، فوراً بی اثر شده و پودر می‌شود. همسویی با جهت مومنتوم تایم‌فریم بزرگتر شرط بقا در بازارهای مالی است.',
    contentEn: 'Counter-trend M5 setups inside an expanding H4 momentum candle fail at high rates. Aligning with the higher timeframe momentum is non-negotiable.',
    invalidationTriggers: [
      'تضاد مستقیم سیگنال M5 با کندل در حال گسترش H4'
    ],
    executionChecklist: [
      'تطبیق جهت سیگنال با وضعیت کندل جاری H4',
      'رد صلاحیت فوری ستاپ‌های معکوس در شتاب‌های پرقدرت'
    ],
    weight: 1.2
  }
];
