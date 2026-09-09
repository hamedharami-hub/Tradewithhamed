# نقشهٔ اجرایی نوسازی S0_SWEEP_FVG و معماری AI

## نتیجهٔ اجرایی

هدف این برنامه تبدیل S0 از یک detector پژوهشی به یک سامانهٔ قابل‌اندازه‌گیری برای **Backtest، Walk-Forward و Paper-Forward** است. قاعدهٔ اصلی تغییر نمی‌کند: **Rule Engine قطعی candidate را می‌سازد، AI فقط شواهد موجود را رتبه‌بندی و نقد می‌کند، و Judge قطعی دربارهٔ عبور از دروازهٔ ریسک تصمیم می‌گیرد.** هیچ مدل آفلاین یا آنلاین مجاز نیست حجم، حدضرر، حدسود یا سفارش بروکری را مستقیماً تعیین کند.

این نقشه در هفت مرحله اجرا می‌شود. مرحلهٔ اول هم‌اکنون در کد آغاز شده است.

## مرحله‌ها

| مرحله | خروجی اصلی | وضعیت |
|---|---|---|
| ۱. استاندارد S0 و provenance | lifecycle شواهد، پارامترهای نسخه‌بندی‌شده، فیلتر candidate و قرارداد provider | در حال اجرا |
| ۲. AI Gate قابل‌تعویض | رابط یکسان برای OFF، Deterministic، WebLLM و Online Advisory با JSON اعتبارسنجی‌شده | بعدی |
| ۳. مدل‌های AI و benchmark | مقایسهٔ مدل‌های کوچک/متوسط محلی و مدل آنلاین روی یک candidate set ثابت | بعدی |
| ۴. ضد overfitting | nested walk-forward، purge/embargo، ablation، bootstrap و stability plateau | بعدی |
| ۵. اتصال Paper-Forward | مصرف دادهٔ زندهٔ read-only، اجرای بسته‌شدن کندل و ثبت کامل تصمیم‌ها | بعدی |
| ۶. تحلیل چندبازاری | اجرای S0 روی GBPUSD، EURUSD، USDJPY و XAUUSD با cost model مستقل | بعدی |
| ۷. release پژوهشی | گزارش ۳۰ تا ۹۰ روزه، معیار go/no-go و قفل نسخهٔ قابل‌تکرار | نهایی |

## کاربرد واقعی مدل‌ها

**FinGPT و مدل‌های مالی مشابه** برای sentiment، استخراج اطلاعات از متن، طبقه‌بندی و RAG مناسب‌ترند. آن‌ها از OHLC خام به‌تنهایی «دانش نهادی» استخراج نمی‌کنند و نباید به‌عنوان اثبات Order Block یا Liquidity Sweep استفاده شوند. در این پروژه فعلاً از آن‌ها برای اخبار استفاده نمی‌کنیم، مطابق درخواست کاربر.

**FinRL و RL** محیط پژوهشی و الگوریتم آموزشی هستند، نه یک فیلتر آماده برای S0. افزودن RL قبل از ثابت‌شدن dataset، هزینه، execution و OOS باعث افزایش ریسک overfitting می‌شود؛ بنابراین در مرحلهٔ ششم یا بعد از release پژوهشی بررسی خواهد شد.

**مدل‌های سری زمانی** مانند foundation modelهای forecasting می‌توانند برای volatility/regime یا ranking آزمایش شوند، اما پیش‌بینی قیمت به‌تنهایی مجوز معامله نیست. معیار پذیرش آن‌ها باید بهبود OOS پس از هزینه باشد، نه accuracy خام.

**مدل‌های محلی 3B تا 14B** برای candidateهای کم‌تعداد مناسب‌اند؛ ورودی آن‌ها باید packet ساخت‌یافتهٔ شامل شمع بسته، ATR، evidence، regime، session و cost باشد. مدل نباید تاریخچهٔ نامحدود را ببیند یا داده‌ای خارج از packet بسازد. مدل قوی‌تر فقط زمانی ارزش دارد که نرخ خطای ساختاری، latency و calibration آن در benchmark بهتر باشد.

