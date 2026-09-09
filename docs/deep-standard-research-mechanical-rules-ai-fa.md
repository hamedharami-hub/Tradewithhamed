# استانداردسازی سیستم معاملاتی Hamed Trading Lab

## تحقیق تطبیقی دربارهٔ Order Block، BOS/MSS، سیستم‌های مکانیکی و هوش مصنوعی معاملاتی

**وضعیت گزارش:** پژوهش معماری و اعتبارسنجی؛ نه توصیهٔ سرمایه‌گذاری و نه اثبات سودآوری.

## خلاصهٔ اجرایی

سیستم فعلی پروژه از نظر معماری، جهت درستی دارد: بخش اصلی تولید سیگنال بر قواعد قطعی کار می‌کند، Paper-Forward از مسیر بروکر واقعی جدا شده، خروجی چهار نقش AI به‌صورت advisory تعریف شده و مسیرهای نامطمئن باید fail-closed شوند. بااین‌حال، سه نکتهٔ اساسی باید روشن بماند.

نخست، اصطلاحات Order Block، Break of Structure، Market Structure Shift، Fair Value Gap و Liquidity Sweep استاندارد رسمی و یکتای دانشگاهی یا بورسی نیستند. این اصطلاحات در خانوادهٔ SMC/ICT رایج‌اند، اما بخش قابل‌کدنویسی آن‌ها باید به‌عنوان **price proxy** تعریف شود، نه به‌عنوان مشاهدهٔ قطعی سفارش نهادی، فعال‌شدن stopها یا قصد «شکار نقدینگی». پژوهش دربارهٔ cascades ناشی از stop در بازار FX وجود دارد، اما از روی OHLC به‌تنهایی نمی‌توان عاملیت نهادی را اثبات کرد.[1]

دوم، قواعد مکانیکی زمانی ارزش دارند که قبل از مشاهدهٔ نتیجه، نسخه‌بندی و قفل شوند. در چنین سیستمی زمان signal، اولین قیمت قابل‌دسترسی، bid/ask، spread، slippage، commission، ترتیب برخورد به stop و target، سقف ریسک و زمان انقضا باید به‌طور کامل مشخص باشند. نتیجهٔ فعلی GBPUSD نشان می‌دهد که S0_SWEEP_FVG هنوز edge پایدار اثبات نکرده است: در گزارش OOS اختصاصی S0، چهار fold به‌ترتیب PFهای 0.46، 0.54، 1.46 و 0.45 داشته‌اند و Net Profit تجمیعی منفی بوده است.

سوم، AI باید در نقش محدود و آزمون‌پذیر وارد شود. مدل‌های ML برای ساخت ویژگی، تشخیص رژیم، رتبه‌بندی candidateها و کالیبراسیون ریسک مناسب‌ترند. LLMهای آنلاین و آفلاین برای استخراج متن زمان‌دار، خلاصه‌سازی شواهد و تولید توضیح ساخت‌یافته قابل استفاده‌اند. هیچ مدل زبانی نباید اختیار مستقیم تعیین حجم، stop، take-profit یا ارسال order را داشته باشد. Judge نهایی باید از نظر اختیار، قطعی و مستقل از مدل باشد.

> استاندارد پیشنهادی این پروژه چنین است: **Rule Engine قطعی، AI به‌عنوان Evidence/Ranking/Advisory، و Risk Judge مستقل و fail-closed.**

## ۱. وضعیت واقعی کد پروژه

### ۱.۱ قواعد موجود

بررسی `lib/research/strategy-rules.ts` نشان می‌دهد پروژه اکنون چند detector قابل‌کدنویسی دارد. FVG سه‌کندلی با حداقل اندازهٔ حدود 0.3 برابر ATR، sweep با حداقل نفوذ حدود 0.1 برابر ATR و BOS بر اساس بسته‌شدن قیمت آن‌سوی swing تأییدشده استفاده می‌شوند. این طراحی برای شروع مناسب است، زیرا به جای قضاوت بصری، evidence تولید می‌کند.

