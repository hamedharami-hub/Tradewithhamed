# دستور ساخت وب‌اپ معاملاتی با مدل آفلاین داخلی
**نسخه ۴.۰ | ۷ سپتامبر ۲۰۲۶ | همراه طرح Browser AI نسخه ۴.۰**

---

## شروع و ترتیب استفاده
این فایل جایگزین handoff قبلی و Custom Instructions قبلی است. طرح همراه، تمام قواعد محصول را تعریف می‌کند؛ این فایل روش اجرا و کنترل خروجی سازنده است. هر دو فایل جدید را بده؛ نسخه ۳.۰ و دستورهای «native-first» یا «مدل آفلاین فقط بعداً» را از مرجع فعال خارج کن. داشتن دو دستور متناقض عامل کندی است.

در Google AI Studio یک Web project ایجاد کن؛ اگر قبلاً کد ساخته‌ای همان کد را نگه دار و دو فایل را برای migration بده. اتصال خودکار پولی یا حذف مخزن لازم نیست. برای AI Studio هر دو Markdown جدید را Attach کن؛ Word/PDF برای مطالعه خودت است. Custom Instructions زیر را جایگزین متن قبلی کن، سپس پیام آغاز و بعد W1 تا W5 را به ترتیب بده. اگر Attach پشتیبانی نشد متن کامل دو Markdown را با نام فایل و پایان مشخص در چند پیام بفرست و پیش از کامل‌شدن ورودی اجازه build نده.

نام موقت محصول Hamed Trading Lab. ساخت با Gemini در AI Studio، محصول را ملزم به Gemini API نمی‌کند. در برنامه نهایی inference اصلی از مدل دانلودشده در مرورگر است. امکانات GitHub/Node/React/Web به مستند رسمی AI Studio متکی‌اند؛ آزمون WebGPU و آفلاین روی AI Studio Build نهایی HTTPS لازم است.

---

## Custom Instructions جدید؛ متن قابل کپی

```text
Build Hamed Trading Lab using the attached Browser AI v4.0 product plan
and this v4.0 handoff. These replace older native-first, no-browser-AI,
and permanently Demo-only instructions.

Product:
- Persian RTL responsive Web/PWA, Windows and Android browsers.
- Models must download, persist and infer INSIDE the browser.
- No Ollama, LM Studio, Termux, localhost inference server, extension,
  required native app, or hidden cloud AI fallback.
- WebLLM/WebGPU first; compare LiteRT-LM Web Gemma later behind a flag.
- Run one generative model at a time in a dedicated Worker.
- Local AI and cached-data research must work after offline cold reopen.
- Do not promise background execution after browser suspension/termination.
- Implement BACKTEST/PAPER_REPLAY, PAPER_LIVE, BROKER_DEMO and a
  separately gated manual BROKER_LIVE path. Never mix their ledgers.
- Live implementation is in scope; real-money activation is NOT implied.
- Broker Auto is out of scope; automated simulation/backtests are allowed.
- Both devices analyze locally; only the selected session may request
  broker writes through the authenticated gateway.
- Total recurring cost target: AUD 20/month; no paid setup without approval.

Engineering:
- Preserve useful existing work; do not regenerate the app unnecessarily.
- Shared pure TypeScript strategy/risk/ledger core, explicit adapters.
- Build an event-driven simulator shared by Paper and Backtest.
- Model actual spread, fees, latency, gaps and ambiguous intrabar fills.
- No look-ahead, fabricated history, invented results or fake model output.
- Keep credentials and broker authentication server-side.
- Validate environment, authority, risk and freshness on every broker write.
- Persist intent IDs and outbox. Timeout means reconciliation, not retry.
- AI cannot change risk limits, calculate final size or authorize orders.
- Never execute broker orders during coding; the user confirms in the app.

Work efficiently:
- Complete the currently requested work package, including tests and fixes.
- Do not pause for reversible file names, styling or ordinary engineering.
- Ask only for consequential product choices, external authority or cost.
- Missing optional features block only those features, not all development.
- Missing broker credentials block broker verification, not Paper/Backtest.
- Use real evidence; simulated tests and physical-device tests are distinct.
- Do not claim PASS for a test you did not run.
- Pin runtime/model/artifact revisions; main branch is not a release guarantee.
- Keep status, decisions and a compact acceptance checklist up to date.

End each work package with:
Criterion | PASS/FAIL/BLOCKED/NOT RUN | Evidence | Next action
Then: changed files, actual commands/results, mock components,
device checks not run, blocker scope, security/cost impact, next task.
Stop at the package boundary or before external activation needing approval,
not after each file. Never substitute a plan or screenshot for runtime proof.
```

