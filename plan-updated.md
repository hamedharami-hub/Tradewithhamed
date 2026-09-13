# نقشه راه به‌روز‌شده Tradewithhamed پس از دریافت تغییرات GitHub

## تحلیل وضعیت فعلی و نقاط حساس پروژه

### مبنای بررسی و نتیجه کلی

- مخزن از GitHub با fast-forward از `c31be8a` به `9f6d7c1` به‌روز شد؛ شاخه `main` با `origin/main` همگام است.
- نسخه تازه شامل ۷ کامیت و ۳۹ فایل تغییرکرده است. تغییر اصلی، افزودن داده‌های ۲۰۲۵، تایم‌فریم‌های M1 تا D1، توسعه کاتالوگ مدل‌ها و نقش‌های شورای چهارعاملی، و اضافه‌شدن سبک‌های `SCALP_M1_M5`، `SWING_MACRO` و `TREND_BREAKOUT` است.
- کنترل‌های پایه موفق‌اند: `npm run test:domain` با ۳۲ suite و ۱۷۰ check، `npm run typecheck`، `npm run lint` و production build در Next.js 16.3.4. اجرای محلی نیز بدون خطای console انجام شد.
- موفقیت این کنترل‌ها به معنی معتبر بودن داده intraday، اجرای واقعی مدل‌های عصبی، اتصال cTrader یا آمادگی تولید نیست. بررسی منبع و رفتار واقعی چند ایراد مهم نشان داد که آزمون‌های فعلی آن‌ها را نمی‌گیرند.
- هدف این برنامه همچنان «پژوهش معتبر + اتصال واقعی به cTrader Demo» است. معامله live با پول واقعی باید خارج از دامنه و مسدود بماند.

### تغییرات مثبت نسخه جدید

- انتخاب سال ۲۰۲۴/۲۰۲۵ و تایم‌فریم‌های D1، H4، H1، M15، M5 و M1 به رابط بک‌تست اضافه شده است.
- cache داده اکنون سال را در کلید خود لحاظ می‌کند و cutoffهای H2/Q4 از سال dataset محاسبه می‌شوند.
- mapping سبک‌های جدید در `MultiStyleBacktester` از aliasهای مبهم به شناسه رسمی اصلاح شده است.
- fallback نقش‌های شورا بر اساس `role` انجام می‌شود و وابستگی به index آرایه کاهش یافته است.
- انتخاب موتورهای مستقل برای scanner، analyst، critic و judge در رابط قابل مشاهده است و انتخاب موتور عصبی در مسیر همگام، ارسال سفارش را fail-closed مسدود می‌کند.
- پوشش تست شورای چندعامل از ۵ به ۶ check افزایش یافته است.

### یافته‌های بحرانی جدید