بااین‌حال، تعریف حرفه‌ای‌تر باید lifecycle کامل داشته باشد. برای هر event باید `formed`, `confirmed`, `first_touch`, `mitigated`, `invalidated` و `expired` جدا باشند. همچنین باید شناسهٔ کندل‌های منبع، نسخهٔ rule، تایم‌فریم، پارامترهای resolved و زمان مشاهده ثبت شود. بدون این اطلاعات نمی‌توان بعداً تشخیص داد که آیا rule در زمان تصمیم واقعاً قابل‌مشاهده بوده است یا از اطلاعات آینده استفاده کرده است.

### ۱.۲ معماری AI فعلی

قرارداد پروژه چهار نقش را تعریف می‌کند:

| نقش | وظیفهٔ مناسب | وضعیت مطلوب در پروژه |
|---|---|---|
| Scanner | تولید candidate و evidence | بهتر است عمدتاً قطعی بماند و فقط در صورت نیاز anomaly/feature مدل را اضافه کند |
| Analyst | سنجش context و regime | می‌تواند ML یا WebLLM advisory داشته باشد |
| Critic | یافتن تناقض و ریسک | باید عمدتاً adversarial و fail-closed باشد |
| Judge | تصمیم نهایی عبور یا توقف | باید قطعی و مستقل از LLM بماند |

بررسی ایستای مسیر agentic نشان می‌دهد `advisoryOnly` و fail-closed در طراحی وجود دارد. بااین‌حال دو موضوع باید با تست integration تأیید و احتمالاً اصلاح شوند. نخست، در مسیر بررسی چهار agent، engine ID انتخاب‌شده برای Judge ظاهراً در ثبت نتیجه دیده می‌شود، اما تصمیم تابع deterministic `judgeAgentReviews()` را دنبال می‌کند؛ بنابراین باید روشن شود که تغییر engine واقعاً behavior را تغییر می‌دهد یا فقط metadata را تغییر می‌دهد. دوم، contextهایی مانند spread و news risk باید قبل از agentها در hard risk gate وارد شوند؛ خروجی متنی مدل نباید جایگزین این gate شود.

### ۱.۳ وضعیت داده و بک‌تست

دادهٔ HistData و datasetهای مشتق‌شده برای شروع پژوهش مفیدند، اما READY بودن dataset فقط به معنای عبور از validator داخلی است و برابری با feed بروکر هدف را اثبات نمی‌کند. برای GBPUSD باید به‌تدریج bid/ask، timestamp quote، spread، slippage، commission، swap و rejectionهای بروکر Demo ثبت شوند.

مدل هزینهٔ فعلی پروژه شامل spread ثابت، slippage ثابت و commission است. این مدل برای baseline مناسب است، اما برای ادعای عملکرد واقعی کافی نیست. spread و slippage باید دست‌کم بر حسب session، volatility، rollover، خبر و زمان روز کالیبره شوند.

## ۲. تعریف‌های استاندارد و قابل‌کدنویسی

### ۲.۱ BOS و MSS

**BOS-v1** باید به‌صورت شکست close یک swing تأییدشده و فعال تعریف شود. swing باید قبل از کندل signal تشکیل شده باشد، فاصلهٔ کافی با قیمت داشته باشد و با buffer مشخصی مانند ATR یا tick عبور کند. BOS باید continuation در جهت trend state باشد.

**MSS-v1** باید نخستین شکست معتبر خلاف trend state باشد. MSS به‌تنهایی reversal قطعی نیست. برای جلوگیری از برچسب‌گذاری بیش‌ازحد، `REVERSAL_CONFIRMED` باید فقط پس از تشکیل ساختار جدید و عبور follow-through ایجاد شود.

> از نظر دادهٔ OHLC، «close از swing عبور کرد» مشاهده‌پذیر است؛ «بازار سفارش‌های نهادی را جذب کرد» یک فرضیهٔ تفسیری است.

### ۲.۲ Order Block

تعریف پیشنهادی `OB-v1` این است: آخرین کندل مخالفِ واجد شرایط پیش از یک displacement leg که BOS معتبر ایجاد می‌کند. برای هر OB باید این موارد مشخص باشند:

- محدودهٔ zone: body-only یا full-range؛
- کندل و تایم‌فریم منبع؛
- displacement threshold؛
- زمان confirmation؛
- اولین touch؛
- mitigation؛
- invalidation؛
- expiry؛
- وضعیت استفاده‌شدن یا one-use بودن.