---

## پیام آغاز؛ یک بررسی کوتاه، نه فاز طولانی کاغذبازی

```text
Read the two attached v4.0 files completely. Inspect the existing repository
if one exists. Do not delete, reset or regenerate existing work.
Return a concise migration map with:
1. Existing features to keep.
2. Conflicting native/localhost/cloud-AI assumptions to remove.
3. Browser model runtime and exact artifact candidates to verify.
4. Shared core for Backtest, Paper Replay, Paper Live and broker modes.
5. Server-only cTrader credential/executor boundary.
6. Five work packages and any truly blocking choice.
Do not perform broker actions or start paid services.
Do not demand answers about ordinary reversible implementation details.
Confirm that W1 will prove real browser inference BEFORE broker integration.
```

### حامد چک کند:
سازنده «بدون برنامه واسط» را فهمیده؛ مدل را به API ابری وصل نکرده؛ Paper Live را با Demo بروکر یکی ندانسته؛ Live را نه حذف کرده نه خودکار فعال کرده؛ کل پروژه را به خاطر نبود کلید cTrader متوقف نکرده باشد.

### سؤال کوتاه در صورت ابهام:
> For each mode, identify where data, AI inference, order execution and money reside. Which exact modules can perform broker writes?

---

## W1 — اثبات آفلاین واقعی و مرکز مدل

```text
Implement W1 now in this Web project. Work through in-scope fixes without
asking approval for each file. No broker connection or cloud AI in W1.

Build a responsive Persian PWA shell and a real Model Center:
- capability probe: secure context, WebGPU adapter/features/limits,
  storage estimate and supported persistent cache
- WebLLM in a Dedicated Web Worker, version pinned with a lockfile
- first smoke test with Qwen3.5-0.8B q4f16 MLC if the installed release
  and matching model library actually support it
- documented fallback to a supported Qwen3 model if that exact pairing fails
- verify model registry, tokenizer, weight shards, model library and hashes
- use one real runtime and one resident model first
- consent before large downloads; show actual bytes and separate load progress
- cancel, retry at verified shard boundaries, load, unload, delete model
- separate model cache from journal/settings; never clear unrelated data
- cache the app shell, JS/WASM/runtime dependencies and tokenizer too
- a local sample snapshot plus a prompt field accepting NEW questions
- real generated output, model identity, backend and inference timings
- visible NOT_SUPPORTED, ERROR and OFFLINE_VERIFIED states
- no simulated token streaming as a substitute for inference
- no network inference fallback on failure

Pin a trusted artifact revision rather than mutable main in the final manifest.
Do not hardcode unverified download sizes, hashes or RAM readings.
Detect preview-origin/iframe restrictions; test a stable top-level HTTPS build.
Document any hosting step requiring user approval.

Self-test download interruption, quota failure, missing shard, corrupted hash,
unsupported f16, model unload/reload and cancellation. Verify offline cold
reopen and new generation with network disabled. If physical devices are not
available mark their checks NOT RUN and provide precise manual steps.
Build/test and return the mandatory evidence report.
```

### حامد چه چیزی را امتحان کند؟
* روی لپ‌تاپ و سپس Pixel از داخل برنامه Download بزند؛ برنامه دیگری نصب نکند.
* یک پرسش فارسی تازه بدهد و نام مدل فعال را ببیند.
* پس از پایان دانلود اینترنت را قطع کند، برنامه را ببندد و از همان PWA/URL دوباره باز کند؛ سؤال متفاوت بدهد.
* نمودار/رابط هنگام تولید پاسخ قابل استفاده باشد؛ Stop تولید را متوقف کند.
* مدل را unload و دوباره load کند؛ برای بار دوم دانلود کامل رخ ندهد.
* حذف مدل فقط همان مدل را پاک کند؛ دستگاه دوم cache مستقل داشته باشد.

### از سازنده بپرس:
* Show the actual worker/runtime and model manifest. What evidence proves this answer was generated in the browser without a model API request?
* Which files must be cached for cold offline startup, and which were tested?
* Separate automated desktop checks, viewport tests and physical Pixel tests.