1. **داده‌های intraday سال ۲۰۲۵ واقعی نیستند.** فایل `scripts/generate-2025-datasets.ts` کندل روزانه Yahoo را با الگوی ریاضی ثابت به H4، H1، M15، M5 و M1 تقسیم می‌کند. این داده باید `SYNTHETIC_DAILY_INTERPOLATION` نام‌گذاری شود و برای سنجش edge، slippage، session، liquidity sweep یا اجرای M1/M5 معتبر تلقی نشود.
2. **تولید OHLC، محدوده روزانه منبع را نقض می‌کند.** در بررسی H4، تعداد ۱۰۰۱ کندل EURUSD، ۱۰۰۹ کندل GBPUSD، ۱۰۴۵ کندل USDJPY و ۶۸۹ کندل XAUUSD high یا low خارج از high/low کندل روزانه اصلی داشتند. بنابراین حتی سازگاری حسابداری داده مصنوعی نیز برقرار نیست.
3. **حجم معاملات مصنوعی است.** برای EURUSD، GBPUSD و USDJPY تمام ۲۵۷ روز مقدار حجم پیش‌فرض ۱۰۰۰ گرفته‌اند؛ سپس این حجم میان کندل‌های مصنوعی تقسیم شده است. این حجم نباید برای microstructure، نقدینگی یا فیلتر کیفیت استفاده شود.
4. **گزینه «M1 سال کامل» فقط حدود ۲۶ روز است.** هر فایل M1 دقیقاً ۲۵٬۰۰۰ کندل از `2025-12-05 15:20Z` تا `2025-12-31 23:59Z` دارد، اما رابط هم‌زمان «۱ ساله کامل ۲۰۲۵ (۳۶۵ روز)» نمایش می‌دهد. این تناقض مستقیم در UI مشاهده شد.
5. **M5/M15 کامل نیز برای اجرا بی‌صدا بریده می‌شوند.** `multi-style-backtest-modal.tsx` هر dataset بزرگ‌تر از ۲۵٬۰۰۰ کندل را با `slice(-25000)` محدود می‌کند، ولی تعداد و بازه کامل را در سرصفحه نشان می‌دهد. گزارش می‌تواند نتیجه چند ماه پایانی باشد و به‌اشتباه نتیجه یک سال کامل تفسیر شود.
6. **fallback منبع داده پنهان است.** اگر فایل ۲۰۲۵ پیدا نشود، loader فایل ۲۰۲۴ را زیر cache key سال ۲۰۲۵ برمی‌گرداند؛ اگر آن هم شکست بخورد fixture کوتاه 5M را بازمی‌گرداند. UI provenance و سال واقعی را دریافت نمی‌کند و ممکن است برچسب ۲۰۲۵ روی داده ۲۰۲۴ یا fixture دیده شود.
7. **تست جدید اجرای عصبی را اثبات نمی‌کند.** check با عنوان `14B & Dense Engine Pipeline Execution` فقط تأیید می‌کند engine ID انتخاب‌شده در نتیجه نوشته شده است. `MultiAgentOrchestrator.evaluateCandidate()` همگام و کاملاً deterministic است و `evaluateLoadedWebLLMAgent()` را فراخوانی نمی‌کند. بنابراین عبارت «پردازش موفق DeepSeek/Phi/Llama» در تست دقیق نیست.
8. **رابط شورای AI بیش از رفتار واقعی ادعا می‌کند.** متن «هر ۴ ایجنت هم‌زمان فعال هستند» و «تلفیق کامل موتورهای مکانیکی و عصبی» نمایش داده می‌شود، درحالی‌که موتورهای عصبی انتخاب‌شده در pipeline اصلی اجرا نمی‌شوند و فقط باعث مسدودشدن approval می‌شوند. عبارت «مدل عصبی فعال» نیز برای موتور deterministic S0 نمایش داده شد.
9. **کاتالوگ با runtime مساوی نیست.** ثبت نام یک مدل در `PLAN_V4_MODELS` یا `AGENT_ENGINE_OPTIONS` اثبات نمی‌کند artifact در WebLLM registry موجود، با WebGPU دستگاه سازگار، دانلودشده یا resident است. Chrome Gemini Nano نیز در manager فعلی صریحاً unimplemented است ولی در فهرست نقش‌ها با متن «۰MB» عرضه می‌شود.
10. **اجرای بک‌تست هنوز روی thread اصلی است.** `setTimeout` فقط شروع محاسبه را عقب می‌اندازد؛ `runBacktest` همچنان synchronous است و در datasetهای بزرگ می‌تواند رابط را freeze کند. سقف ۲۵٬۰۰۰ این مشکل و نبود progress/cancel واقعی را حل نمی‌کند.
11. **اندازه repository و deployment افزایش یافته است.** فقط فایل‌های ۲۰۲۵ حدود ۳۱٫۳MB هستند. نگه‌داشتن CSVهای مصنوعی در `public/` باعث انتقال به هر deployment و دانلود مستقیم client می‌شود؛ cache policy، compression، manifest و integrity تعریف نشده است.
12. **کیفیت patch کامل نیست.** `git diff --check` یک trailing whitespace در `scripts/generate-2025-datasets.ts:39` گزارش می‌کند. lint آن را تشخیص نمی‌دهد؛ CI باید `git diff --check` یا formatter check داشته باشد.

### یافته‌های رابط در اجرای واقعی

- در desktop با viewport `1280×720` صفحه بارگذاری شد، محتوای معنادار داشت و console error/warn مرتبط مشاهده نشد؛ ۳۹ مورد از ۵۳ button کوچک‌تر از ۴۴ پیکسل بودند.
- در mobile با viewport `390×844` تعداد ۳۶ button کوچک‌تر از ۴۴ پیکسل و ۷ کنترل خارج از viewport مشاهده شد. document افقی از viewport بزرگ‌تر نبود، اما کنترل‌های toolbar در لحظه مشاهده clipped بودند.
- هدر همچنان `ONLINE`، `cTrader Demo` و قیمت/موجودی نمونه را نشان می‌دهد، حتی وقتی اتصال broker اثبات نشده است. این مهم‌ترین ریسک اعتماد کاربر در رابط است.
- صفحه بک‌تست برای M1 عبارت «سال کامل ۲۰۲۵» را کنار بازه واقعی ۵ تا ۳۱ دسامبر نشان می‌دهد.
- پنل شورا متن «مدل عصبی فعال» را کنار «موتور محاسباتی قطعی S0» نشان می‌دهد که از نظر معنا ناسازگار است.
- برخی دکمه‌های icon-only، از جمله close modal، نام accessible مشخص ندارند.