این تعریف از نام‌گذاری سادهٔ «آخرین کندل مخالف» بهتر است، اما هنوز institutional order را اثبات نمی‌کند. در UI بهتر است از عبارت **OB-v1 candidate** استفاده شود، نه «institutional order detected».

### ۲.۳ FVG

تعریف ساده و قابل‌آزمون FVG صعودی در سه کندل این است:

```text
low[t] > high[t-2] + buffer
zone = [high[t-2], low[t]]
```

برای FVG نزولی رابطه برعکس می‌شود. تشکیل، midpoint touch، fill کامل و invalidation باید stateهای جدا باشند. FVG نباید فقط با touch یکسان تلقی شود.

### ۲.۴ Liquidity Sweep

Sweep باید به‌صورت penetration یک سطح از پیش‌تعیین‌شده و reclaim بسته‌شده در پنجرهٔ محدود تعریف شود. لازم است نوع سطح نیز مشخص باشد: swing high/low، session high/low یا range boundary. عبارت‌هایی مانند «stopها شکار شدند» یا «نهادها عمداً نقدینگی را جمع کردند» از OHLC به‌تنهایی قابل‌اثبات نیستند.

## ۳. استاندارد سیستم مکانیکی

هر آزمایش باید یک manifest immutable داشته باشد که این موارد را ذخیره کند:

| دسته | موارد ضروری |
|---|---|
| داده | provider، symbol، venue، timezone، dataset hash، data revision |
| قواعد | rule version، پارامترها، lookback، swing method، session definition |
| اجرا | first executable price، bid/ask، fill policy، ambiguity policy، latency |
| هزینه | spread، commission، slippage، swap، conversion، market impact |
| ریسک | risk per trade، max concurrent، daily loss، max drawdown، kill switch |
| پژوهش | git SHA، seed، trial ID، candidate library، تعداد تمام آزمون‌ها |
| خروجی | signal، order، fill، reject، reason code، equity curve، MAE/MFE |

سیستم نباید از کندل signal برای اثبات fill همان کندل استفاده کند، مگر اینکه دادهٔ tick و ترتیب دقیق رخدادها موجود باشد. در candle mode، signal در candle بستهٔ `t` باید در اولین قیمت قابل‌دسترسی پس از `t` اجرا شود.

برای سنجش ارزش ترکیب ruleها باید ablation انجام شود:

1. S0 Sweep-only؛
2. FVG-only؛
3. BOS-only؛
4. OB-only؛
5. Sweep + MSS؛
6. Sweep + MSS + FVG/OB؛
7. همین موارد با فیلترهای زمانی و regime.

هر نسخه باید با baseline matched، هزینهٔ یکسان و بازهٔ زمانی یکسان سنجیده شود.

## ۴. اعتبارسنجی ضد Overfitting

Walk-forward موجود پروژه نقطهٔ شروع خوبی است، اما برای release کافی نیست. باید به nested walk-forward تبدیل شود. در هر outer fold، انتخاب پارامتر و session فقط در train و validation داخلی انجام شود. outer OOS فقط یک‌بار و پس از freeze اجرا شود.

Purge باید برابر بیشینهٔ `entryExpiryBars`، maximum holding period، label horizon و overlap lookback باشد. بعد از fold نیز embargo لازم است. انتخاب پارامتر نباید بر اساس Net Profit تنها باشد؛ objective باید net return بعد از هزینه، PF، تعداد معاملات، drawdown و stability را ترکیب کند.

برای library بزرگ ruleها باید این آزمون‌ها اضافه شوند:

- Probability of Backtest Overfitting با CSCV؛
- Deflated Sharpe Ratio؛
- White Reality Check یا SPA؛
- block bootstrap برای CI expectancy و drawdown؛
- plateau test برای همسایگی پارامترها؛
- stress cost با 1.5x و 2x هزینه؛
- آزمون پایداری در چند fold، session و regime.

