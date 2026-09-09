# ممیزی عمیق تکمیل پروژه، AI Agentic، بک‌تست و Paper-Forward

## حکم اجرایی

**پروژه از نظر زیرساخت و مسیر ایمن، قابل استفاده است؛ اما هنوز از نظر هدف نهایی شما «کاملاً تکمیل» نیست.** مهم‌ترین مرز این است که چهار نقش agent و promptهای آن‌ها اکنون تعریف و به gate پژوهشی متصل شده‌اند، ولی اجرای واقعی مدل عصبی WebLLM از داخل API سمت سرور به‌صورت خودکار ممکن نیست؛ WebGPU و مدل resident در مرورگر کاربر قرار دارند. بنابراین Paper-Forward سروری فعلی با configuration پیش‌فرض از فیلترهای deterministic استفاده می‌کند و در صورت انتخاب Neural WebGPU، تا زمان اجرای browser-side review به‌درستی `REVIEW_REQUIRED` می‌دهد.

این ممیزی دو اصلاح مهم را نیز پیدا و اجرا کرد: **ارسال واقعی evidence packet به‌عنوان user prompt مدل** و **جلوگیری از اجرای Paper-Forward پیش از پایان Analyst/Critic/Judge**. همچنین Judge اکنون hard risk flagهای مدل و نبود evidence را veto می‌کند.

## وضعیت هدف‌ها

| هدف کاربر | وضعیت فعلی | حکم |
|---|---|---|
| داشتن دادهٔ تاریخی زیاد و قابل ورود | importer Yahoo و CSV، manifest و کنترل کیفیت موجود است | زیرساخت آماده؛ دادهٔ broker بلندمدت هنوز باید وارد شود |
| بک‌تست عمیق بر اساس سال، روز، ساعت، سشن و regime | موتور و attribution زمانی/رژیمی موجود است | قابل اجرا؛ اعتبار آماری نتیجه هنوز نیازمند دادهٔ بیشتر و holdout است |
| جلوگیری از look-ahead و same-bar fill | signal از کندل بسته و fill از کندل بعدی طراحی شده و تست دارد | در حد bar درست؛ tick-level هنوز موجود نیست |
| مقایسهٔ rule base با AI | سه حالت OFF، deterministic council و WebLLM advisory وجود دارد | مقایسهٔ واقعی neural هنوز انجام نشده است |
| چهار agent | Scanner، Analyst، Critic، Judge واقعاً در قرارداد و gate وجود دارند | کامل از نظر معماری؛ Scanner/ Judge عمدتاً deterministic هستند |
| promptهای نقش‌محور | `agent-prompts-v1` و evidence packet اضافه شده | prompt اکنون واقعاً به مدل ارسال می‌شود؛ calibration هنوز باقی است |
| جلوگیری از hallucination | JSON parse، confidence clamp، fail-closed و Judge veto موجود است | خوب، اما مدل هنوز باید روی corpus واقعی ارزیابی شود |
| اتصال به Paper Trading | `PAPER_REPLAY` و API ingest وجود دارد | شبیه‌سازی بدون broker آماده؛ worker دائمی و ذخیره‌سازی durable باقی است |
| اجرای واقعی مدل آفلاین در Paper-Forward | browser WebGPU runtime آماده است | از API سروری مستقیماً کامل نیست؛ browser-side orchestrator لازم است |
| اثبات سوددهی | هنوز هیچ اثباتی وجود ندارد | عمداً انجام نشده؛ باید train/validation/holdout و walk-forward انجام شود |

## چهار agent دقیقاً چه می‌کنند؟

### Scanner

در مسیر research ابتدا candidate با rule base ساخته می‌شود. Scanner اکنون وجود شواهد Sweep و در سبک S0+FVG وجود FVG را بررسی می‌کند. این نقش برای سرعت و reproducibility بهتر است deterministic بماند. مدل زبانی نباید جای محاسبهٔ دقیق swing، ATR یا FVG را بگیرد.

### Analyst

مدل باید context، جهت، شواهد هم‌راستا و uncertainty را بررسی کند. Evidence packet شامل candidate، ruleهای لازم، `isClosedCandle`، `noLookahead` و شناسه‌های شواهد است. اکنون این packet هم در system prompt و هم در user prompt به runtime داده می‌شود.

### Critic

