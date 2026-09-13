# نقشه راه رفع ایرادات، بهبود و عملیاتی‌سازی Tradewithhamed

## تحلیل وضعیت فعلی و نقاط حساس پروژه

### وضعیت مبنا و دامنه هدف

- بررسی روی شاخه `main` و کامیت `c31be8a` انجام شده و در زمان بررسی، شاخه محلی با `origin/main` همگام بوده است.
- کنترل‌های پایه فعلی موفق‌اند: `npm run test:domain` با ۳۲ مجموعه و ۱۶۹ بررسی، `npm run typecheck` و `npm run lint`. این نتیجه فقط سلامت آزمون‌های موجود و تحلیل ایستا را نشان می‌دهد و اثبات اتصال واقعی به cTrader، دوام داده در محیط چندنمونه‌ای، امنیت کامل یا آمادگی تولید نیست.
- هدف اجرایی این نقشه «محیط پژوهش و دمو» است: پژوهش و بک‌تست آفلاین پایدار بماند و داده و سفارش واقعی فقط به حساب **cTrader Demo** متصل شود. معامله با پول واقعی و `BROKER_LIVE` خارج از دامنه و به‌صورت صریح مسدود است.
- معماری مقصد پیشنهادی و تصمیم‌شده: رابط Next.js روی Firebase App Hosting، یک worker دائمی cTrader روی Google Cloud Run با CPU همیشه فعال و حداقل یک نمونه، Cloud SQL for PostgreSQL برای وضعیت ماندگار و تراکنش‌ها، Memorystore Redis برای rate limit و lease/heartbeat، و Secret Manager برای کلیدها. اجرای هم‌زمان بیش از یک worker فقط با قفل رهبری مجاز است.
- پیش از هر تغییر Next.js، مدل پیاده‌ساز باید مطابق `AGENTS.md` مستندات نسخه نصب‌شده را از `node_modules/next/dist/docs/` بخواند؛ به‌ویژه مستندات Route Handler، caching، runtime و deployment.

### نقاط قوت فعلی

- هسته ریسک، پژوهش، walk-forward، Monte Carlo، پذیرش استراتژی، reconciliation و مسیرهای امنیتی دارای پوشش آزمون دامنه‌ای قابل‌توجه‌اند.
- مرزبندی اولیه میان حالت replay/simulation، gateway و OMS وجود دارد و برای تکمیل معماری لازم نیست پروژه از صفر بازنویسی شود.
- رمزنگاری AES-256-GCM برای token vault، نشست HttpOnly اپراتور، outbox، journal، kill switch و reconciliation پایه‌های مفیدی هستند.
- تغییر اخیر محاسبات USDJPY و ژست‌های لمسی نمودار، بخشی از دقت چندنمادی و استفاده موبایل را بهتر کرده است.

### ایرادات بحرانی و اولویت‌دار