### موارد نقشه قبلی که هنوز حل نشده‌اند

- OAuth هنوز state را به‌شکل یک‌بارمصرف ذخیره و مقایسه نمی‌کند؛ state با `Math.random` ساخته می‌شود و callback همچنان `client_secret` را در query string قرار می‌دهد.
- توکن OAuth در cookie با gateway مبتنی بر `CTRADER_ACCESS_TOKEN` محیط یکپارچه نشده است؛ ورود موفق به معنی اتصال worker نیست.
- `PersistentStore`، executor و بخشی از OMS همچنان فایل/حافظه‌ای هستند و برای serverless چندنمونه‌ای ایمن نیستند.
- `GET /api/orders/outbox` و `GET /api/journal` هنوز باید از نظر احراز هویت، scope و redaction اصلاح شوند.
- `demo-execution-bridge.ts` هنوز symbol ID ثابت فقط برای XAUUSD و EURUSD دارد.
- `live-market-feed.ts` random walk تولید می‌کند، درحالی‌که UI واژه‌های live/online به‌کار می‌برد.
- gateway دائمی هنوز از runtime کوتاه‌عمر Next.js جدا نشده است.
- از ۴۶ فایل test موجود در `lib/**/__tests__` فقط ۳۲ فایل در `scripts/run-domain-tests.ts` اجرا می‌شوند. ۱۴ فایل، از جمله operator session، cTrader security، multi-style backtester/regimes و W4 online، در gate اصلی نیستند.
- endpoint `/api/verify-tests` همچنان بخشی از برنامه production build است و آزمون‌ها را در process برنامه اجرا می‌کند.
- `app/page.tsx` و چند workspace/modal بزرگ‌اند؛ state، network polling و rendering به‌طور کافی تفکیک نشده‌اند.
- مدل persistence مشترک، distributed rate limiting، transaction outbox، worker lease، observability و restore drill هنوز پیاده نشده‌اند.

### معماری مقصد

- **Frontend/BFF:** Next.js روی Firebase App Hosting؛ فقط UI، session و API کنترل‌شده.
- **Gateway worker:** سرویس مستقل Cloud Run با CPU همیشه فعال، `minInstances=1`، اتصال پایدار cTrader Demo، reconnect، heartbeat و reconciliation.
- **پایگاه داده:** Cloud SQL PostgreSQL برای OAuth sessions، token metadata رمز‌شده، order intent، outbox، journal، audit، reconciliation، kill switch و lease.
- **هماهنگی سریع:** Memorystore Redis برای rate limit، heartbeat و lease کوتاه؛ صحت نهایی سفارش در PostgreSQL با unique constraint و transaction حفظ شود.
- **Secrets:** Google Secret Manager؛ هیچ secret در client، URL، repository یا log نباشد.
- **داده پژوهش:** فایل‌های واقعی historical در object storage/CDN با manifest و checksum؛ داده مصنوعی در namespace جدا و فقط برای test/demo الگوریتم.

### معیار پذیرش نسخه پژوهش و Demo

- هر dataset دارای `sourceKind`، license، بازه واقعی، timezone، timeframe، row count، gaps و SHA-256 باشد.
- UI هرگز dataset مصنوعی، fallback یا بریده‌شده را «سال کامل تاریخی» ننامد.
- گزارش بک‌تست دقیقاً `requestedRange` و `executedRange`، تعداد کندل ورودی و پردازش‌شده، seed و engine version را ثبت کند.
- موتور عصبی فقط پس از اجرای واقعی artifact resident و دریافت خروجی schema-valid، در گزارش با مدل/revision/latency ثبت شود؛ انتخاب dropdown معیار اجرا نیست.
- `ONLINE` فقط با heartbeat و quote واقعی تازه از حساب cTrader Demo نمایش داده شود.
- ارسال سفارش فقط در `READY_DEMO_EXECUTION` و پس از OAuth، account binding، lease، kill switch، quote freshness، reconciliation و risk gate مجاز باشد.
- پژوهش آفلاین هنگام قطع broker ادامه یابد، اما وضعیت داده و execution به‌وضوح جدا باشد.

## مسیر دقیق فایل‌هایی که باید تغییر کنند یا فایل‌های جدیدی که باید ساخته شوند (File Paths)

### اصلاح فوری داده و بک‌تست