آستانه‌های پیشنهادی داخلی، نه قوانین جهان‌شمول، عبارت‌اند از: حداقل سه outer fold، حداقل 100 معاملهٔ OOS برای تصمیم اولیه، lower 95% CI expectancy مثبت، DSR حداقل 0.95، PBO حداکثر 10%، SPA/Reality Check با p-value کمتر از 0.05، و عدم وابستگی شدید به یک session.

## ۵. نقش درست AI در کنار سیستم مکانیکی

### ۵.۱ نقش‌های مناسب ML

ML برای استخراج feature، پیش‌بینی volatility، تشخیص regime، ranking candidateها و calibration مناسب است. خروجی آن باید score، probability یا uncertainty باشد؛ نه دستور متنی معامله.

یک معماری مناسب برای این پروژه چنین است:

```text
Closed Market Data
        ↓
Data/Provenance Gate
        ↓
Deterministic Scanner: S0/BOS/OB/FVG
        ↓
ML Context/Regime + Candidate Ranker
        ↓
Adversarial Critic
        ↓
Deterministic Risk Judge
        ↓
Paper-Forward only
```

### ۵.۲ نقش مناسب LLM

LLM آنلاین یا آفلاین برای متن و context ارزشمندتر است:

- استخراج خبر و entity؛
- ثبت زمان انتشار و جهت احتمالی؛
- خلاصه‌سازی evidence؛
- تشخیص تناقض متنی؛
- تولید rationale قابل‌خواندن؛
- تبدیل تحلیل به JSON ساخت‌یافته.

LLM نباید به broker credential، order API، sizing یا risk engine دسترسی مستقیم داشته باشد. confidence مدل باید calibrated شود و confidence خوداظهاری مدل کافی نیست.

### ۵.۳ قرارداد خروجی چهار agent

```json
{
  "schemaVersion": "1.0",
  "agentId": "critic",
  "verdict": "CANDIDATE|NO_TRADE|INSUFFICIENT_DATA",
  "confidence": 0.0,
  "evidenceIds": [],
  "missingFields": [],
  "riskFlags": [],
  "contradictions": [],
  "asOf": "2026-09-09T00:00:00Z",
  "dataCutoff": "2026-09-09T00:00:00Z",
  "modelId": "local-model-id",
  "modelRevision": "artifact-hash",
  "suggestedAction": "NO_ORDER"
}
```

JSON نامعتبر، evidence ناشناخته، timestamp قدیمی، `finish_reason=length`، timeout، missing field یا contradiction باید به `NO_TRADE` یا `INSUFFICIENT_DATA` منجر شود.

## ۶. مدل‌های آفلاین و WebGPU

WebLLM امکان inference داخل مرورگر با WebGPU، Web Worker و JSON mode را فراهم می‌کند. اما load اولیهٔ مدل معمولاً نیازمند دانلود است. پس از آن می‌توان cache محلی داشت. بنابراین «local inference» با «offline verified» یکی نیست. Offline verified باید فقط بعد از قطع شبکه و اجرای موفق مدل از cache ثبت شود.[15]

مدل‌ها بر اساس بودجهٔ تقریبی حافظهٔ WebLLM:

| مدل | مصرف رسمی تقریبی | جایگاه پیشنهادی |
|---|---:|---|
| SmolLM2-360M | 376 MB | smoke test و JSON بسیار کوتاه |
| Llama-3.2-1B | 879 MB | fallback سبک |
| Qwen3.5-0.8B | 1.63 GB | default advisory سبک |
| Qwen3-1.7B | 2.04 GB | تحلیل متوسط |
| Llama-3.2-3B | 2.26 GB | desktop یا دستگاه qualification‌شده |
| Qwen3.5-2B | 2.25 GB | tablet/desktop |
| Phi-4-mini | 3.44 GB | desktop قدرتمند |
| Qwen3.5-4B | 3.87 GB | desktop qualification |
| مدل‌های 7B | حدود 5.1 GB | فقط desktop با GPU کافی |

این اعداد benchmark سرعت نیستند. latencyهای ثابت موجود در catalog پروژه مانند 15، 24 یا 45 میلی‌ثانیه تا زمانی که روی دستگاه واقعی با cache سرد/گرم ثبت نشوند، نباید به‌عنوان عملکرد واقعی نمایش داده شوند.