1. **OAuth ناقص و آسیب‌پذیر است.** مسیر login مقدار `state` را با منبع ضعیف می‌سازد و آن را در نشست یک‌بارمصرف ذخیره نمی‌کند؛ callback نیز `state` را اعتبارسنجی نمی‌کند. این وضعیت خطر CSRF و جابه‌جایی نشست دارد. ارسال `client_secret` در query یک درخواست GET نیز می‌تواند آن را در لاگ یا ابزارهای میانی آشکار کند. refresh token، زمان انقضا، ابطال و چرخش توکن به‌صورت کامل مدیریت نمی‌شوند.
2. **ورود OAuth عملاً gateway را متصل نمی‌کند.** callback توکن را در cookie درخواست ذخیره می‌کند، اما gateway singleton توکن را از متغیر محیطی `CTRADER_ACCESS_TOKEN` می‌خواند. بنابراین «ورود موفق» با «آماده بودن اتصال و اجرا» یکی نیست.
3. **وضعیت رابط می‌تواند گمراه‌کننده باشد.** صفحه با `BROKER_DEMO` و هدر با برچسب ثابت `ONLINE` شروع می‌شود، حتی وقتی gateway غیرفعال یا پیکربندی‌نشده است. کاربر باید منبع داده، تازگی quote، حساب متصل و مجاز بودن ارسال سفارش را جداگانه ببیند.
4. **gateway و OMS برای محیط serverless مناسب نیستند.** WebSocket/TCP طولانی، singletonهای حافظه‌ای و worker اجرای سفارش در یک Route Handler یا نمونه موقت Next.js قابل اتکا نیستند. reconnect، heartbeat، مالکیت executor و بازیابی پس از restart باید در سرویس worker دائمی انجام شوند.
5. **ذخیره‌سازی فعلی مرجع تولیدی نیست.** `PersistentStore` از `.data/server_state.json` و cache ایستا استفاده می‌کند. این فایل در استقرار چندنمونه‌ای مشترک و پایدار نیست و برای outbox، journal، idempotency، kill switch، session و reconciliation خطر از دست رفتن یا دوگانگی داده دارد.
6. **کنترل هم‌زمانی توزیع‌شده وجود ندارد.** rate limiter، executor manager و بخشی از وضعیت OMS در حافظه‌اند. چند نمونه می‌توانند یک intent را دوبار بردارند، محدودیت نرخ را دور بزنند یا وضعیت متناقض بسازند.
7. **برخی APIهای خواندنی حساس بدون احراز هویت‌اند.** `GET /api/orders/outbox` و `GET /api/journal` می‌توانند اطلاعات سفارش، موقعیت یا audit را نمایش دهند. endpoint عمومی سلامت باید فقط اطلاعات حداقلی بدهد و جزئیات حساب و خطا برای نشست اپراتور محفوظ بماند.
8. **مدل نمادها پراکنده و ناقص است.** نگاشت bridge فقط XAUUSD و EURUSD را به شناسه‌های ثابت محدود می‌کند، درحالی‌که رابط و پژوهش GBPUSD و USDJPY را نیز دارند. pip size، digits، contract size، lot step، حداقل/حداکثر حجم و تبدیل ارز باید از یک registry و metadata کارگزار بیایند.
9. **ریسک در همه مسیرها به یک شکل enforce نمی‌شود.** سقف ۰٫۲۵٪، الزام stop loss، تازگی قیمت، spread معتبر، تبدیل ارز و وضعیت حساب باید پیش از ایجاد intent و دوباره پیش از ارسال به broker کنترل شوند. هیچ مسیر «اجرای سریع» نباید این قواعد را دور بزند.
10. **شبیه‌ساز برای ادعای واقع‌گرایی کافی نیست.** spread سمت bid/ask، commission، slippage، gap، ابهام ترتیب intrabar، partial fill و جلوگیری از دوباره‌شماری PnL باید مدل شوند، درحالی‌که تکرارپذیری seeded حفظ شود.
11. **CI همه کنترل‌های موجود را اجرا نمی‌کند.** runner دامنه تعدادی آزمون مهم server/execution را فهرست نکرده و workflow هنوز توضیح قدیمی تعداد suiteها را دارد. endpoint اجرای آزمون در برنامه نیز نباید در production در دسترس باشد یا وضعیت واقعی را تغییر دهد.
12. **جداسازی آزمون از داده واقعی کافی نیست.** آزمون‌ها باید repository موقت یا in-memory مستقل داشته باشند و هرگز `.data/server_state.json` یا پایگاه داده محیط اجرایی را تغییر ندهند.
13. **رابط کاربری متراکم و اجزای اصلی بیش از حد بزرگ‌اند.** `app/page.tsx`، `components/trading/chart-canvas.tsx` و `components/research-desk.tsx` مسئولیت‌های زیادی دارند. این وضعیت رندر مجدد، تست، دسترس‌پذیری و نگهداری را سخت می‌کند.
14. **کیفیت موبایل و دسترس‌پذیری کامل نیست.** برخی کنترل‌ها کوچک‌تر از ۴۴×۴۴ پیکسل‌اند؛ focus، نام accessible، اعلام وضعیت اتصال، کنتراست، reduced motion، استفاده بدون رنگ و پشتیبانی RTL باید به‌صورت سیستماتیک ارزیابی شوند.
15. **AI آفلاین باید فقط نقش مشورتی داشته باشد.** مدل مرورگر نباید به credential یا broker دسترسی داشته باشد؛ خروجی باید schema معتبر، timeout، fallback قطعی، نسخه مدل و provenance داشته باشد و bundle آن فقط هنگام نیاز بارگذاری شود.
16. **منشأ و کیفیت داده به‌اندازه کافی قابل ممیزی نیست.** هر dataset باید manifest شامل منبع، بازه، timezone، gapها، hash و زمان تولید داشته باشد. نتایج synthetic/replay نباید به‌عنوان عملکرد زنده یا سودآوری واقعی نمایش داده شوند.
17. **observability و عملیات بازیابی ناقص‌اند.** نیاز به log ساختاریافته، correlation ID، heartbeat worker، queue depth، reconciliation lag، هشدار quote منقضی، حفاظت ناموفق، قطع gateway و conflict در lease وجود دارد. backup و restore نیز باید واقعاً آزمایش شوند.
18. **مستندات مرحله‌ای ممکن است از وضعیت جاری فاصله بگیرند.** یک سند وضعیت جاری و یک معماری مرجع لازم است؛ اسناد تاریخی باید با برچسب archived نگه داشته شوند تا ادعای قدیمی با قابلیت فعلی اشتباه نشود.

### معیار عملیاتی‌شدن نسخه دمو

- کاربر با OAuth امن وارد cTrader Demo شود؛ token و refresh token رمز‌شده و قابل ابطال باشند و worker بتواند آن‌ها را بدون وابستگی به cookie مرورگر مصرف کند.
- وضعیت `READY_DEMO_EXECUTION` فقط وقتی نمایش داده شود که OAuth، حساب دمو، heartbeat، quote تازه، executor lease، reconciliation و risk gate همگی سالم باشند.
- هر سفارش یک `intentId` یکتا داشته باشد، در تراکنش outbox ثبت شود، حداکثر یک بار به broker ارسال منطقی شود و نتیجه آن پس از restart قابل بازیابی و reconciliation باشد.
- تمام مسیرهای پژوهش، replay و simulation با provenance واضح کار کنند؛ قطع gateway نباید پژوهش آفلاین را از کار بیندازد.
- هیچ secret، token، account ID کامل یا پیام خام حساس در browser، URL، telemetry یا log ثبت نشود.
- تست end-to-end روی حساب cTrader Demo، با سفارش بسیار کوچک و پاک‌سازی/بستن کنترل‌شده، به‌صورت دستی و CI محدود به sandbox انجام شود. موفقیت تست مصنوعی به‌تنهایی معیار پذیرش اتصال نیست.

## مسیر دقیق فایل‌هایی که باید تغییر کنند یا فایل‌های جدیدی که باید ساخته شوند (File Paths)

### پیکربندی، قراردادها و مستندات

