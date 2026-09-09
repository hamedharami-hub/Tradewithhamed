# نقشهٔ اجرای کامل Research، AI و Paper-Forward

## پاسخ کوتاه

این پروژه را بهتر است در **۶ مرحلهٔ اصلی** اجرا کنیم. مرحله‌ها به‌گونه‌ای طراحی شده‌اند که بعد از مرحلهٔ ۲ یک بک‌تست قابل استفاده داشته باشیم و بعد از مرحلهٔ ۴ بتوانیم Paper-Forward واقعیِ بدون broker order را آغاز کنیم.

## مرحلهٔ ۱ — Data Foundation و Import واقعی

**هدف:** ساخت مخزن قابل اعتماد داده، بدون وابستگی اجباری به Yahoo.

کارها:

- ساخت importer مشترک برای CSV، ZIP/CSV، JSON و candle API.
- ثبت manifest شامل provider، symbol، timeframe، timezone، coverage، hash و quality report.
- تشخیص OHLC نامعتبر، duplicate، gap، timestamp اشتباه، کندل باز و interval ناسازگار.
- تبدیل همهٔ داده‌ها به UTC و قرارداد canonical داخلی.
- افزودن دادهٔ M1 و tick در صورت امکان و ساخت aggregation معتبر به 5M، 15M و 1H.
- نگهداری raw source و dataset immutable.
- ساخت data-quality dashboard.

**خروجی:** چند dataset قابل اعتماد و قابل تکرار برای EURUSD، GBPUSD، USDJPY و XAUUSD.

## مرحلهٔ ۲ — تکمیل Rule Base و Strategy Engine

**هدف:** مطمئن شویم سبک‌ها واقعاً کد اجرایی دارند و فقط در catalog تعریف نشده‌اند.

کارها:

- تکمیل S0 Sweep + FVG.
- تکمیل BOS/MSS + Order Block.
- تکمیل Equilibrium / Discount-Premium.
- تعریف دقیق session، timezone، spread و news blackout.
- versioning هر rule.
- ساخت evidence قابل audit برای هر candidate.
- حذف هر rule مبهم یا غیرقابل‌محاسبه.
- تست unit و fixture برای هر setup.

**خروجی:** هر candidate با evidence روشن توضیح می‌دهد چرا و در چه زمانی تولید شده است.

## مرحلهٔ ۳ — Backtest عمیق و مقایسهٔ علمی

**هدف:** بررسی یک سال یا چند سال داده و پیدا کردن زمان‌ها، بازارها و شرایط بهتر.

کارها:

- اجرای همهٔ strategy variantها روی dataset مشترک.
- تحلیل بر اساس ساعت UTC، روز هفته، ماه، session، regime و direction.
- محاسبهٔ win rate، expectancy، profit factor، drawdown، MAE/MFE و holding time.
- مدل‌سازی spread، commission، slippage و swap.
- اجرای train/validation/holdout.
- walk-forward analysis.
- sensitivity analysis برای spread، slippage، R:R و ATR.
- جلوگیری از انتخاب بهترین segment صرفاً به‌خاطر شانس.

**خروجی:** گزارش مقایسه‌ای قابل اتکا؛ نه فقط یک عدد سود نهایی.

## مرحلهٔ ۴ — Browser Agentic AI و چهار نقش

**هدف:** اجرای واقعی مدل آفلاین فقط روی candidateهای rule-filtered.

معماری:

```text
Rule Base Scanner
  → Offline Analyst
  → Offline Critic
  → Deterministic Judge
  → Paper Ledger
```

کارها:

- ساخت Browser-Side Agentic Orchestrator، چون WebGPU در مرورگر است.
- ارسال evidence packet کامل به Analyst و Critic.
- prompt جداگانه و versioned برای هر نقش.
- خروجی اجباری JSON ساختاریافته.
- ثبت raw output و parsed output.
- hash کردن prompt، evidence و model revision.
- fail-closed در invalid JSON، مدل load نشده، evidence مفقود یا اختلاف agentها.
- اجرای مستقل هر strategy variant.

**خروجی:** AI واقعاً در بررسی candidate دخالت می‌کند، اما نمی‌تواند مستقیماً سفارش live صادر کند.

## مرحلهٔ ۵ — Paper-Forward و Paper Ledger دائمی

**هدف:** اجرای آزمایش چند هفته تا ۹۰ روز بدون هیچ معاملهٔ واقعی.

کارها:

- دریافت closed candle از feed انتخابی.
- اجرای Rule Base روی هر کندل.
- اجرای Agentic review فقط روی candidateها.
- اجرای PAPER_REPLAY با fill، spread، slippage و commission.
- نگهداری durable در SQLite/Postgres یا storage مشابه.
- ذخیرهٔ candle، candidate، review، decision، fill و equity curve.
- resume بعد از restart.
- جلوگیری از duplicate bar و duplicate review.
- dashboard برای open positions، drawdown، rejection reasons و agent decisions.

**خروجی:** Paper-Forward قابل ادامه برای ۳۰، ۹۰ یا ۳۶۵ روز.

## مرحلهٔ ۶ — Ablation، Calibration و نتیجه‌گیری

**هدف:** بفهمیم AI واقعاً ارزش اضافه می‌کند یا فقط تعداد معامله‌ها را کم می‌کند.

سه آزمایش باید با dataset و cost model یکسان اجرا شوند:

1. Rule Base بدون AI
2. Rule Base با Deterministic Council
3. Rule Base با Neural Analyst + Neural Critic + Judge

معیارها:

- تغییر expectancy
- تغییر profit factor
- تغییر max drawdown
- تعداد معاملات حذف‌شده
- تعداد معاملات خوب که اشتباهاً حذف شده‌اند
- precision تأیید Analyst
- veto rate Critic
- calibration confidence
- عملکرد holdout
- عملکرد Paper-Forward

**خروجی:** پاسخ عددی به اینکه AI کجا مفید است و کجا نیست.

## منابع داده‌ای که می‌توانم خودم تهیه و وارد کنم

### ۱. Dukascopy — بهترین گزینهٔ عمومی برای شروع

Dukascopy دادهٔ تاریخی Forex، commodity و index را در CSV و بازه‌های مختلف، از tick تا monthly، ارائه می‌کند. صفحهٔ رسمی Historical Data Export آن برای backtesting طراحی شده است: [Dukascopy Historical Data Export](https://www.dukascopy.com/swiss/english/marketwatch/historical/).

من می‌توانم دادهٔ عمومی آن را دانلود، به UTC تبدیل، validate و با importer پروژه وارد کنم. برای backtest گسترده، این گزینه از Yahoo مناسب‌تر است؛ اما باید تفاوت feed و broker شما در گزارش ثبت شود.

### ۲. HistData — گزینهٔ عمومی برای M1

HistData برای دادهٔ تاریخی Forex در resolution یک دقیقه‌ای مناسب است. من می‌توانم فایل‌ها را دانلود و به 5M، 15M و 1H aggregate کنم؛ اما باید quality و timezone آن جداگانه بررسی شود و نباید آن را دقیقاً feed broker شما فرض کرد.

### ۳. TrueFX — tick واقعی‌تر با registration

TrueFX دادهٔ tick-by-tick و top-of-book با spread fractional ارائه می‌کند، اما دسترسی به دانلود تاریخی به registration رایگان نیاز دارد: [TrueFX Historical Downloads](https://www.truefx.com/truefx-historical-downloads-2/).

من بدون حساب شما نمی‌توانم بخش login/registration را انجام دهم، ولی اگر فایل دانلودشده را بدهید، importer را انجام می‌دهم.

### ۴. cTrader Open API — دقیق‌ترین گزینه برای broker شما

cTrader Open API امکان historical trendbars، historical ticks، live bars و live quotes را فراهم می‌کند. برای trendbars باید account ID، symbol ID، period و بازهٔ زمانی ارسال شود؛ historical tick request نیز محدودیت حداکثر یک هفته برای هر درخواست دارد: [cTrader Symbol Data Documentation](https://help.ctrader.com/open-api/symbol-data/).

برای دسترسی broker-specific به OAuth و account authentication شما نیاز است. من می‌توانم connector و pagination/import را بسازم، اما نباید credential یا حساب شما را حدس بزنم.

### ۵. OANDA و APIهای تجاری

OANDA برای دسترسی API و historical data به API key یا حساب نیاز دارد. پس از دریافت key، می‌توانم downloader امن و importer آن را بسازم. بدون key، اطلاعات broker-specific قابل تضمین نیست.

### ۶. APIهای داخلی Manus

از financial-market API داخلی نیز می‌توان برای OHLCV و تاریخچهٔ بازار استفاده کرد؛ این مسیر برای seed dataset و مقایسه با providerهای دیگر مفید است، اما برای XAUUSD باید symbol mapping و تفاوت spot/futures دقیقاً ثبت شود.

## پیشنهاد عملی برای شروع بدون نیاز به شما

بدون اینکه فعلاً cTrader یا broker را آماده کنید، می‌توانم این مسیر را انجام دهم:

1. تهیهٔ Dukascopy یا HistData برای EURUSD، GBPUSD، USDJPY و XAUUSD/نمونهٔ قابل‌دسترسی.
2. واردکردن M1 یا tick و ساخت 5M، 15M و 1H.
3. اجرای data-quality report.
4. اجرای strategyها روی همان dataset.
5. ساخت مقایسهٔ Rule Base، Deterministic Council و pipeline agentic در browser.
6. آماده‌کردن Paper-Forward بدون broker با storage محلی durable.

## مرزبندی مهم منابع

دادهٔ عمومی می‌تواند سیستم را برای آزمایش آماده کند، اما نتیجهٔ نهایی باید با دادهٔ broker شما دوباره بررسی شود؛ چون تفاوت در spread، timezone، rollover، liquidity و قیمت XAUUSD می‌تواند نتیجه را تغییر دهد.

بنابراین می‌توانم بخش عمدهٔ کار داده را خودم انجام دهم، اما برای ادعای «این همان چیزی است که در cTrader شما رخ می‌دهد» در نهایت به export یا دسترسی مجاز broker شما نیاز داریم.

## جمع‌بندی زمان‌بندی منطقی

- پایان مرحلهٔ ۱: dataset واقعی و قابل import
- پایان مرحلهٔ ۲: strategyهای قابل تست
- پایان مرحلهٔ ۳: بک‌تست و گزارش عمیق
- پایان مرحلهٔ ۴: AI واقعی روی candidateها
- پایان مرحلهٔ ۵: Paper-Forward چند هفته‌ای
- پایان مرحلهٔ ۶: نتیجه‌گیری آماری دربارهٔ اثر AI

نسخهٔ اول قابل استفاده احتمالاً بعد از مراحل ۱ تا ۳ آماده می‌شود؛ نسخه‌ای که ادعاهای AI و Paper-Forward آن قابل دفاع باشد، به مراحل ۴ تا ۶ نیاز دارد.