همچنین بررسی registry نشان می‌دهد برخی مدل‌های 14B در manifest پروژه در prebuilt registry فعلی WebLLM موجود نیستند و چند URL مربوط به WASM در manifest پاسخ 404 می‌دهند. catalog باید از `prebuiltAppConfig.model_list` نسخهٔ نصب‌شده تولید شود و model ID، artifact revision، URL، hash و context override در آن freeze شود.

### پیشنهاد مدل برای این پروژه

- Scanner: `Qwen3.5-0.8B` یا `Llama-3.2-1B`؛
- Analyst: `Qwen3.5-2B` پس از qualification؛
- Critic: `Phi-4-mini` روی desktop و مدل سبک‌تر به‌عنوان fallback؛
- Judge: قطعی و کدنویسی‌شده، نه مدل زبانی.

فقط یک engine باید resident باشد تا فشار GPU و memory قابل‌کنترل بماند. context باید کوتاه و token budget محدود باشد.

## ۷. Promptهای پیشنهادی

### Scanner

```text
تو Evidence Scanner هستی. فقط snapshot تایپ‌شده را بخوان.
هیچ قیمت، اندیکاتور، خبر یا الگویی را حدس نزن.
فقط JSON مطابق schema بده.
اگر candle، زمان، spread، session، entry، stop یا target ناقص است،
verdict را INSUFFICIENT_DATA و suggestedAction را NO_ORDER بگذار.
Evidence ID فقط باید از ورودی انتخاب شود.
تحلیل آزاد و توصیه سفارش ممنوع است.
```

### Analyst

```text
تو Context Analyst هستی. شواهد Scanner و ویژگی‌های محاسبه‌شده را
سازگار یا ناسازگار اعلام کن. فقط گزاره‌هایی را بپذیر که evidence ID دارند.
confidence را با داده ناکافی بالا نبر. اگر spread، R:R، session یا risk
نامعتبر است، NO_TRADE یا INSUFFICIENT_DATA بده. فقط JSON schema.
```

### Critic

```text
تو منتقد بدبین ریسک هستی. وظیفه‌ات ردکردن ادعاهای بدون شاهد است.
stale timestamp، spread نامطلوب، خبر پرریسک، R:R ناکافی، داده ناقص،
تناقض و drift را در riskFlags ثبت کن. داده ابداع نکن. در نبود شاهد کافی
INSUFFICIENT_DATA بده. suggestedAction همیشه NO_ORDER است.
```

### Judge

Judge باید فقط توضیح ساخت‌یافته تولید کند، اما authority واقعی باید کد قطعی باشد:

```text
فقط زمانی CANDIDATE بده که schema همه agentها معتبر، timestampها تازه،
evidenceها مجاز، missingFields و contradictions خالی و تمام hard risk gates
قبول باشند. در غیر این صورت NO_TRADE یا INSUFFICIENT_DATA بده.
confidence جدید نساز و فقط JSON schema تولید کن.
```

## ۸. اتصال مستقیم به پروژه

اصلاحات ضروری برای استانداردسازی همین repository:

1. انتقال spread، news risk، stale data و latency به hard gate مستقل از agent؛
2. پیاده‌سازی واقعی dispatch بر اساس engine ID، یا حذف گزینه‌هایی که فقط در metadata وجود دارند؛
3. ثبت model ID، artifact hash، resident status و نتیجهٔ E2E offline verification؛
4. افزودن immutable Trial Ledger برای همهٔ candidateها، حتی نتایج شکست‌خورده؛
5. اصلاح sessionها با timezoneهای IANA و DST به جای ساعت UTC ثابت؛
6. افزودن PBO، DSR، SPA/Reality Check و block bootstrap؛
7. اجرای ablation کامل از rule-only تا چهار-agent؛
8. نگه‌داشتن default روی `PAPER_TRADE` و ممنوعیت promotion تا عبور از OOS و forward مستقل.

## نتیجهٔ نهایی و تصمیم