| مسیر | اقدام | هدف |
|---|---|---|
| `AGENTS.md` | فقط مطالعه | رعایت الزام خواندن مستندات Next.js نسخه نصب‌شده پیش از تغییر |
| `package.json` | تغییر | افزودن Prisma/PostgreSQL، Redis، اسکریپت migration، worker، تست integration و Playwright |
| `package-lock.json` | تولید مجدد | قفل‌کردن dependencyهای تأییدشده |
| `.env.example` | تغییر | تعریف متغیرهای خالی و توضیح scope برای DB، Redis، OAuth، رمزنگاری و worker؛ بدون secret واقعی |
| `apphosting.yaml` | تغییر | تنظیم build/runtime و متغیرهای مرجع Secret Manager برای BFF؛ حذف اجرای gateway دائمی از frontend |
| `vercel.json` | بازبینی/حذف در صورت استانداردسازی | جلوگیری از دو مسیر استقرار متناقض پس از انتخاب Firebase App Hosting |
| `Dockerfile.gateway` | فایل جدید | ساخت image مستقل worker cTrader Demo |
| `cloudrun.gateway.yaml` | فایل جدید | تعریف min/max instances، CPU always allocated، health check و secret references |
| `docs/current-status.md` | فایل جدید | تنها مرجع وضعیت قابل‌اثبات، محدودیت‌ها و آخرین validation |
| `docs/architecture.md` | فایل جدید | مرز frontend/BFF، worker، PostgreSQL، Redis و cTrader Demo |
| `docs/demo-runbook.md` | فایل جدید | راه‌اندازی، OAuth، smoke test، توقف اضطراری، rotation و recovery |
| `docs/security-boundary.md` | فایل جدید | threat model، secret handling، سطح دسترسی و ممنوعیت live trading |
| `README.md` | تغییر | ارجاع به اسناد مرجع و بیان دقیق synthetic/replay/demo-live |

### قراردادهای دامنه و مدل بازار

| مسیر | اقدام | هدف |
|---|---|---|
| `lib/contracts/broker.ts` | فایل جدید | تعریف وضعیت اتصال، قابلیت‌ها، نشست broker و provenance |
| `lib/contracts/orders.ts` | فایل جدید | تعریف OrderIntent، وضعیت چرخه عمر، idempotency و خطاهای استاندارد |
| `lib/market/symbol-registry.ts` | فایل جدید | مرجع واحد pip، digits، contract size، lot constraints و شناسه broker |
| `lib/core/risk-calculator.ts` | تغییر | مصرف registry و fail-closed در تبدیل ارز، quote منقضی و نبود stop loss |
| `lib/core/position-scaling.ts` | تغییر | حذف ثابت‌های تکراری و همسان‌سازی rounding با lot step کارگزار |
| `lib/core/types.ts` | تغییر محدود | انتقال انواع broker/order به قراردادهای مستقل و حفظ re-export موقت |
| `lib/server/demo-execution-bridge.ts` | بازطراحی | تبدیل از bridge متصل به singleton به سرویس ایجاد intent و outbox |
| `lib/server/ctrader-oms.ts` | تغییر | اجرای async و تراکنشی state machine بدون وضعیت authoritative حافظه‌ای |
| `lib/execution/reconciliation.ts` | تغییر | reconciliation idempotent و ثبت نتیجه و موارد UNKNOWN در DB |
| `lib/execution/ctrader-execution.ts` | انتقال/اشتراک‌گذاری | استفاده worker از adapter پروتکل بدون وابستگی به Next runtime |

### احراز هویت، OAuth و امنیت API

| مسیر | اقدام | هدف |
|---|---|---|
| `app/api/auth/ctrader/login/route.ts` | تغییر | state و PKCE امن، cookie نشست کوتاه‌عمر، allowlist redirect و عدم افشای secret |
| `app/api/auth/ctrader/callback/route.ts` | تغییر | اعتبارسنجی یک‌بارمصرف state/PKCE، exchange سمت سرور، ذخیره رمز‌شده و حذف پارامترهای حساس |
| `app/api/auth/ctrader/session/route.ts` | تغییر | گزارش نشست واقعی و وضعیت account binding، نه صرفاً وجود env |
| `app/api/auth/ctrader/logout/route.ts` | فایل جدید | ابطال نشست و token و ثبت audit بدون افشای داده حساس |
| `lib/server/token-vault.ts` | تغییر | پشتیبانی access/refresh token، key version، expiry و rotation |
| `lib/server/auth/oauth-state.ts` | فایل جدید | تولید CSPRNG، PKCE، expiry، consume-once و constant-time validation |
| `lib/server/auth/broker-session-service.ts` | فایل جدید | اتصال operator به حساب demo و refresh/revoke چرخه token |
| `lib/server/operator-session.ts` | تغییر | rotation/revocation، session ID سمت cookie و داده نشست سمت server |
| `lib/server/request-security.ts` | فایل جدید | بررسی Origin/Fetch Metadata، CSRF و request/correlation ID برای mutationها |
| `app/api/orders/outbox/route.ts` | تغییر | حفاظت GET و POST، pagination و حذف فیلدهای حساس |
| `app/api/journal/route.ts` | تغییر | الزام نشست اپراتور، pagination و redaction |
| `app/api/gateway/status/route.ts` | تغییر | پاسخ عمومی حداقلی و پاسخ تشخیصی احرازشده |
| `app/api/verify-tests/route.ts` | حذف یا production-disable | جلوگیری از اجرای test runner و تغییر state در برنامه مستقر |

### ذخیره‌سازی و هماهنگی توزیع‌شده