| مسیر | اقدام لازم |
|---|---|
| `scripts/generate-2025-datasets.ts` | توقف انتشار داده تولیدی به‌عنوان historical؛ اصلاح invariantهای OHLC؛ تولید فقط با برچسب synthetic و manifest؛ حذف trailing whitespace |
| `public/historical/intraday/histdata-*-2025.csv` | حذف از catalog داده واقعی یا انتقال به `public/synthetic/daily-interpolation/`؛ جایگزینی با داده معتبر vendor در صورت داشتن مجوز |
| `public/historical/intraday/histdata-xauusd-*-2024.csv` | بررسی منشأ فایل‌های تولیدشده جدید و انتقال موارد مصنوعی به namespace synthetic |
| `lib/core/yearly-data-loader.ts` | بازگرداندن object شامل candles و provenance؛ حذف fallback خاموش ۲۰۲۵→۲۰۲۴→fixture |
| `components/trading/multi-style-backtest-modal.tsx` | نمایش بازه پردازش‌شده واقعی؛ حذف slice بی‌صدا؛ validation سازگاری style/timeframe؛ progress/cancel |
| `lib/core/multi-style-backtester.ts` | پذیرش dataset metadata؛ ثبت requested/executed range؛ جلوگیری از اجرای style روی timeframe نامعتبر |
| `lib/research/dataset-manifest.ts` | فایل جدید برای schema منشأ، integrity و کیفیت داده |
| `lib/research/dataset-validator.ts` | فایل جدید برای timestamp، OHLC، duplicate، gap، aggregation و session checks |
| `public/historical/manifests/*.json` | فایل‌های جدید manifest برای datasetهای معتبر |
| `workers/backtest.worker.ts` | فایل جدید برای اجرای بک‌تست و Monte Carlo خارج از main thread |
| `hooks/use-backtest-worker.ts` | فایل جدید برای progress، cancel، timeout و error recovery |

### اصلاح شورای AI و ادعاهای قابلیت

| مسیر | اقدام لازم |
|---|---|
| `lib/core/multi-agent-orchestrator.ts` | جداسازی pipeline deterministic از pipeline async neural؛ حذف رفتار نمایشی engine ID |
| `lib/ai/webllm-agent-adapter.ts` | اجرای واقعی مدل resident، timeout، schema validation و provenance برای هر role |
| `lib/ai/browser-offline-ai.ts` | capability probe معتبر، مدل‌های واقعاً موجود، cancellation و memory budget |
| `lib/contracts/multi-agent-system.ts` | افزودن `executionMode` و وضعیت `UNAVAILABLE/NOT_RESIDENT/RUNNING/EXECUTED/BLOCKED` به engineها |
| `components/trading/multi-agent-orchestrator-modal.tsx` | نمایش availability واقعی و جلوگیری از انتخاب گزینه unsupported بدون توضیح |
| `components/workspaces/ai-hub-workspace.tsx` | اصلاح «مدل عصبی فعال» و ادعای «۴ ایجنت هم‌زمان» بر اساس telemetry اجرا |
| `components/trading/offline-ai-manager-modal.tsx` | اتصال انتخاب مدل resident به role mapping و نمایش هزینه RAM/download واقعی |
| `lib/core/__tests__/multi-agent-council.test.ts` | تغییر تست engine ID به آزمون اجرای واقعی adapter/fake adapter؛ اصلاح نام و details گمراه‌کننده |
| `lib/ai/__tests__/webllm-agent-adapter.test.ts` | فایل جدید برای unsupported، not-resident، invalid JSON، timeout و successful advisory |
| `tests/e2e/ai-council.spec.ts` | فایل جدید برای انتخاب مدل، blocked state و evidence اجرای واقعی |

### اصلاح امنیت، اتصال Demo و persistence

| مسیر | اقدام لازم |
|---|---|
| `app/api/auth/ctrader/login/route.ts` | CSPRNG state، PKCE، cookie کوتاه‌عمر و redirect allowlist |
| `app/api/auth/ctrader/callback/route.ts` | consume-once state، exchange امن بدون secret در URL و ذخیره token سمت server |
| `app/api/auth/ctrader/session/route.ts` | گزارش نشست واقعی، account binding و expiry |
| `app/api/auth/ctrader/logout/route.ts` | فایل جدید برای revoke و audit |
| `lib/server/token-vault.ts` | access/refresh token، key version، expiry و rotation |
| `lib/server/auth/oauth-state.ts` | فایل جدید برای state/PKCE یک‌بارمصرف |
| `lib/server/auth/broker-session-service.ts` | فایل جدید برای refresh/revoke و اتصال operator به حساب Demo |
| `lib/gateway/config.ts` | حذف وابستگی عملیاتی worker به token ثابت env؛ تفکیک read و demo execution |
| `lib/server/demo-execution-bridge.ts` | حذف symbol ID ثابت و تبدیل به enqueue کردن OrderIntent |
| `lib/market/symbol-registry.ts` | فایل جدید برای metadata واقعی broker، pip، digits، contract و lot constraints |
| `lib/server/repositories.ts` | async و transaction-aware کردن interfaceها |
| `lib/server/storage/persistent-store.ts` | محدود به dev/test و حذف از production |
| `prisma/schema.prisma` و `prisma/migrations/` | فایل‌های جدید برای schema PostgreSQL و unique constraintها |
| `lib/server/repositories/postgres-*.ts` | فایل‌های جدید برای session، token، outbox، journal، audit و lease |
| `lib/server/rate-limiter.ts` | اتصال به Redis و fail-closed در mutationهای حساس |
| `lib/server/executor-manager.ts` | lease/fencing token توزیع‌شده |
| `services/ctrader-demo-worker/` | سرویس جدید شامل gateway، consumer، quote، reconciliation و health |