سیستم فعلی را نباید دور ریخت. هستهٔ قطعی S0 و لایهٔ Paper-Forward برای ساخت یک laboratory پژوهشی مناسب‌اند. اما تعاریف SMC باید از ادعاهای نهادی جدا شوند، lifecycle آن‌ها باید نسخه‌دار شود و ارزیابی باید از یک بک‌تست سودده به یک زنجیرهٔ کامل ضدنشت و ضد overfitting تبدیل شود.

در مورد AI، پیشنهاد درست افزایش بی‌حد تعداد agentها نیست. چهار نقش کافی‌اند، به شرطی که هر نقش وظیفهٔ مستقل، schema مستقل، evidence مستقل و veto مستقل داشته باشد. Scanner باید عمدتاً deterministic بماند، Analyst می‌تواند ML/LLM advisory باشد، Critic باید adversarial باشد و Judge باید قطعی باشد.

**تصمیم فعلی برای پروژه: No-Go برای اجرای سرمایهٔ واقعی؛ Go برای ادامهٔ Research و Paper-Forward.** دادهٔ OOS فعلی برای اثبات edge کافی نیست، مانیتور cTrader هنوز به credentials نیاز دارد و WebGPU هنوز باید روی دستگاه هدف با آزمون واقعی latency، memory و offline cache ارزیابی شود.

## References

[1]: https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.pdf "Evidence on Stop-Loss Cascades in Foreign Exchange"
[2]: https://www.nber.org/papers/w7613 "Lo, Mamaysky and Wang: Foundations of Technical Analysis"
[3]: https://www.kevinsheppard.com/files/teaching/mfe/advanced-econometrics/Sullivan_Timmermann_White.pdf "Sullivan, Timmermann and White: Data-Snooping, Technical Trading Rule Performance, and the Bootstrap"
[4]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253 "The Probability of Backtest Overfitting"
[5]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551 "The Deflated Sharpe Ratio"
[6]: https://users.ssc.wisc.edu/~behansen/718/White2000.pdf "White: A Reality Check for Data Snooping"
[7]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=264569 "Hansen: A Test for Superior Predictive Ability"
[8]: https://pmc.ncbi.nlm.nih.gov/articles/PMC9834034/ "Survey of Feature Selection and Extraction for Stock Market Prediction"
[9]: https://arxiv.org/abs/1808.03668 "DeepLOB: Deep Convolutional Neural Networks for Limit Order Books"
[10]: https://www.nber.org/papers/w25398 "Empirical Asset Pricing via Machine Learning"
[11]: https://www.twosigma.com/articles/a-machine-learning-approach-to-regime-modeling/ "A Machine Learning Approach to Regime Modeling"
[12]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4412788 "Can ChatGPT Forecast Stock Price Movements?"
[13]: https://arxiv.org/abs/2306.06031 "FinGPT: Open-Source Financial Large Language Models"
[14]: https://www.nist.gov/itl/ai-risk-management-framework "NIST AI Risk Management Framework"
[15]: https://webllm.mlc.ai/ "WebLLM: High-Performance In-Browser LLM Inference Engine"
[16]: https://llm.mlc.ai/docs/deploy/webllm.html "WebLLM Deployment Documentation"
[17]: https://raw.githubusercontent.com/mlc-ai/web-llm/main/src/config.ts "WebLLM Prebuilt Model Registry"
[18]: https://www.w3.org/TR/webgpu/ "WebGPU Specification"
[19]: https://developer.chrome.com/docs/ai/prompt-api "Chrome Prompt API and Gemini Nano Requirements"
[20]: https://www.fluxcharts.com/articles/order-blocks-ob-explained "Order Blocks Explained"
[21]: https://www.fluxcharts.com/articles/fair-value-gaps-fvg-explained "Fair Value Gaps Explained"
[22]: https://alchemymarkets.com/education/strategies/break-of-structure-bos-trading/ "Break of Structure Explained"
[23]: https://atas.net/blog/understanding-market-structure-and-market-structure-shift-mss/ "Market Structure Shift Explained"
[24]: https://www.cmegroup.com/education/courses/things-to-know-before-trading-cme-futures/futures-order-types "CME Futures Order Types"
[25]: https://www.sec.gov/data-research/statistics-data-visualizations/order-book-reporting-methods-their-impact-some-market-activity-measures "SEC Order Book Reporting Methods"