| مسیر | اقدام | هدف |
|---|---|---|
| `prisma/schema.prisma` | فایل جدید | مدل OperatorSession، BrokerToken، OrderIntent، OutboxEvent، JournalEntry، PositionSnapshot، ReconciliationRun، AuditEvent و KillSwitch |
| `prisma/migrations/` | فایل‌های جدید | migration نسخه‌دار، indexها، unique constraintهای idempotency و retention |
| `lib/server/db/prisma.ts` | فایل جدید | اتصال singleton فقط برای client DB، مدیریت pooling و shutdown |
| `lib/server/repositories.ts` | تغییر | async کردن interfaceها و تعریف مرز تراکنش، pagination و optimistic concurrency |
| `lib/server/repositories/postgres-outbox.ts` | فایل جدید | claim اتمیک با transaction/lock، retry و dead-letter |
| `lib/server/repositories/postgres-journal.ts` | فایل جدید | journal append-only و query محدود به operator/account |
| `lib/server/repositories/postgres-session.ts` | فایل جدید | نشست و token metadata با expiry و revoke |
| `lib/server/repositories/postgres-executor-lease.ts` | فایل جدید | fencing token و lease اتمیک برای جلوگیری از دو executor |
| `lib/server/storage/persistent-store.ts` | محدودسازی و سپس حذف | فقط adapter توسعه محلی در دوره مهاجرت؛ ممنوع در production |
| `lib/server/rate-limiter.ts` | تغییر | استفاده از interface توزیع‌شده و fail-closed برای مسیرهای حساس |
| `lib/server/rate-limit/redis-store.ts` | فایل جدید | limiter اتمیک Redis با TTL و namespace محیط |
| `lib/server/executor-manager.ts` | تغییر | مصرف lease repository و fencing token به‌جای boolean حافظه‌ای |

### worker دائمی cTrader Demo

| مسیر | اقدام | هدف |
|---|---|---|
| `services/ctrader-demo-worker/package.json` | فایل جدید | وابستگی‌ها و اسکریپت build/start مستقل worker |
| `services/ctrader-demo-worker/tsconfig.json` | فایل جدید | تنظیم TypeScript سرویس |
| `services/ctrader-demo-worker/src/index.ts` | فایل جدید | bootstrap، validation محیط، signal handling و shutdown امن |
| `services/ctrader-demo-worker/src/gateway-service.ts` | فایل جدید | اتصال، auth، reconnect با backoff/jitter، heartbeat و refresh token |
| `services/ctrader-demo-worker/src/order-consumer.ts` | فایل جدید | claim outbox، risk recheck، submit، dedup و ثبت نتیجه |
| `services/ctrader-demo-worker/src/quote-service.ts` | فایل جدید | normalise quote، timestamp، staleness و انتشار snapshot |
| `services/ctrader-demo-worker/src/reconciliation-loop.ts` | فایل جدید | تطبیق دوره‌ای order/position و fail-closed در UNKNOWN |
| `services/ctrader-demo-worker/src/health-server.ts` | فایل جدید | liveness/readiness داخلی و metrics بدون secret |
| `lib/gateway/config.ts` | تغییر | تفکیک read-data و demo-execution capability؛ حذف اتکای token به env |
| `lib/gateway/ctrader-gateway.ts` | انتقال یا تبدیل به package مشترک | جلوگیری از ساخته‌شدن اتصال دائمی داخل Next.js |
| `lib/gateway/constants.ts` | تغییر | نام‌گذاری صریح DEMO، حذف ابهام READ_ONLY و مسدودسازی live |

### API و رابط کاربری

| مسیر | اقدام | هدف |
|---|---|---|
| `app/page.tsx` | شکستن و تغییر | انتقال state و orchestration به hook/storeهای کوچک و بارگذاری تنبل workspaceها |
| `components/trading/header.tsx` | تغییر | حذف ONLINE ثابت و نمایش state واقعی، account environment و provenance |
| `components/trading/chart-canvas.tsx` | شکستن | جداسازی renderer، gestures، overlays، scale و accessibility |
| `components/research-desk.tsx` | شکستن | جداسازی data setup، runner، result view و acceptance report |
| `components/trading/connection-status.tsx` | فایل جدید | نمایش state machine، last heartbeat و اقدام بازیابی |
| `components/trading/data-provenance-badge.tsx` | فایل جدید | نمایش واضح REPLAY/SYNTHETIC/CTRADER_DEMO_LIVE/STALE |
| `components/trading/order-ticket.tsx` | تغییر | disable fail-closed، خلاصه ریسک و دلیل دقیق مسدودشدن |
| `hooks/use-broker-status.ts` | فایل جدید | SWR، dedup، abort، backoff و توقف polling در tab غیرفعال |
| `hooks/use-market-quotes.ts` | فایل جدید | دریافت quote با staleness و جداسازی data source |
| `lib/client/trading-store.ts` | فایل جدید | state کوچک و selectorمحور برای کاهش rerender |
| `app/globals.css` | تغییر | حداقل ۴۴×۴۴، focus-visible، contrast، reduced-motion، RTL و viewport امن |
| `app/layout.tsx` | تغییر | metadata، زبان/direction صحیح و skip link |
| اجزای modal و AI موجود | تغییر | `dynamic import` هنگام بازشدن و حذف بار اولیه WebLLM |

### پژوهش، شبیه‌سازی و AI

| مسیر | اقدام | هدف |
|---|---|---|
| `lib/research/simulated-broker.ts` | تغییر | bid/ask، commission، slippage، partial fill، gap و intrabar policy |
| `lib/research/research-engine.ts` | تغییر | جلوگیری از look-ahead و ثبت نسخه تنظیمات/داده |
| `lib/research/walk-forward.ts` | تغییر | جداسازی train/OOS و گزارش leakage checks |
| `lib/research/acceptance-gate.ts` | تغییر | threshold نسخه‌دار، حداقل تعداد معامله و cost stress |
| `lib/research/dataset-manifest.ts` | فایل جدید | schema منشأ داده، SHA-256، timezone، gaps و بازه |
| `public/data/*.manifest.json` | فایل‌های جدید | manifest کنار هر dataset توزیع‌شده |
| `lib/ai/offline-advisor.ts` | تغییر | خروجی schemaدار، timeout، fallback قطعی و provenance |
| `lib/ai/model-loader.ts` | فایل جدید | lazy load، cache کنترل‌شده و گزارش model/version/hash |