وظیفهٔ آن تأیید دوباره نیست؛ باید فعالانه معامله را رد کند. تضادها، R:R ضعیف، spread، خبر، regime ناسازگار، ورود دیرهنگام و شواهد مفقود باید در riskFlags قرار بگیرند.

### Judge / Risk Guardian

این همان سیستم چهارم است. Judge قطعی باید مدل را override کند و در هر اختلاف، JSON نامعتبر، نبود شواهد، confidence پایین، R:R پایین یا hard risk flag، `NO_TRADE` بدهد. مدل زبانی نباید Judge نهایی باشد.

## اصلاحات مهمی که در این ممیزی انجام شد

### 1. رفع خطای prompt ناقص

قبل از این ممیزی، `agentic-reviewer` prompt نقش را می‌ساخت، اما فقط `systemPrompt` به مدل ارسال می‌شد و `userPrompt` حاوی evidence packet ارسال نمی‌شد. اکنون هر دو ارسال می‌شوند. بدون این اصلاح، مدل عملاً candidate و شواهد کامل را دریافت نمی‌کرد.

### 2. رفع اجرای Paper قبل از AI review

قبل از اصلاح، `ingestClosedBarWithAgents` ابتدا `ingestClosedBar` را صدا می‌زد و ممکن بود اجرای `PAPER_REPLAY` پیش از Analyst/Critic/Judge اتفاق بیفتد؛ سپس نتیجهٔ agentic دوباره محاسبه می‌شد. این رفتار برای هدف شما نادرست بود. اکنون agentic ingest ابتدا فقط کندل را validate و ذخیره می‌کند، بعد review را انجام می‌دهد و فقط candidateهای تأییدشده را replay می‌کند.

### 3. تقویت Judge

Judge اکنون این flagها را hard veto می‌کند:

- `HIGH_IMPACT_NEWS`
- `SPREAD_LIMIT_EXCEEDED`
- `INVALID_MARKET_PRICE`
- `INVALID_MODEL_OUTPUT`
- `INVALID_MODEL_JSON`
- `MODEL_NOT_RESIDENT`
- `UNMAPPED_AGENT_MODEL`
- نبود evidence ID در هر دو review

## شکاف‌های واقعی باقی‌مانده

### شکاف اول: اجرای WebLLM در مرز browser/server

WebLLM و WebGPU در مرورگر کاربر اجرا می‌شوند. API route در Next.js روی server اجرا می‌شود و به مدل resident در مرورگر دسترسی ندارد. در نتیجه اگر paper-forward از API سروری بخواهد Neural Analyst/Critic را اجرا کند، مدل `MODEL_NOT_RESIDENT` می‌دهد و Judge آن را رد می‌کند.

این bug پنهان نیست؛ fail-closed است، اما هدف «Paper-Forward با AI عصبی واقعی» هنوز نیاز به یک orchestrator سمت مرورگر دارد:

```text
Browser closed-bar feed
  → browser-side candidate generation
  → WebLLM Analyst
  → WebLLM Critic
  → deterministic Judge
  → POST approved candidate + evidence hash to server paper ledger
```

مسیر درست بعدی این است که browser review نتیجهٔ signed/hashed خود را به سرور بفرستد؛ server نباید به متن آزاد مدل اعتماد کند.

### شکاف دوم: دوام Paper-Forward

`PaperForwardRunner` از `globalThis Map` استفاده می‌کند. این برای demo و یک process محلی مناسب است، اما در serverless یا restart داده‌ها از بین می‌رود و با چند instance سازگار نیست. برای آزمایش چند هفته یا چند ماه باید paper bars، candidate reviews، decisions و fills در SQLite/Postgres یا storage durable ذخیره شوند.

### شکاف سوم: candidate review کامل برای همهٔ variantها

مسیر فعلی agentic paper-forward از `run.state.strategyVariants[0]` review می‌گیرد. اگر چند style هم‌زمان فعال شوند، تنها variant اول واقعاً از چهار agent عبور می‌کند. برای هدف مقایسهٔ سبک‌ها باید برای هر variant candidate مستقل، evidence packet مستقل و review مستقل ساخته شود.

### شکاف چهارم: cache و audit مدل

Review candidate cache می‌شود، اما ذخیرهٔ کامل زیر هنوز به‌صورت durable و قابل گزارش وجود ندارد:

- prompt hash
- evidence packet hash
- model artifact revision
- raw model output
- parsed output
- latency
- model verification state

بدون این‌ها مقایسهٔ علمی دو مدل دشوار است.