### اصلاح API، وضعیت و رابط

| مسیر | اقدام لازم |
|---|---|
| `lib/contracts/broker.ts` | فایل جدید برای `BrokerConnectionState`، capability و provenance |
| `app/api/gateway/status/route.ts` | وضعیت واقعی و پاسخ عمومی redacted |
| `app/api/market/quotes/route.ts` | timestamp، source، bid/ask و staleness |
| `app/api/orders/outbox/route.ts` | احراز هویت GET، scope، pagination و redaction |
| `app/api/journal/route.ts` | احراز هویت و محدودسازی داده |
| `app/api/verify-tests/route.ts` | حذف از production یا محدود به build/test environment |
| `components/trading/header.tsx` | حذف ONLINE ثابت و محیط Demo پیش‌فرض گمراه‌کننده |
| `components/trading/connection-status.tsx` | فایل جدید برای state machine و heartbeat |
| `components/trading/data-provenance-badge.tsx` | فایل جدید برای REAL/SYNTHETIC/REPLAY/FALLBACK/STALE |
| `components/trading/order-ticket.tsx` | مسدودسازی fail-closed و نمایش دلیل |
| `app/page.tsx` | شکستن orchestration و state بزرگ به hook/storeهای کوچک |
| `app/globals.css` | touch target حداقل ۴۴×۴۴، focus، RTL، contrast و responsive toolbar |
| `hooks/use-broker-status.ts` | فایل جدید برای polling با dedup/backoff/abort |
| `hooks/use-market-quotes.ts` | فایل جدید برای quote و staleness |

### CI، تست، استقرار و اسناد

| مسیر | اقدام لازم |
|---|---|
| `scripts/run-domain-tests.ts` | اجرای هر ۴۶ فایل test یا شکست در صورت test کشف‌شده ولی اجرا‌نشده |
| `.github/workflows/deploy.yml` | افزودن diff-check، unit کامل، integration، e2e، build و audit |
| `.github/workflows/demo-smoke.yml` | فایل جدید برای smoke محدود cTrader Demo با environment محافظت‌شده |
| `playwright.config.ts` | فایل جدید برای desktop/mobile و trace هنگام شکست |
| `tests/e2e/backtest-dataset.spec.ts` | فایل جدید برای تطابق label، range و provenance |
| `tests/integration/dataset-validator.test.ts` | فایل جدید برای OHLC/aggregation/gaps/checksum |
| `tests/integration/outbox-restart.test.ts` | فایل جدید برای restart، duplicate و reconciliation |
| `apphosting.yaml` | frontend/BFF و Secret Manager؛ بدون gateway دائمی |
| `Dockerfile.gateway` و `cloudrun.gateway.yaml` | فایل‌های جدید برای worker دائمی |
| `.env.example` | DB، Redis، OAuth، encryption و worker vars بدون مقدار واقعی |
| `docs/current-status.md` | فایل جدید و مرجع واحد ادعاهای اثبات‌شده |
| `docs/data-provenance.md` | فایل جدید برای منابع واقعی و مصنوعی |
| `docs/architecture.md` | فایل جدید برای مرز frontend/worker/storage |
| `docs/demo-runbook.md` | فایل جدید برای اتصال، smoke، kill switch و recovery |
| `docs/security-boundary.md` | فایل جدید برای OAuth، secrets، API و ممنوعیت live |
| `README.md` | حذف ادعاهای مبهم و ارجاع به اسناد جاری |

## منطق تغییرات هر فایل و مشخصات توابع/اینترفیس‌ها (بدون تولید کدهای طولانی)

### قرارداد dataset