### آزمون، CI، مشاهده‌پذیری و عملیات

| مسیر | اقدام | هدف |
|---|---|---|
| `scripts/run-domain-tests.ts` | تغییر | کشف یا فهرست کامل همه suiteها و شکست در صورت جاافتادن test |
| `lib/server/__tests__/operator-session.test.ts` | تغییر/ادغام CI | پوشش rotation، expiry، revoke و CSRF |
| `lib/server/__tests__/stage5-execution.test.ts` | تغییر/ادغام CI | پوشش state machine و idempotency |
| `lib/server/__tests__/w4-online-execution.test.ts` | تغییر نام | تبدیل ادعا به demo execution و حذف واژه online مبهم |
| `tests/integration/oauth-demo.test.ts` | فایل جدید | OAuth state/PKCE، token refresh و account binding با fake provider |
| `tests/integration/outbox-restart.test.ts` | فایل جدید | restart، duplicate delivery، lease conflict و reconciliation |
| `tests/e2e/trading-demo.spec.ts` | فایل جدید | جریان login، وضعیت، order ticket و blocked states در desktop/mobile |
| `tests/e2e/research.spec.ts` | فایل جدید | پژوهش آفلاین، provenance و export نتیجه |
| `playwright.config.ts` | فایل جدید | مرورگرها، viewportها، webServer و trace/screenshot هنگام شکست |
| `.github/workflows/deploy.yml` | تغییر | gate کامل lint/typecheck/unit/integration/e2e/build/audit و اصلاح شمارش قدیمی |
| `.github/workflows/demo-smoke.yml` | فایل جدید | smoke کنترل‌شده حساب Demo با environment محافظت‌شده و concurrency=1 |
| `.github/dependabot.yml` | فایل جدید | به‌روزرسانی کنترل‌شده dependency و GitHub Actions |
| `lib/server/observability/logger.ts` | فایل جدید | JSON log با redaction و correlation/intent ID |
| `lib/server/observability/metrics.ts` | فایل جدید | heartbeat، queue depth، lag، stale quote و reconciliation outcome |
| `app/api/health/live/route.ts` | فایل جدید | liveness حداقلی frontend/BFF |
| `app/api/health/ready/route.ts` | فایل جدید | readiness احرازشده برای DB/Redis و بدون ادعای آماده بودن broker |

## منطق تغییرات هر فایل و مشخصات توابع/اینترفیس‌ها (بدون تولید کدهای طولانی)

### قرارداد وضعیت و provenance

- `BrokerConnectionState` باید مقادیر `DISABLED`، `CONFIG_REQUIRED`، `AUTH_REQUIRED`، `CONNECTING`، `AUTHENTICATING`، `READY_READ_ONLY`، `READY_DEMO_EXECUTION`، `STALE`، `RECONNECTING` و `BLOCKED` را داشته باشد. UI نباید وضعیت را از نام محیط حدس بزند.
- `DataProvenance` باید حداقل `REPLAY`، `SYNTHETIC`، `PUBLIC_DELAYED` و `CTRADER_DEMO_LIVE` را تعریف کند. هر quote و نتیجه پژوهش باید provenance، `asOf` و وضعیت staleness داشته باشد.
- `BrokerCapabilities` شامل `canReadQuotes`، `canReadAccount`، `canSubmitDemoOrders` و `canModifyProtection` باشد. قابلیت live در این نسخه وجود نداشته باشد.
- `getBrokerStatus(operatorId)` وضعیت ترکیبی session، token expiry، account، worker heartbeat، quote age، lease و kill switch را برگرداند. `canSubmitDemoOrders` فقط از اجتماع همه شرط‌ها محاسبه شود.

### OAuth و نشست

- `createOAuthAttempt()` باید state تصادفی رمزنگاری‌شده، PKCE verifier/challenge، `expiresAt` و redirect داخلی allowlistشده بسازد و فقط hash یا شناسه attempt را در cookie HttpOnly/Secure/SameSite=Lax نگه دارد.
- `consumeOAuthAttempt(state, verifier)` باید یک‌بارمصرف، دارای TTL و constant-time باشد؛ mismatch یا replay با پاسخ عمومی و audit داخلی رد شود.
- `exchangeAuthorizationCode()` باید body امن سمت سرور استفاده کند و URL/log را از secret پاک نگه دارد.
- `BrokerTokenRecord` شامل `operatorId`، ciphertextهای access/refresh، `expiresAt`، scopes، `accountId`، `environment="demo"` و `keyVersion` باشد. cookie فقط session ID opaque داشته باشد.
- `refreshBrokerToken()` با قفل per-session اجرا شود؛ refresh ناموفق session را `AUTH_REQUIRED` کند و ارسال سفارش را متوقف سازد.
- `revokeBrokerSession()` ابتدا capability اجرا را ببندد، سپس token را revoke/حذف و audit ثبت کند.

### repository و تراکنش‌ها

- همه repositoryها Promise-based شوند. adapter فایل فقط در test/local مجاز باشد؛ انتخاب adapter با validation محیط انجام شود و production بدون PostgreSQL start نشود.
- `OutboxRepository.enqueue(intent, audit)` باید intent و audit را در یک تراکنش ثبت کند. `claimNext(workerId, fencingToken, now)` باید از قفل ردیف یا `SKIP LOCKED` استفاده کند. `markSubmitted` و `markFailed` باید version مورد انتظار را بپذیرند.
- unique constraint روی `(operatorId, idempotencyKey)` و شناسه broker اعمال شود. retry شبکه نباید سفارش منطقی تازه بسازد.
- `ExecutorLeaseRepository.acquire/renew/release` باید fencing token صعودی بدهد. worker با token قدیمی حق نوشتن نتیجه یا ارسال سفارش نداشته باشد.
- journal و audit append-only باشند؛ اصلاح منطقی با event جبرانی انجام شود، نه بازنویسی تاریخچه.
- retention، pagination cursor و indexهای `operatorId/accountId/createdAt/status` از ابتدا تعریف شوند.