> **Gate W1:** حداقل یک مدل واقعاً روی هر دستگاه هدف اجرا و پس از cold reopen آفلاین پاسخ تازه بدهد. اگر یک دستگاه در دسترس نیست می‌توان W2 را ساخت، اما وضعیت قابلیت آن دستگاه NOT RUN می‌ماند؛ ادعای تحویل کامل آفلاین مجاز نیست.

---

## W2 — هسته مشترک قدرتمند، Paper و Backtest

```text
Implement W2 using the v4.0 plan, especially sections 11, 12, 20 and 21.
No broker writes. Keep the proven browser model path working.

Build a shared event-driven TypeScript engine with injectable Clock,
MarketData, Strategy, Risk, Review, Execution and EventStore ports.
Implement PAPER_REPLAY and BACKTEST with separate account/run namespaces.

Data workbench:
- streaming CSV/JSON import, column/timezone mapping and schema validation
- source/license/range/resolution/hash manifest
- gaps, duplicate/out-of-order, OHLC/bid-ask validation and warm-up report
- closed-candle multi-timeframe aggregation and point-in-time features

Simulation:
- virtual clock, stable event ordering and seeded scenarios
- Market/Limit/Stop with next eligible event semantics and bid/ask costs
- expiry, cancel/replace, SL/TP, trailing and partial exit
- explicit partial-fill/liquidity assumptions, not fake broker queue precision
- latency, slippage, rejection, disconnect and gap scenarios
- pessimistic intrabar SL/TP ambiguity handling plus sensitivity alternatives
- fees, financing, conversion, margin and netting/hedging-aware portfolio ledger
- replay play/pause/step/speed, Paper balance reset with preserved history
- complete trade/evidence/AI/risk/order/fill journal and checkpoint/restore

Research:
- versioned S0-proposed experimental strategy, no profitability claim
- deterministic baseline without AI; candidate-only local AI mode;
  recorded-AI replay mode explicitly labelled
- bounded grid/random parameter search and trial count
- chronological train/validation/holdout and walk-forward
- leakage prevention, applicable purge/embargo and train-only fitting
- cost/latency/parameter stress tests and seeded bootstrap/Monte Carlo
- document possible model training-data contamination in historical AI tests

Reports:
- equity/drawdown, net return, expectancy in R, sample counts, payoff,
  profit factor, MAE/MFE, exposure, costs and per-session/symbol breakdown
- explicit formulas/annualization and undefined metrics when not meaningful
- run comparison, clickable trade trace, CSV trades and JSON run exports
- worker jobs, bounded memory/trials, pause/resume/cancel and real progress

Test golden fills/ledger, spread not counted twice, gaps, ambiguous candles,
look-ahead, pivot availability, idempotent replay and export/import.
Demonstrate a completed walk-forward and stress run, not just UI controls.
Never block this package because cTrader credentials are missing.
Return the mandatory evidence report with unfinished subfeatures clearly listed.
```

### حامد چه چیزی را امتحان کند؟
* یک dataset کوچک وارد کند؛ timezone و gapها را ببیند.
* Replay را کندل‌به‌کندل جلو ببرد و زمان شناخته‌شدن swing را ببیند.
* یک معامله Paper باز کند؛ SL/TP، لغو، هزینه و موجودی در journal مشخص باشند.
* دو بار همان Backtest با seed یکسان را اجرا کند؛ رویدادهای core و نتیجه یکسان باشد.
* slippage/commission را بیشتر کند و اثر آن در نتایج قابل توضیح باشد.
* مثال لمس هم‌زمان SL و TP، سیاست محافظه‌کارانه و برچسب uncertainty داشته باشد.
* walk-forward، مقایسه run و export واقعاً خروجی داشته باشند، نه صفحه خالی.

### از سازنده بپرس و بخواه خودش بررسی کند:
* Trace one order from decision timestamp to its first eligible fill.
* Prove there is no future candle access. Show the golden accounting test.
* Which fill assumptions are measured, broker-specific or only simulated?
* Show train/validation/holdout boundaries and total optimization trials.
* Run the W2 acceptance tests and fix confirmed failures in scope.

> **Gate W2:** حسابداری و fill پایه و no-look-ahead و replay قطعی و گزارش‌های پژوهش کار کنند. سود زیاد شرط عبور نیست. هیچ function ارسال broker در مسیر simulator نباشد.

---

## W3 — مقایسه مدل و اتصال AI به تحقیق