- `DatasetManifest` باید شامل `datasetId`، `symbol`، `timeframe`، `sourceKind`، `provider`، `license`، `timezone`، `startAt`، `endAt`، `rowCount`، `sha256`، `isSynthetic`، `generationMethod`، `generatedAt` و `qualityReportId` باشد.
- `sourceKind` حداقل مقادیر `BROKER_HISTORICAL`، `PUBLIC_DAILY`، `SYNTHETIC_DAILY_INTERPOLATION`، `REPLAY_FIXTURE` و `FALLBACK` را داشته باشد.
- `loadDataset(request)` باید `{candles, manifest, warnings}` برگرداند. fallback فقط با `allowFallback=true` انجام شود و manifest واقعی fallback را برگرداند؛ cache key باید dataset واقعی را ذخیره کند.
- `validateDataset()` باید monotonic timestamp، duplicate، OHLC invariant، timeframe spacing، gap، timezone، daily aggregation و checksum را بررسی کند. نقض high/low منبع باید خطای blocking باشد.
- اگر داده M1 کامل نیست، گزینه UI باید «بازه محدود» نمایش دهد؛ واژه full-year فقط وقتی مجاز است که coverage تعریف‌شده manifest تأمین شود.

### اجرای بک‌تست

- `BacktestRunRequest` باید requested dataset/range/style/config را نگه دارد و `BacktestRunReport` علاوه بر نتیجه، `executedStartAt`، `executedEndAt`، `inputRows`، `processedRows`، `truncated`، `warnings`، `engineVersion` و `seed` را ثبت کند.
- truncation بی‌صدا حذف شود. کاربر یا dataset کوچک‌تر انتخاب کند، یا worker تمام بازه را chunk کند. اگر محدودیت لازم است، UI پیش از اجرا بازه واقعی را نشان دهد.
- `validateStyleTimeframe(style,timeframe)` باید SCALP را به M1/M5، swing را به H1/H4/D1 و سایر styleها را به محدوده مصوب محدود کند.
- Web Worker باید پیام‌های `START`، `PROGRESS`، `CANCEL`، `COMPLETE` و `ERROR` داشته باشد. cancel باید cooperative و نتیجه نیمه‌کاره غیرقابل‌اشتباه باشد.
- داده مصنوعی می‌تواند برای regression test الگوریتم استفاده شود، ولی acceptance edge و تصمیم محصول فقط با داده معتبر و OOS انجام شود.

### شورای AI

- pipeline قطعی و عصبی باید دو API روشن داشته باشد: `evaluateDeterministicCouncil()` و `evaluateNeuralCouncilAsync()`.
- هر `AgentReviewResult` باید `engineId`، `modelId`، `modelRevision`، `executionStatus`، `source`، `latencyMs`، `inputEvidenceIds` و validation outcome داشته باشد.
- نوشتن engine ID در خروجی بدون فراخوانی مدل، `executionStatus=NOT_EXECUTED` است و نباید به‌عنوان رأی عصبی شمارش شود.
- `evaluateLoadedWebLLMAgent()` باید timeout، cancellation، JSON schema، evidence allowlist و fail-closed را enforce کند. متن مدل هرگز مستقیماً مجوز معامله نباشد.
- scanner بهتر است deterministic باقی بماند؛ analyst/critic می‌توانند advisory عصبی بدهند؛ judge و risk gate باید deterministic و غیرقابل دورزدن باشند.
- مدل unsupported، unimplemented، not-resident یا memory-insufficient باید پیش از ذخیره config واضح نمایش داده شود.
- تست‌ها باید fake adapter قابل‌کنترل تزریق کنند و ثابت کنند مدل واقعاً فراخوانی شده، خروجی parse شده و failure سفارش را مسدود می‌کند.

### اتصال و سفارش Demo

- `BrokerConnectionState` شامل `DISABLED`، `CONFIG_REQUIRED`، `AUTH_REQUIRED`، `CONNECTING`، `READY_READ_ONLY`، `READY_DEMO_EXECUTION`، `STALE`، `RECONNECTING` و `BLOCKED` باشد.
- OAuth state/PKCE در server store با TTL و consume-once نگهداری شود؛ cookie فقط session ID opaque داشته باشد.
- token record رمز‌شده شامل access، refresh، expiry، scope، accountId، environment و keyVersion باشد.
- `SymbolRegistry.resolve()` metadata را از همان حساب Demo دریافت کند؛ نبود mapping باعث reject شود، نه مقدار حدسی.
- `OutboxRepository.enqueue()` باید intent، idempotency key و audit را در یک transaction ثبت کند. `claimNext()` از row lock/`SKIP LOCKED` و fencing token استفاده کند.
- worker پیش از submit دوباره session، account demo، quote freshness، kill switch، lease و سقف ریسک ۰٫۲۵٪ را بررسی کند.
- timeout مبهم به `UNKNOWN_PENDING_RECONCILIATION` برود؛ retry مستقیم قبل از جست‌وجوی broker ممنوع باشد.

### رابط و دسترس‌پذیری