### worker و gateway

- `GatewayService.start()` token معتبر را از repository بخواند، حساب demo را bind کند، heartbeat بسازد و reconnect را با exponential backoff و jitter انجام دهد.
- `QuoteService` پیام broker را با metadata همان حساب normalise کند. quote بدون timestamp معتبر، bid/ask یا mapping نماد باید رد و وضعیت `STALE/BLOCKED` ایجاد کند.
- `OrderConsumer.process(intent)` به ترتیب lease، kill switch، session، account demo، quote freshness، symbol metadata، risk cap و reconciliation state را بررسی کند؛ سپس submit و نتیجه broker را اتمیک ثبت کند.
- وضعیت مبهم timeout باید `UNKNOWN_PENDING_RECONCILIATION` شود؛ retry مستقیم قبل از جست‌وجوی order در broker ممنوع باشد.
- `ReconciliationLoop` orderها، positionها و protectionها را مقایسه کند. mismatch بحرانی capability اجرا را ببندد و هشدار ایجاد کند.
- shutdown باید claim جدید را متوقف، عملیات جاری را در deadline مشخص تمام و lease را آزاد کند. crash با expiry lease بازیابی شود.

### registry نماد و ریسک

- `SymbolRegistry.resolve(canonicalSymbol, brokerMetadata)` باید symbolId را از metadata حساب دمو پیدا کند و digits، pipSize، contractSize، lotStep و limits را اعتبارسنجی کند. شناسه ثابت حذف شود.
- `calculateOrderRisk(input)` باید مقدار پولی risk، درصد equity، فاصله SL، حجم خام، حجم گرد‌شده، هزینه تخمینی و دلایل rejection را برگرداند.
- سقف ۰٫۲۵٪ در domain service و worker enforce شود. نبود equity، FX conversion، quote تازه، stop loss یا metadata معتبر نتیجه `REJECTED` بدهد.
- همه محاسبات پولی از decimal library یا integer minor units استفاده کنند؛ rounding بر اساس قانون هر نماد و سمت محافظه‌کارانه باشد.

### API و UI

- mutationها پاسخ استاندارد `{requestId, data}` یا `{requestId, error:{code,message}}` داشته باشند؛ جزئیات داخلی فقط در log redacted ثبت شود.
- GETهای journal/outbox با نشست، scope حساب، pagination و سقف page size محافظت شوند. health عمومی تنها up/version را نمایش دهد.
- برای سازگاری، routeهای فعلی در یک مرحله به service جدید delegate کنند و header deprecation بگیرند؛ حذف نهایی پس از مهاجرت UI انجام شود.
- `useBrokerStatus` و `useMarketQuotes` polling را deduplicate کنند، هنگام hidden بودن صفحه کند یا متوقف شوند، request قبلی را abort کنند و backoff داشته باشند.
- order ticket دکمه خرید/فروش را فقط در `READY_DEMO_EXECUTION` فعال کند و دلیل بسته بودن را متنی نمایش دهد. رنگ تنها نشانه جهت یا خطا نباشد.
- کامپوننت‌های بزرگ بر اساس مسئولیت شکسته شوند؛ canvas state و pointer gesture از داده broker جدا باشند. selectorهای store از rerender کل صفحه جلوگیری کنند.
- WebLLM و پنل‌های سنگین فقط هنگام بازشدن dynamic import شوند؛ importهای barrel حجیم و dependencyهای client غیرضروری حذف شوند.
- کنترل‌های لمسی حداقل ۴۴×۴۴، ترتیب tab منطقی، focus واضح، dialog focus trap، `aria-live` برای تغییر اتصال و پشتیبانی reduced motion داشته باشند.

### پژوهش، بک‌تست و AI

- شبیه‌ساز باید fill را با bid/ask مناسب سمت سفارش، commission، slippage deterministic، gap و policy صریح intrabar محاسبه کند. seed و نسخه simulator در خروجی ذخیره شوند.
- split زمانی باید train، validation و out-of-sample را بدون هم‌پوشانی بسازد. indicator warm-up نباید داده آینده را وارد کند.
- acceptance report باید تعداد معامله، هزینه stress، drawdown، پایداری پارامتر، نتایج OOS و paper-forward را نشان دهد؛ thresholdها نسخه‌دار و قابل ممیزی باشند.
- `DatasetManifest` شامل `source`، `license`، `symbol`، `timeframe`، `timezone`، `start/end`، `rowCount`، `gaps`، `sha256` و `generatedAt` باشد.
- AI فقط متن/تحلیل پیشنهاد دهد و خروجی آن با schema parse شود. هیچ تابع AI به execution service، token vault یا order repository دسترسی نداشته باشد.

### CI، تست و مشاهده‌پذیری

- runner آزمون باید test discovery قابل پیش‌بینی یا manifest تولیدشده داشته باشد و در صورت وجود فایل test اجرا‌نشده fail شود.
- unit testها pure و سریع، integration testها با PostgreSQL/Redis موقت و e2eها با fake broker deterministic اجرا شوند. تست حقیقی cTrader Demo workflow جدا، محافظت‌شده و کم‌تکرار باشد.
- CI به‌ترتیب install قفل‌شده، secret scan، lint، typecheck، unit، integration، build، Playwright و dependency audit را اجرا کند. deploy فقط پس از همه gateها و migration سازگار انجام شود.
- logها `requestId`، `intentId`، `accountAlias` و event code داشته باشند؛ token، secret، authorization code، cookie و account ID کامل redacted شوند.
- alertها برای قطع طولانی gateway، quote stale، queue age، lease conflict، protection failure، reconciliation UNKNOWN و نرخ خطای token refresh تعریف شوند.