```text
Implement W3 without replacing the existing architecture.
Use the model benchmark protocol in v4.0 sections 4 and 10.

Compare supported exact artifacts for Qwen3.5 0.8B/2B/4B and a Qwen3 fallback.
Add lazy-loaded LiteRT-LM Web for Gemma 4 E2B, then optionally E4B if capacity
allows. Use the -web.litertlm artifacts documented for the JS API;
do not use Android/native/NPU files or promise unsupported modalities.
Treat the LiteRT-LM JS API as Early Preview.

Build the fixed 120-case evaluation corpus with explicit labels and a holdout.
Measure Persian comprehension, snapshot grounding, schemas, abstention,
adversarial inputs, latency, offline reload, device loss and sustained use.
Do not fabricate the results or equate vendor benchmarks with this hardware.

Integrate Analyst and Critic as sequential roles with schema/evidence checks.
One resident generative model only. No hidden cloud fallback.
Record model/prompt/runtime/revision and snapshot hashes per review.
Make missing/invalid/late reviews explicit. AI cannot override risk or size.
Add strategy-only versus strategy-plus-AI run comparison.
Keep backtests candidate-triggered; never invoke the LLM on every tick.

Select a model per device only from actual evidence. If none meets quality,
keep AI-assisted broker intent blocked while research tools remain usable.
Provide a plain Persian result summary and the full evidence report.
```

### کنترل و سؤال حامد:
مدل 4B نباید فقط به علت RAM اسمی «تأییدشده برای گوشی» معرفی شود. جدول latency، خطای شواهد و آزمون آفلاین برای هر مدل جدا باشد. پرسش فارسی و snapshot دارای داده ناقص را امتحان کن.
* Which model won on each device and on what measured evidence?
* Show a case where the model correctly abstained and one where the validator rejected a hallucinated evidence ID. What remains NOT RUN?

> **Gate W3:** انتخاب مدل واقعاً سنجیده یا صریحاً provisional؛ نبود آزمون دستگاه مانع توسعه بخش‌های دیگر نیست، اما ادعای AI production-ready ممنوع.

---

## W4 — آنلاین: Paper Live، Demo و مسیر دستی Live

```text
Implement W4 in three internal gates without pausing for ordinary code edits.
Use v4.0 sections 6, 12, 13, 20, 22 and 23 as authority.

Gate A: read-only market/account connection and PAPER_LIVE.
- server-only cTrader application/OAuth/account authentication and tokens
- secure session cookies, OAuth state, CSRF/origin and redirect validation
- explicit environment/account mapping; no credentials in browser or logs
- symbol metadata, bid/ask, quote/bar subscription, heartbeat and reconnect
- expose stale/gap/unknown data and recover before continuing
- PAPER_LIVE uses the same simulated execution/ledger as W2 with live data
- clear LIVE DATA + SIMULATED FILLS badge; zero broker writes
- keep BACKTEST/PAPER_REPLAY usable when connection is blocked

Gate B: broker intent preparation without submission.
- approved strategy/risk settings and calendar coverage for the session
- fresh account/quote/cost/conversion data and valid AI review where required
- complete final order preview and immutable intent/confirmation version
- local draft outbox; server durable outbox and unique intent keys
- single selected executor enforced server-side with atomic epoch checks
- no heartbeat-only takeover; unknown in-flight state requires reconciliation

Gate C: controlled broker adapters.
- implement DEMO write for one verified order type first
- construct a separate manual LIVE path, server flag disabled by default
- separate endpoints, accounts, allowlists, ledgers and settings by environment
- DEMO path must reject LIVE; LIVE path must reject DEMO/mismatched accounts
- manual user confirmation for every broker order; no broker Auto
- check fresh authority/risk/expiry again immediately before broker write
- duplicate click/refresh protection; timeout => UNKNOWN_RECONCILE_REQUIRED
- no blind retry; reconcile orders/deals/positions and broker IDs
- verify SL/TP and handle partial fill and PROTECTION_FAILED explicitly
- kill-new-entries control; closing positions is a separate explicit action
- inactive/hidden session cannot generate fresh broker entries
- old epochs cannot write after handoff
```