- header وضعیت را فقط از API واقعی بگیرد. در حالت local/replay عبارت `OFFLINE REPLAY` یا `SYNTHETIC` نمایش داده شود.
- badge داده باید source، زمان آخرین candle/quote و warning coverage را نمایش دهد.
- همه کنترل‌ها حداقل ۴۴×۴۴ باشند؛ toolbar موبایل باید wrap/scroll کنترل‌شده داشته باشد و هیچ action مهم خارج از viewport نباشد.
- دکمه‌های icon-only `aria-label`، modalها focus trap و close name، و تغییر اتصال `aria-live` داشته باشند.
- متن‌های «فعال»، «اجرا شد»، «زنده» و «آنلاین» فقط از state قابل‌اندازه‌گیری ساخته شوند.

### CI و شواهد

- test discovery باید فهرست ۴۶ فایل را با suiteهای واقعاً اجراشده مقایسه کند؛ هر test بدون entrypoint یا اجرا، CI را fail کند.
- `git diff --check` و formatter check اضافه شود تا whitespace و format drift گرفته شود.
- browser e2e باید desktop و mobile را پوشش دهد: بارگذاری، console، council selection، dataset/year/timeframe، range label، cancel backtest و blocked order.
- smoke cTrader Demo باید جدا از mock test گزارش شود و broker order ID، account environment و reconciliation evidence داشته باشد؛ secretها redacted بمانند.

## ریسک‌ها و تداخل‌های احتمالی با سایر فایل‌های پروژه

- حذف یا جابه‌جایی CSVها می‌تواند URLهای hardcoded و cache browser را بشکند. ابتدا catalog/manifest و compatibility redirect ساخته شود، سپس فایل قدیمی حذف شود.
- جایگزینی داده مصنوعی با داده vendor ممکن است محدودیت license و حجم زیاد داشته باشد. قبل از commit باید حق توزیع و روش storage/CDN مشخص شود.
- نتایج بک‌تست پس از داده واقعی، هزینه واقعی و حذف truncation احتمالاً با نتایج فعلی تفاوت جدی خواهند داشت؛ این تغییر regression نیست و باید با engine/data version توضیح داده شود.
- async شدن council و انتقال به worker می‌تواند call siteهای synchronous را بشکند. یک adapter موقت فقط برای deterministic mode نگه داشته شود.
- اجرای چند مدل ۷B/۱۴B هم‌زمان در مرورگر می‌تواند RAM/GPU را پر کند. scheduler باید یک resident model، queue، cancellation و memory estimate داشته باشد؛ ادعای اجرای هم‌زمان چهار مدل حذف شود مگر با شواهد دستگاه.
- Chrome builtin AI وابسته به browser/version/permission است و نباید fallback خاموش به مدل دیگری داشته باشد.
- Web Worker نمی‌تواند به همه importهای وابسته به DOM دسترسی داشته باشد؛ هسته backtester باید pure و serializable شود.
- migration از PersistentStore به PostgreSQL همه OMS/journal/executor/API testها را تحت تأثیر می‌گذارد. import یک‌باره باید idempotent و دارای dry-run باشد.
- outage در DB/Redis باید سفارش را fail-closed کند، ولی نباید replay و تحلیل محلی را متوقف کند.
- تغییر OAuth نشست‌های فعلی را باطل می‌کند؛ rollout باید logout اجباری و پاک‌سازی cookie قدیمی داشته باشد.
- Cloud Run برای socket دائمی به CPU always allocated و min instance نیاز دارد. scale بیش از یک فقط با leader lease و fencing مجاز است.
- استانداردسازی استقرار روی Firebase/Google Cloud با `vercel.json` و مسیرهای قبلی تداخل دارد؛ یک production authoritative انتخاب شود.
- بزرگ‌کردن touch target می‌تواند toolbar را بلندتر کند؛ viewportهای ۳۲۰، ۳۶۰، ۳۹۰، ۷۶۸ و desktop باید تست شوند.
- endpoint تست در production می‌تواند CPU و state را درگیر کند. حذف آن ممکن است UI «تست‌ها OK» را بشکند؛ این badge باید از artifact CI یا health واقعی تغذیه شود.
- فایل‌های قدیمی docs ممکن است ادعاهای live/online را بازتولید کنند؛ search سراسری اصطلاحات و برچسب archived لازم است.

## چک‌لیست گام‌به‌گام و مرحله‌بندی شده برای مدل پیاده‌ساز بعدی