## ریسک‌ها و تداخل‌های احتمالی با سایر فایل‌های پروژه

- async شدن `lib/server/repositories.ts` تقریباً تمام callerهای OMS، reconciliation، journal، API و test را تحت تأثیر می‌گذارد. این مهاجرت باید یک‌جا در شاخه feature انجام شود یا با adapter سازگاری موقت همراه باشد.
- جابه‌جایی gateway به worker می‌تواند importهای مشترک را بشکند. فقط قراردادها و adapter پروتکل pure قابل اشتراک باشند؛ کد وابسته به `next/headers` یا cookie نباید وارد worker شود.
- Prisma migration اولیه باید داده `.data/server_state.json` را فقط با ابزار import یک‌باره و قابل بازگشت منتقل کند. اجرای خودکار import هنگام start خطر duplicate دارد.
- تغییر OAuth نشست‌های قبلی را نامعتبر می‌کند. rollout باید logout اجباری، پاک‌کردن cookie قدیمی و راهنمای ورود دوباره داشته باشد.
- Cloud Run با CPU فقط هنگام request برای اتصال broker مناسب نیست؛ پیکربندی CPU always allocated و min instance ضروری است. افزایش نمونه بدون lease/fencing می‌تواند ارسال تکراری ایجاد کند.
- Redis یا PostgreSQL unavailable باید اجرای سفارش را fail-closed کند؛ پژوهش آفلاین می‌تواند با برچسب مناسب ادامه دهد. fallback حافظه‌ای در production ممنوع است.
- حذف symbol IDهای ثابت ممکن است تا دریافت metadata اولیه، معاملات را مسدود کند. این رفتار مطلوب است و نباید با مقدار حدسی دور زده شود.
- یکسان‌سازی decimal/rounding ممکن است snapshotهای آزمون و نتایج تاریخی بک‌تست را تغییر دهد. نسخه engine و migration نتایج باید ثبت شود؛ مقایسه قبل/بعد روی fixtureهای مرجع لازم است.
- افزودن spread/commission/slippage احتمالاً معیارهای acceptance فعلی را پایین می‌آورد. threshold نباید برای عبور دادن نتایج ضعیف شل شود؛ ابتدا خطای مدل و داده بررسی شود.
- شکستن `app/page.tsx` و کامپوننت‌های بزرگ می‌تواند state modal، keyboard shortcut و hydration را مختل کند. تست رفتار و screenshot در desktop/mobile هم‌زمان لازم است.
- dynamic import مدل AI ممکن است اولین اجرا را کند کند. UI باید progress، cancel و fallback روشن داشته باشد و مدل را قبل از رضایت کاربر دانلود نکند.
- افزایش اندازه touch target می‌تواند در viewport کوچک باعث wrap یا overflow شود. طراحی responsive باید با عرض‌های ۳۲۰، ۳۶۰، ۳۹۰، ۷۶۸ و desktop بررسی شود.
- تغییر routeها ممکن است clientهای فعلی را بشکند. دوره سازگاری، contract test و deprecation header پیش از حذف route قدیمی ضروری است.
- نمایش diagnostics ممکن است اطلاعات حساب یا زیرساخت را افشا کند. پاسخ عمومی و authenticated باید schema جدا داشته باشند و snapshot امنیتی روی payloadها اجرا شود.
- اجرای migration در deployment هم‌زمان با نسخه قدیمی می‌تواند ناسازگاری ایجاد کند. migrationها ابتدا backward-compatible، سپس deploy و در نسخه بعد cleanup شوند.
- workflow دمو با credential واقعی باید فقط در GitHub Environment محافظت‌شده اجرا شود، concurrency یک داشته باشد و هرگز روی fork/PR ناشناس اجرا نشود.
- dependencyهای جدید سطح حمله و زمان build را افزایش می‌دهند. نسخه‌ها باید pin، audit و با runtime Node پروژه سازگار شوند.
- استانداردسازی روی Firebase/Google Cloud با `vercel.json` موجود تداخل دارد. تا پایان cutover، تنها یک محیط production باید authoritative باشد و دامنه/DNS پس از smoke test منتقل شود.
- هر ادعای «متصل»، «زنده» یا «آماده معامله» باید بر اساس telemetry واقعی همان محیط باشد. build موفق، mock broker یا داده synthetic جای evidence حساب Demo را نمی‌گیرد.

## چک‌لیست گام‌به‌گام و مرحله‌بندی شده برای مدل پیاده‌ساز بعدی