### حامد قبل و بعد از اتصال چه چیزی را چک کند؟
* login فقط از صفحه رسمی بروکر؛ secret فقط در Secrets، نه prompt یا screenshot.
* Paper Live قیمت تازه دارد ولی هیچ order/deal جدید در خود cTrader ایجاد نمی‌کند.
* رفرش یا تغییر Paper به Demo موجودی‌ها را با هم مخلوط نمی‌کند.
* دو دستگاه تحلیل می‌کنند؛ فقط منتخب اجازه درخواست broker write دارد.
* پیش از اولین Demo Confirm: محیط، حساب ماسک‌شده، نماد، حجم، SL/TP، هزینه و ریسک درست باشد.
* پس از Confirm: broker ID و محافظ در خود cTrader بررسی شود؛ رفرش سفارش دوم نسازد.
* Live پیش‌فرض خاموش و حساب‌ها جدا باشند؛ هیچ دکمه آزمایشی پنهان bypass نکند.

> **Gate W4:** اتصال مجاز Paper Live؛ Demo با شاهد تأیید دستی؛ Live کدنویسی‌شده و جدا و خاموش تا پذیرش. یک chart آنلاین یا build سبز، موفقیت order lifecycle را ثابت نمی‌کند.

---

## W5 — بلوغ محصول، کنترل کیفیت و انتقال

```text
Complete W5 as an integrated release, not another architecture rewrite.
Review all v4.0 requirements and complete missing in-scope Paper/Backtest
features from W2: walk-forward, stress tests, run comparison, accounting,
checkpoint/restore and data-quality reports.

Verify the entire chain:
download -> cold offline model inference -> historical data -> features ->
Paper/Backtest -> AI review -> live data -> Paper Live -> broker intent ->
user-confirmed Demo -> reconciliation. Keep Live activation separately gated.

Test Windows and physical Pixel where available, including folded/unfolded
layout, offline restart, quota/cache eviction, GPU device loss, long sessions,
cancel/restore jobs, multi-tab/model contention and device handoff.
Do not run heavy backtests concurrently with an active broker session by default.

Prepare portable source control: README, lockfile, .env.example names only,
.gitignore, versioned manifests and reproducible build/test commands.
No weights, caches, secrets or personal account data in Git.
Use the configured GitHub connection only within user authorization; otherwise
export the code and document the manual import. Do not invent a commit or deploy.

Deliver docs/status, decisions, device-evals, security-boundary and release
checklist with WORKING / LIMITED / DISABLED / BLOCKED features.
Provide install/use/backup/restore instructions and a cost report.
Fix confirmed in-scope issues and rerun affected checks.
Return the mandatory evidence report and the next smallest useful action.
```

### چک نهایی حامد:
* از داخل برنامه مدل دانلود و آفلاین اجرا شود؛ Ollama یا API ابری لازم نباشد.
* Demo، Paper Live، Backtest، Paper Replay و Liveِ غیرفعال از هم مشخص باشند.
* گزارش backtest شامل هزینه، gap، تعداد نمونه، روش fill و محدوده داده باشد.
* journal و import/export و restart سالم باشند؛ تغییر mode سابقه را خراب نکند.
* نمودار و دکمه‌های فارسی روی Pixel Fold قابل استفاده باشند.
* فایل کد قابل export و build مجدد باشد؛ repo فقط پروژه و داده تست غیرحساس را داشته باشد.
* حالت‌های تست‌نشده مشخص باشند؛ هیچ ادعای سود تضمینی وجود نداشته باشد.

---

## مدیریت توقف‌ها و طبقه‌بندی مسدودکننده‌ها (Blocker Taxonomy)
* **DEV_BLOCKER:** فقط خطایی که build یا تست پایه را خراب می‌کند؛ رفع و ادامه خودکار داخل بسته.
* **FEATURE_BLOCKER:** مدل یا feed خاص در دسترس نیست؛ همان قابلیت محدود، بقیه برنامه ادامه.
* **DEMO_WRITE_BLOCKER:** scope/account/secret/risk/reconciliation broker فقط نامعلوم؛ write بسته، simulator فعال.
* **LIVE_ACTIVATION_BLOCKER:** تأیید یا آزمون لازم برای پول واقعی ناقص؛ مسیر کد ساخته می‌شود ولی Live ارسال نمی‌کند.

### وقتی فقط UI ساخته ولی قابلیت واقعی ندارد:
The screen alone does not meet the acceptance criteria. Trace the real runtime path and identify every placeholder or mock. Implement the missing in-scope behavior, run the relevant checks and report PASS only with evidence. Preserve already working modules.