**مدل‌های آنلاین سریع** مانند خانواده‌های Flash/Haiku یا مدل‌های کوچک API برای تحلیل کم‌تکرار و توضیح candidate مناسب‌اند. مسیر آنلاین باید اختیاری، قابل خاموش‌کردن، بدون دسترسی به broker و با ثبت model ID، timestamp، prompt hash و هزینه باشد. در این پروژه از آنلاین AI برای اخبار استفاده نمی‌کنیم؛ کاربرد پیشنهادی بعدی آن فقط advisory روی candidateهای عبورکرده از rule filter است.

## معماری نهایی پیشنهادی

```text
Closed Candle
  -> Data Quality / Provenance Gate
  -> S0 Deterministic Scanner
  -> Candidate Evidence Packet
  -> Optional Local or Online Advisory
  -> Adversarial Critic
  -> Deterministic Risk Judge
  -> Backtest or Paper-Forward only
```

در حالت **OFF**، candidateهای معتبر مستقیماً با cost model اجرا می‌شوند. در حالت **DETERMINISTIC_COUNCIL**، فیلترهای قطعی اجرا می‌شوند. در حالت **LOCAL_AGENTIC**، مدل محلی Analyst و Critic را اجرا می‌کند و Judge مستقل می‌ماند. در حالت **HYBRID**، یک مدل محلی و یک مدل آنلاین روی همان packet اجرا می‌شوند؛ اختلاف آن‌ها باید به `REVIEW_REQUIRED` تبدیل شود، نه معامله.

## قرارداد prompt

هر prompt باید system و user جدا داشته باشد. system فقط نقش و محدودیت را تعریف می‌کند. user فقط JSON packet نسخه‌دار را حمل می‌کند. خروجی باید شامل `verdict`، `confidence`، `evidenceIds`، `missingFields`، `riskFlags`، `contradictions`، `modelId` و `dataCutoff` باشد. JSON نامعتبر، evidence ناشناخته، پاسخ ناقص یا timeout به‌طور قطعی `NO_TRADE` می‌شود.

## معیار پذیرش

هیچ مدل یا parameter جدیدی با افزایش win rate تنها پذیرفته نمی‌شود. حداقل معیارها عبارت‌اند از: OOS مستقل، هزینهٔ واقعی، ثبات در چند fold و session، حد پایین اطمینان expectancy، تعداد معاملهٔ کافی، افت سرمایهٔ قابل‌تحمل، و عدم وابستگی به یک بازهٔ زمانی. اگر AI تعداد معامله را کم کند ولی expectancy و stability را در OOS بهتر نکند، ارزش عملی آن اثبات نشده است.

## منابع کلیدی

این برنامه با گزارش قبلی پروژه و منابع رسمی WebLLM، FinGPT و FinRL تطبیق داده شده است. FinGPT در اصل یک چارچوب مدل زبانی مالی برای sentiment و متن است، نه موتور قطعی OHLC.[1] FinRL یک چارچوب محیط و الگوریتم RL برای train-test-trade است و برای سیستم production نیازمند کنترل‌های مستقل داده و ریسک است.[2] WebLLM اجرای مدل‌های open-source داخل مرورگر با WebGPU و JSON mode را فراهم می‌کند، اما دانلود اولیه، cache و پشتیبانی دستگاه باید جداگانه اعتبارسنجی شوند.[3] Structured Outputs در APIهای مدرن می‌تواند شکل JSON را محدود کند، اما صحت اقتصادی تصمیم را تضمین نمی‌کند.[4]

[1]: https://arxiv.org/html/2306.06031v2 "FinGPT: Open-Source Financial Large Language Models"
[2]: https://github.com/AI4Finance-Foundation/FinRL "FinRL official repository and train-test-trade framework"
[3]: https://github.com/mlc-ai/web-llm "WebLLM official repository and WebGPU runtime"
[4]: https://developers.openai.com/api/docs/guides/structured-outputs "Structured Outputs official documentation"
[5]: https://www.w3.org/TR/webgpu/ "WebGPU Specification"

## تصمیم فعلی

در نسخهٔ فعلی، S0 باید با مرحلهٔ اول provenance و benchmark شروع شود. هنوز هیچ ادعایی دربارهٔ برتری FinGPT، WebLLM یا مدل آنلاین پذیرفته نمی‌شود تا مقایسهٔ matched و OOS اجرا شود. اخبار نیز عمداً خارج از مسیر AI باقی می‌ماند تا مسئلهٔ اصلی، یعنی اعتبار خود S0 روی دادهٔ قیمت، به‌درستی جدا و قابل‌اندازه‌گیری باشد.