- [ ] Step 1: یک شاخه feature بساز، وضعیت `c31be8a` را ثبت کن، `AGENTS.md` و مستندات Next.js نسخه نصب‌شده را بخوان و baseline شامل test، typecheck، lint، build و browser smoke در desktop/mobile را ذخیره کن.
- [ ] Step 2: دامنه رسمی را در `docs/current-status.md` ثبت کن: پژوهش آفلاین و cTrader Demo مجاز، `BROKER_LIVE` ممنوع، و معیارهای `READY_DEMO_EXECUTION` مشخص.
- [ ] Step 3: قراردادهای `BrokerConnectionState`، `BrokerCapabilities`، `DataProvenance`، `OrderIntent` و خطاهای استاندارد را ایجاد کن و typecheck/contract tests را سبز نگه دار.
- [ ] Step 4: `SymbolRegistry` مرکزی و محاسبات decimal را اضافه کن؛ ثابت‌های pip/contract/symbolId را حذف و تست‌های XAUUSD، EURUSD، GBPUSD و USDJPY را با سناریوهای مرزی کامل کن.
- [ ] Step 5: همه مسیرهای سفارش را به risk gate واحد وصل کن و سقف ۰٫۲۵٪، SL، quote freshness، spread، conversion و lot constraint را در ایجاد intent و worker دوباره enforce کن.
- [ ] Step 6: schema PostgreSQL و migrationهای اولیه را بساز؛ repositoryهای async برای session، token، outbox، journal، snapshot، audit، kill switch و executor lease را پیاده کن.
- [ ] Step 7: تست‌ها را از `.data/server_state.json` جدا کن، PostgreSQL/Redis موقت یا adapter in-memory ایزوله بساز و ابزار import یک‌باره داده محلی را با dry-run و rollback آماده کن.
- [ ] Step 8: OAuth را با CSPRNG state، PKCE، consume-once، allowlist redirect، exchange امن، token رمز‌شده، refresh، revoke و logout کامل کن؛ تست CSRF/replay/expiry بنویس.
- [ ] Step 9: نشست مرورگر را به session ID opaque تبدیل کن و worker را به token repository متصل کن؛ ثابت کن ورود OAuth واقعاً account دمو را bind می‌کند.
- [ ] Step 10: rate limiter توزیع‌شده Redis، Origin/Fetch Metadata guard، redaction و احراز هویت GETهای journal/outbox/diagnostics را اعمال کن.
- [ ] Step 11: worker مستقل cTrader Demo را بساز؛ lifecycle اتصال، backoff، heartbeat، token refresh، graceful shutdown و health endpoint را با fake gateway تست کن.
- [ ] Step 12: outbox consumer را با claim تراکنشی، idempotency، fencing token، kill switch و حالت `UNKNOWN_PENDING_RECONCILIATION` پیاده کن؛ تست crash/restart و duplicate delivery را بگذران.
- [ ] Step 13: reconciliation دوره‌ای order/position/protection را فعال کن و در mismatch بحرانی اجرای سفارش را خودکار مسدود و audit/alert تولید کن.
- [ ] Step 14: APIهای فعلی را به serviceهای جدید منتقل کن، پاسخ‌ها را استاندارد و routeهای قدیمی را با دوره سازگاری deprecate کن؛ endpoint اجرای test را در production ببند.
- [ ] Step 15: UI وضعیت اتصال و provenance را از API واقعی تغذیه کن؛ برچسب ONLINE ثابت را حذف و order ticket را در هر وضعیت غیر از `READY_DEMO_EXECUTION` با دلیل روشن غیرفعال کن.
- [ ] Step 16: `app/page.tsx`، chart و research desk را مرحله‌ای بشکن؛ polling را به hookهای SWR با backoff/abort منتقل و AI/modalهای سنگین را lazy-load کن.
- [ ] Step 17: دسترس‌پذیری و responsive را اصلاح کن: کنترل ۴۴×۴۴، keyboard/focus، dialog، aria-live، کنتراست، reduced motion، RTL و نبود overflow در viewportهای هدف.
- [ ] Step 18: شبیه‌ساز را با bid/ask، هزینه، slippage، gap، partial fill و intrabar policy ارتقا بده؛ نتایج seeded قبل/بعد و عدم دوباره‌شماری PnL را تأیید کن.
- [ ] Step 19: manifest داده، hash، timezone/gap validation، جداسازی train/OOS، cost stress و acceptance report نسخه‌دار را کامل کن؛ هر خروجی را با provenance نمایش بده.
- [ ] Step 20: مرز AI آفلاین را enforce کن: schema validation، timeout، fallback، model hash و ممنوعیت دسترسی به execution/token؛ دانلود مدل فقط با اقدام کاربر باشد.
- [ ] Step 21: runner آزمون و CI را کامل کن تا هیچ suite جا نیفتد؛ unit، integration، Playwright desktop/mobile، build، audit و secret scan همگی gate اجباری باشند.
- [ ] Step 22: log و metrics ساختاریافته، dashboard و alertهای gateway/quote/outbox/lease/reconciliation را اضافه و redaction را با تست payload تأیید کن.
- [ ] Step 23: Firebase App Hosting، Cloud SQL، Redis، Secret Manager و Cloud Run worker را ابتدا در staging ایجاد کن؛ migration backward-compatible، backup و restore آزمایشی را اجرا کن.
- [ ] Step 24: smoke واقعی cTrader Demo را با یک حساب آزمایشی و حداقل حجم مجاز انجام بده: OAuth، quote، intent، risk rejection، submit، modify protection، cancel/close، restart و reconciliation؛ شواهد broker و telemetry را جدا از تست مصنوعی ثبت کن.
- [ ] Step 25: kill switch، قطع شبکه، token expiry، stale quote، Redis/DB outage و دو worker هم‌زمان را در staging تمرین کن و تأیید کن هیچ سفارش ناخواسته یا تکراری ایجاد نمی‌شود.
- [ ] Step 26: اسناد architecture، security boundary و demo runbook را با رفتار نهایی هماهنگ کن؛ ادعاهای تاریخی را archived و README را به وضعیت اثبات‌شده محدود کن.
- [ ] Step 27: پس از تأیید همه gateها، frontend و worker را با rollout مرحله‌ای منتشر کن؛ ابتدا read-only، سپس demo execution با unlock اپراتور، و برنامه rollback/monitoring فعال باشد.
- [ ] Step 28: پس از دوره پایش، adapter فایل، routeهای deprecated و تنظیمات استقرار دوم را حذف کن؛ دوباره test کامل، audit امنیت، backup/restore و مرور دستی رابط را انجام بده.