### شکاف پنجم: ارزیابی آماری AI

هنوز نمی‌توان گفت AI چند درصد بهتر است. برای این نتیجه باید سه مسیر با dataset و cost model یکسان اجرا شوند:

1. `Rule Base → Execution`
2. `Rule Base → Deterministic Council → Execution`
3. `Rule Base → Analyst → Critic → Judge → Execution`

سپس روی train، validation، holdout و walk-forward جداگانه مقایسه شوند. confidence مدل نیز باید calibration شود؛ عدد confidence خام مدل معیار احتمال موفقیت نیست.

### شکاف ششم: کیفیت دادهٔ واقعی بلندمدت

دادهٔ Yahoo برای تست فنی مناسب بود، ولی برای نتیجه‌گیری حرفه‌ای باید export واقعی همان broker و instrument وارد شود. به‌خصوص:

- XAUUSD spot نباید با `GC=F` جایگزین شود.
- spread و commission باید از broker واقعی گرفته شود.
- swap و session closure باید اضافه شود.
- دادهٔ 5M/15M حداقل 6 تا 12 ماه برای intraday لازم است.
- برای fill دقیق‌تر، tick یا bid/ask لازم است.

### شکاف هفتم: تعریف strategyها هنوز محدود است

نسخهٔ research فعلی عملاً سه variant قابل اجرا دارد: Sweep، Sweep+FVG و Mean Reversion. سبک‌های BOS/Order Block و Equilibrium در catalog وجود دارند، اما هنوز به همان عمق در `research/strategy-rules.ts` پیاده نشده‌اند. وجود آن‌ها در UI یا contract نباید به‌معنای بک‌تست کامل تلقی شود.

### شکاف هشتم: مدل هزینه و حجم

مدل spread/slippage/commission برای baseline وجود دارد، اما برای broker واقعی هنوز swap، bid/ask asymmetry، minimum lot، lot step، contract specification و fill latency وارد نشده است. این موضوع می‌تواند نتیجهٔ strategy را عوض کند.

## نتیجهٔ Go / No-Go

### Go برای این کارها

- ورود CSV واقعی
- اجرای بک‌تست deterministic
- تقسیم‌بندی بر اساس زمان، session و regime
- اجرای Paper Replay بدون broker
- اجرای browser-side AI advisory آزمایشی روی candidateهای shortlist
- مقایسهٔ اولیهٔ مدل‌ها روی dataset کوچک

### No-Go برای این کارها

- ادعای سوددهی
- اجرای Paper-Forward بلندمدت با `globalThis Map` به‌عنوان storage اصلی
- ادعای اینکه API سروری اکنون WebLLM آفلاین واقعی را اجرا می‌کند
- فعال‌کردن هم‌زمان چند style در agentic paper بدون تکمیل review مستقل هر style
- هر نوع معاملهٔ واقعی

## اولویت دقیق کارهای باقی‌مانده

1. ساخت browser-side Agentic Orchestrator که مدل resident را واقعاً اجرا کند و خروجی hash‌شده به Paper Ledger بفرستد.
2. ساخت durable Paper Ledger و ذخیرهٔ candle، candidate، prompt hash، model revision، review و fill.
3. اصلاح agentic engine برای اجرای مستقل همهٔ strategy variantها.
4. واردکردن CSV واقعی broker و کالیبراسیون spread، commission، swap و bid/ask.
5. اجرای سه ablation برابر روی train/validation/holdout.
6. سپس Paper-Forward حداقل 30 تا 90 روزه؛ قبل از آن هیچ نتیجهٔ AI قابل اتکا نیست.

## اعتبارسنجی ممیزی

- `npm run typecheck` موفق
- `npm test` موفق: **18 suite / 99 check / 0 failure**
- `npm run lint` موفق

## پاسخ نهایی به سؤال «آیا کامل است؟»

**از نظر اسکلت، safety gate، rule-based research، prompt contract و مسیر Paper Replay: بله، آمادهٔ استفادهٔ اولیه است.**

**از نظر هدف نهایی شما—یعنی اینکه مدل آفلاین واقعی روی candidateهای rule-filtered در Paper-Forward تصمیم تأییدی بدهد و اثرش با baseline سنجیده شود—هنوز سه کار اصلی باقی مانده است:** browser-side orchestration، ذخیره‌سازی durable audit، و اجرای ablation/holdout روی دادهٔ واقعی broker.