- [ ] Step 1: شاخه feature از `9f6d7c1` بساز و baseline فعلی شامل ۳۲ suite/۱۷۰ check، typecheck، lint، build و مشاهدات desktop/mobile را ثبت کن.
- [ ] Step 2: همه ۴۶ فایل test را در runner اصلی کشف و اجرا کن؛ نام تست «14B Pipeline Execution» را تا زمان اجرای واقعی مدل اصلاح کن.
- [ ] Step 3: catalog داده را بساز و همه فایل‌های ۲۰۲۴/۲۰۲۵ را به REAL یا SYNTHETIC طبقه‌بندی کن؛ هیچ فایل بدون manifest وارد بک‌تست نشود.
- [ ] Step 4: dataset validator را پیاده کن و خطاهای فعلی high/low، حجم مصنوعی، coverage ناقص M1 و timezone را به تست regression تبدیل کن.
- [ ] Step 5: CSVهای تولیدشده را از historical واقعی جدا کن و UI را فوراً با برچسب `SYNTHETIC_DAILY_INTERPOLATION` اصلاح کن.
- [ ] Step 6: fallback خاموش loader را حذف کن؛ loader باید manifest و warning منبع واقعی را همراه candles برگرداند.
- [ ] Step 7: گزارش بک‌تست را به requested/executed range مجهز و `slice(-25000)` بی‌صدا را حذف کن.
- [ ] Step 8: backtester و Monte Carlo را به Web Worker منتقل کن و progress، cancel، timeout و recovery را اضافه کن.
- [ ] Step 9: اعتبار style/timeframe را enforce کن و SCALP/SWING/TREND را روی dataset و timeframe مناسب با تست OOS اجرا کن.
- [ ] Step 10: pipeline شورا را به deterministic sync و neural async تفکیک کن؛ رأی عصبی بدون اجرای واقعی و schema validation صفر اعتبار داشته باشد.
- [ ] Step 11: role-to-model mapping، availability و resident model را یکپارچه کن؛ گزینه‌های unimplemented/unsupported را غیرفعال و دلیل را نشان بده.
- [ ] Step 12: متن‌های AI Hub و تست‌ها را بر اساس telemetry واقعی اصلاح کن؛ «هم‌زمان فعال» و «مدل عصبی فعال» فقط در حالت اثبات‌شده نمایش داده شوند.
- [ ] Step 13: SymbolRegistry مرکزی، decimal arithmetic و risk gate واحد ۰٫۲۵٪ را در پژوهش، ticket، OMS و worker اعمال کن.
- [ ] Step 14: OAuth را با CSPRNG، PKCE، state یک‌بارمصرف، exchange امن، refresh، revoke و token store سمت server تکمیل کن.
- [ ] Step 15: schema PostgreSQL و repositoryهای async/transactional را ایجاد و PersistentStore را از production خارج کن.
- [ ] Step 16: Redis rate limit و executor lease/fencing را اضافه و crash/duplicate/concurrent-worker را تست کن.
- [ ] Step 17: worker مستقل cTrader Demo را با reconnect، heartbeat، quote normalization، outbox consumer و reconciliation بساز.
- [ ] Step 18: APIهای journal/outbox/diagnostics را احراز هویت، scope، paginate و redact کن؛ endpoint verify-tests را از production حذف کن.
- [ ] Step 19: header و order ticket را به `BrokerConnectionState` واقعی وصل کن و اجرای سفارش را خارج از `READY_DEMO_EXECUTION` مسدود کن.
- [ ] Step 20: UI provenance داده و بازه پردازش‌شده را اضافه کن؛ نمایش سال کامل روی M1 ناقص و fallback را با e2e منع کن.
- [ ] Step 21: کنترل‌های موبایل را به ۴۴×۴۴ برسان، ۷ مورد clipped را رفع و icon buttonها، focus، dialog و RTL را تست کن.
- [ ] Step 22: `app/page.tsx` و workspace/modalهای بزرگ را مرحله‌ای بشکن، polling را deduplicate و bundleهای AI را lazy-load کن.
- [ ] Step 23: CI را با diff-check، formatter، همه unitها، DB/Redis integration، Playwright desktop/mobile، build، audit و secret scan کامل کن.
- [ ] Step 24: staging گوگل شامل Firebase App Hosting، Cloud SQL، Redis، Secret Manager و Cloud Run worker را ایجاد و backup/restore را تمرین کن.
- [ ] Step 25: smoke واقعی cTrader Demo را با حداقل حجم مجاز برای OAuth، quote، submit، protection، cancel/close، restart و reconciliation اجرا و شواهد را ثبت کن.
- [ ] Step 26: سناریوهای token expiry، stale quote، قطع شبکه، DB/Redis outage، دو worker و kill switch را fail-closed تأیید کن.
- [ ] Step 27: اسناد current status، data provenance، architecture، security boundary و demo runbook را مرجع کن و ادعاهای تاریخی را archived کن.
- [ ] Step 28: rollout را ابتدا read-only و سپس demo execution با unlock اپراتور انجام بده؛ پس از دوره پایش، routeها و adapterهای قدیمی را حذف کن.