نویسنده: **Manus AI**
مرجع اجرا: 2026-09-09

## یادداشت اجرای مرحلهٔ اول

مرحلهٔ اول در فایل `lib/research/strategy-rules.ts` با اضافه‌کردن provenance ساختاری candidate آغاز شده است. این تغییر به‌تنهایی عملکرد را بهتر فرض نمی‌کند؛ فقط اجازه می‌دهد هر سیگنال با rule version، زمان شمع signal، شواهد و پارامترهای resolved در آزمایش و Paper-Forward ردیابی شود. بعد از آن، مرحلهٔ دوم باید provider abstraction و benchmark واقعی را اضافه کند.

---

### منابع تکمیلی مدل‌های متن‌باز

FinGPT برای fine-tuning سبک مانند LoRA/QLoRA و برچسب‌گذاری مبتنی بر واکنش بازار مثال ارائه می‌کند، اما نتایج sentiment سهام را نباید مستقیماً به FX و S0 تعمیم داد.[1] FinRL محیط‌های RL و train/test را فراهم می‌کند، اما استفاده از آن بدون جداکردن train و OOS و بدون cost model می‌تواند نتیجهٔ ظاهری تولید کند.[2] WebLLM برای اجرای محلی و JSON ساخت‌یافته مناسب است، ولی artifact پشتیبانی‌شده و resident بودن مدل باید در زمان اجرا کنترل شود.[3]

این منابع برای **انتخاب مسیر معماری** استفاده شده‌اند، نه برای ادعای سودآوری.

نویسنده: **Manus AI**

## پیوست: ماتریس تصمیم مدل

| گزینه | وظیفهٔ مناسب در پروژه | وظیفهٔ نامناسب | اولویت |
|---|---|---|---|
| Rule engine قطعی | تولید S0 candidate و evidence | تشخیص «نیت نهادی» از OHLC | ۱ |
| مدل محلی 3B–7B | Analyst/Critic روی packet محدود | تولید مستقیم سفارش | ۲ |
| مدل محلی 7B–14B | تحلیل عمیق کم‌تکرار و benchmark | اجرای دائمی هر candle بدون cache | ۳ |
| FinGPT/FinBERT | متن و sentiment در آینده | تأیید مستقل price action | ۴ |
| FinRL/RL | آزمایش policy پس از تثبیت baseline | مرحلهٔ اول S0 | ۵ |
| مدل آنلاین سریع | advisory اختیاری و توضیح | دسترسی به broker یا risk sizing | ۶ |

## پیوست: taskهای قابل‌تبدیل به issue

۱. افزودن `ruleMetadata` و hash پارامترها به candidate.

۲. ساخت `AdvisoryProvider` با adapterهای OFF، Deterministic، WebLLM و Online.

۳. ثبت prompt hash، model revision، latency و parse status.

۴. ساخت benchmark ثابت candidateها و اجرای matched ablation.

۵. افزودن nested walk-forward و آزمون cost stress.

۶. اتصال همین pipeline به Paper-Forward بدون تغییر در rule engine.

۷. ساخت گزارش مقایسه‌ای AI و بدون AI با confidence interval.

## وضعیت پیاده‌سازی

این فایل plan اجرایی است. هر مرحله باید پس از typecheck، lint، domain tests و یک artifact قابل‌تکرار کامل اعلام شود. مدل‌های آنلاین و اخبار تا زمان فعال‌سازی صریح در configuration وارد مسیر نمی‌شوند.

نویسنده: **Manus AI**

## خلاصهٔ مدیریتی نهایی

پروژه نباید از «rule-based» به «LLM decides» تبدیل شود. مسیر حرفه‌ای، تبدیل candidate به یک مسئلهٔ evidence ranking است. AI باید کمک کند candidateهای ضعیف زودتر حذف شوند، تناقض‌ها شناسایی شوند و علت تصمیم ثبت شود. اثر AI فقط زمانی مثبت تلقی می‌شود که در OOS و Paper-Forward، پس از هزینه و با دادهٔ ثابت، بهبود پایدار در expectancy، drawdown یا stability نشان دهد.

این اصل مبنای تمام مراحل بعدی خواهد بود.
