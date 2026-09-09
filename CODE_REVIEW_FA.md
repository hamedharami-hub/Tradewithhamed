# گزارش بررسی کد و پیشنهادهای توسعه

**پروژه:** Hamed Trading Lab  
**نسخه بررسی‌شده:** `85b3f7c` از شاخه `main`  
**تاریخ بررسی:** ۲۰۲۶-۰۹-۰۹  
**دامنه بررسی:** ساختار Next.js، مسیرهای API، منطق سرور، ذخیره‌سازی، تست‌ها و اجزای رابط کاربری.

## جمع‌بندی مدیریتی

پروژه از نظر دامنه قابلیت‌ها غنی است و برای یک آزمایشگاه معاملاتی دمو، مرزهای ایمنی مناسبی مانند محیط Demo، کلید ضدتکرار، نشست اپراتور، توقف ورودهای جدید و بازتطبیق سفارش دارد. همچنین جداسازی نسبی قراردادها، موتورهای دامنه و route handlerها نقطه قوت مهمی است.

با این حال، **بزرگ‌ترین ریسک ساختاری تمرکز بیش از حد منطق در چند فایل بزرگ و اتکای هم‌زمان به وضعیت حافظه‌ای، فایل JSON سرور و localStorage مرورگر است**. در وضعیت فعلی، پروژه برای ادامه توسعه مناسب است، اما پیش از افزودن قابلیت‌های مالی جدید بهتر است مرزهای دامنه، اعتبارسنجی ورودی، تست قابل اجرا و مدل ذخیره‌سازی تثبیت شوند.

## نقاط قوت مشاهده‌شده

| حوزه | مشاهده |
|---|---|
| کنترل ریسک | منطق ریسک، حداقل حجم، محیط Demo و توقف اضطراری در چند لایه بررسی شده‌اند. |
| اجرای سفارش | وجود idempotency، نشست تک‌مجری و مسیر reconciliation برای خطاهای مبهم طراحی خوبی است. |
| تست دامنه | تعداد زیادی آزمون پذیرش و امنیتی در `lib/**/__tests__` وجود دارد و سناریوهای معاملاتی مهم را پوشش می‌دهد. |
| رابط کاربری | رابط فارسی، RTL، PWA، حالت‌های کاری جداگانه و پشتیبانی دسکتاپ/موبایل از قبل پیاده‌سازی شده‌اند. |
| مستندسازی | پوشه `docs/` شامل تصمیم‌ها، runbook، مرز امنیتی و چک‌لیست انتشار است. |

## یافته‌های مهم و پیشنهاد اصلاحی

### ۱. شکستن صفحه اصلی و تبدیل آن به composition root

`app/page.tsx` حدود ۳۰ هزار بایت دارد و هم‌زمان state جلسه، replay، ریسک، هشدار، outbox، اجرای سفارش و انتخاب workspace را مدیریت می‌کند. این تمرکز باعث می‌شود هر تغییر رابط کاربری به منطق معاملاتی و هر تغییر موتور معاملاتی به صفحه اصلی وابسته شود.

**پیشنهاد:** صفحه را به لایه‌های زیر تقسیم کنید:

1. `features/replay` برای ساعت مجازی، کندل‌های قابل مشاهده و کنترل بازپخش.
2. `features/execution` برای پیش‌نویس سفارش، تأیید، outbox و reconciliation.
3. `features/journal` برای پوزیشن‌ها، رویدادها و آمار.
4. `features/ai` برای انتخاب مدل، council و تحلیل shadow.
5. `app/page.tsx` فقط برای اتصال workspaceها و layout باقی بماند.

برای state نیز یک `TradingSessionProvider` یا store واحد با reducerهای دامنه‌ای ایجاد کنید. هر reducer باید transitionهای محدود و قابل تست داشته باشد؛ کامپوننت‌ها نباید مستقیماً چندین موتور singleton را فراخوانی کنند.

**اولویت:** بسیار بالا.  
**اثر:** کاهش coupling و ریسک regression.  
**پیچیدگی:** متوسط تا زیاد.

### ۲. ایجاد لایه validation مشترک برای API

در routeهای API، اعتبارسنجی دستی در هر handler تکرار شده است. در بعضی مسیرها نیز بدنه ورودی با cast بررسی می‌شود؛ برای نمونه در مسیر submit، `simulateMissingProtection` از طریق `(body as any)` خوانده می‌شود. این الگو احتمال اختلاف بین قرارداد TypeScript و ورودی واقعی HTTP را بالا می‌برد.

**پیشنهاد:** یک schema برای هر command بسازید، مانند:

- `SubmitOrderSchema`
- `ReconcileOrderSchema`
- `OperatorSessionSchema`
- `JournalCommandSchema`
- `RecoveryCommandSchema`

سپس یک helper مشترک مانند `parseJsonBody(request, schema)` بسازید که خطاهای ساختاری را به پاسخ یکسان `400` تبدیل کند. برای کاهش وابستگی می‌توان از Zod یا یک validator کوچک داخلی استفاده کرد. خروجی خطا باید شامل `code` پایدار، پیام فارسی برای UI و جزئیات لاگ‌شونده برای سرور باشد.

**اولویت:** بالا.  
**اثر:** کاهش خطاهای ورودی و ساده‌شدن routeها.  
**پیچیدگی:** متوسط.

### ۳. یکسان‌سازی احراز هویت و سیاست دسترسی API

در مسیرهایی مانند `recovery` و تغییرات ژورنال، نشست اپراتور و rate limit بررسی می‌شود. در مقابل، برخی endpointهای خواندنی مانند journal GET یا quotes GET بدون نشست پاسخ می‌دهند. این موضوع ممکن است عمدی باشد، اما باید به‌صورت صریح در ماتریس دسترسی ثبت شود؛ در غیر این صورت با اضافه‌شدن داده حساس، API ناخواسته عمومی می‌شود.

**پیشنهاد:**

- یک فایل `lib/server/access-policy.ts` ایجاد کنید.
- برای هر route، سطح دسترسی را مشخص کنید: `public`, `authenticated`, `operator`, `demo-execution`.
- helperهای `requireOperatorSession` و `requireDemoExecutionContext` بسازید تا بررسی‌ها در همه routeها یکسان باشند.
- برای endpointهای خواندنی نیز حداقل CORS، cache و سطح جزئیات خروجی را مشخص کنید.
- یک تست contract برای هر route بنویسید که درخواست بدون نشست، نشست نامعتبر و نشست معتبر را بررسی کند.

**اولویت:** بالا، به‌خصوص قبل از اتصال واقعی به broker.  
**اثر:** کاهش ریسک نشت داده و مسیرهای ناهمگون امنیتی.  
**پیچیدگی:** متوسط.

### ۴. جایگزینی ذخیره‌سازی فایل JSON با repository پایدار

`PersistentStore` با cache حافظه‌ای، `writeFileSync`، فایل موقت و rename اتمیک کار می‌کند. این روش برای Demo تک‌پردازه قابل قبول است، اما برای چند instance، restart هم‌زمان، container ephemeral، backup واقعی و lock توزیع‌شده مناسب نیست. همچنین singletonهای حافظه‌ای در محیط serverless قابل اتکا نیستند.

**پیشنهاد مرحله‌ای:**

1. ابتدا interfaceهایی مانند `OutboxRepository`, `JournalRepository` و `ExecutorRepository` تعریف کنید.
2. پیاده‌سازی فعلی را با نام `FileRepository` حفظ کنید تا رفتار Demo تغییر نکند.
3. یک adapter پایگاه داده اضافه کنید. برای شروع، SQLite با WAL برای نصب تک‌سرور مناسب است؛ برای چند instance، PostgreSQL انتخاب پایدارتر است.
4. migration، unique constraint روی `idempotencyKey` و transaction برای تغییر outbox و journal اضافه کنید.
5. health check را به بررسی اتصال، نسخه schema و آخرین زمان commit مجهز کنید.

**اولویت:** بالا برای محیط تولید؛ متوسط برای Demo محلی.  
**اثر:** افزایش قابلیت بازیابی و جلوگیری از ناسازگاری بین instanceها.  
**پیچیدگی:** زیاد.

### ۵. تبدیل آزمون‌های موجود به test suite قابل اجرای CI

فایل‌های آزمون دامنه‌ای فراوان هستند، اما `package.json` اسکریپت `test` ندارد و وابستگی مشخصی برای test runner دیده نمی‌شود. در نتیجه، وجود فایل تست به‌تنهایی تضمین نمی‌کند که آزمون‌ها در CI یا هنگام pull request اجرا شوند.

**پیشنهاد:**

- یک runner مشخص مانند Vitest اضافه کنید.
- اسکریپت‌های `test`, `test:watch`, `test:coverage` و `typecheck` را به `package.json` اضافه کنید.
- آزمون‌های فعلی را از توابع دستی به `describe/it/expect` منتقل کنید یا runner فعلی داخلی را به یک command رسمی تبدیل کنید.
- برای routeها تست integration اضافه کنید.
- برای جریان‌های حساس، تست property-based روی risk calculator، rounding، idempotency و reconciliation اضافه کنید.
- در CI مراحل `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` و `npm run build` اجرا شوند.

**اولویت:** بسیار بالا.  
**اثر:** جلوگیری از regression هنگام refactor.  
**پیچیدگی:** متوسط.

### ۶. تعریف قرارداد خطا و observability

در بسیاری از catchها خطا به پیام خام تبدیل می‌شود یا با `catch {}` نادیده گرفته می‌شود. این رفتار برای UI مناسب است، اما برای تشخیص رخدادهای معاملاتی کافی نیست. علاوه بر آن، health route در پاسخ خطا پیام exception را برمی‌گرداند که ممکن است جزئیات داخلی را آشکار کند.

**پیشنهاد:**

- کلاس‌های خطای typed مانند `ValidationError`, `ConflictError`, `BrokerTimeoutError` و `ReconciliationRequiredError` تعریف کنید.
- پاسخ API استانداردی مانند `{ ok, error: { code, message, requestId } }` داشته باشید.
- برای هر درخواست `requestId` تولید و در log و پاسخ ثبت کنید.
- لاگ ساختاریافته با حذف token، access key و payload حساس اضافه کنید.
- metricهای latency، خطای broker، outbox pending، reconciliation و stale feed را ثبت کنید.
- پیام exception خام را فقط در log داخلی نگه دارید و به client پیام عمومی بدهید.

**اولویت:** بالا.  
**اثر:** کاهش زمان عیب‌یابی و بهبود امنیت اطلاعات خطا.  
**پیچیدگی:** متوسط.

### ۷. کنترل polling و lifecycle در رابط کاربری

چند کامپوننت با `setInterval` به‌صورت مستقل endpointها را polling می‌کنند. این کار می‌تواند تعداد درخواست‌ها را افزایش دهد و هنگام فعال‌بودن چند workspace، داده‌های تکراری تولید کند.

**پیشنهاد:** یک `QueryClient` یا لایه `usePollingResource` مرکزی اضافه کنید که interval، backoff، visibility صفحه و abort request را مدیریت کند. وقتی tab مخفی است polling را کاهش دهید یا متوقف کنید. برای quotes از WebSocket یا Server-Sent Events استفاده کنید؛ برای journal و health، polling تطبیقی کافی است.

**اولویت:** متوسط.  
**اثر:** کاهش بار سرور و مصرف باتری، بهبود تازگی داده.  
**پیچیدگی:** متوسط.

### ۸. سخت‌گیری بیشتر در import/export و نسخه schema

اعتبارسنجی import در `lib/persistence/storage.ts` وجود دارد، اما فقط بخشی از فیلدها را بررسی می‌کند. برای نمونه `accountBalance`، `accountEquity`، `exportedAt` و برخی مرزهای عددی به‌صورت کامل validate نمی‌شوند و در پایان داده با cast به نوع کامل برگردانده می‌شود.

**پیشنهاد:** schema را با validator واقعی تعریف کنید، محدودیت اندازه فایل و عمق JSON بگذارید، `Number.isFinite` و دامنه عددی را برای همه اعداد اعمال کنید و migration از `v1.0` به نسخه‌های بعدی اضافه کنید. فایل واردشده باید قبل از اعمال، در حالت dry-run خلاصه تفاوت‌ها را نشان دهد.

**اولویت:** متوسط رو به بالا.  
**اثر:** جلوگیری از خراب‌شدن state و بهبود انتقال بین نسخه‌ها.  
**پیچیدگی:** کم تا متوسط.

## قابلیت‌های پیشنهادی جدید

| قابلیت | ارزش محصولی | طراحی پیشنهادی | اولویت |
|---|---|---|---|
| داشبورد ریسک لحظه‌ای | نمایش exposure، correlation، drawdown، margin و risk budget در یک نما | محاسبه در server domain و ارسال snapshot versioned به UI | بسیار بالا |
| replay قابل بازتولید | بازتولید دقیق یک جلسه برای بررسی خطا یا آموزش | seed، dataset version، config hash و event log را ذخیره کنید | بسیار بالا |
| گزارش عملکرد قابل صادرات | تبدیل ژورنال به گزارش روزانه/هفتگی با معیارهای قابل مقایسه | خروجی JSON/CSV و گزارش Markdown/PDF با فیلتر زمانی | بالا |
| هشدارهای چندکاناله | هشدار stale feed، نقض ریسک، timeout و نیاز به reconciliation | ابتدا in-app و Web Notification؛ سپس email یا Telegram با opt-in | بالا |
| feature flags و rollout | فعال‌سازی کنترل‌شده موتورهای AI، Demo execution و قابلیت‌های آزمایشی | flagهای server-side با audit log و kill switch | بالا |
| data quality monitor | تشخیص gap، timestamp نامرتب، spread غیرعادی و stale quote | pipeline مستقل قبل از ورود داده به replay و live shadow | بالا |
| مدیریت چند حساب Demo | مقایسه رفتار استراتژی و ریسک در حساب‌های جدا | `accountNamespace` مستقل، repository جدا و مجوز سطح حساب | متوسط |
| annotation و review workflow | علامت‌گذاری screenshot/کندل و بازبینی تصمیم‌ها | eventهای immutable برای note، tag، verdict و reviewer | متوسط |
| contract test برای broker adapter | جلوگیری از اختلاف بین simulator و cTrader | fake broker با سناریوهای timeout، partial fill و rejection | بسیار بالا |
| دسترس‌پذیری و localization | استفاده بهتر با صفحه‌کلید، screen reader و زبان‌های بیشتر | audit با axe، focus management و فایل ترجمه جدا | متوسط |

## برنامه پیشنهادی سه‌مرحله‌ای

### مرحله اول: ایمن‌سازی و قابلیت اطمینان

در این مرحله test runner و CI را اضافه کنید، validation مشترک بسازید، ماتریس دسترسی routeها را مستند و enforce کنید، و پاسخ خطا را استاندارد کنید. این مرحله باید قبل از هر قابلیت اتصال واقعی یا چندحسابی انجام شود.

### مرحله دوم: جداسازی معماری

در این مرحله `app/page.tsx` را به feature moduleها تقسیم کنید، repository interface بسازید، polling را مرکزی کنید و eventهای کلیدی را به audit log تبدیل کنید. رفتار فعلی باید با تست‌های regression حفظ شود.

### مرحله سوم: توسعه محصول

پس از تثبیت دو مرحله اول، داشبورد ریسک لحظه‌ای، replay بازتولیدپذیر، گزارش عملکرد، data-quality monitor و هشدارهای چندکاناله را اضافه کنید. این قابلیت‌ها بیشترین ارزش را برای تصمیم‌گیری و اعتماد کاربر ایجاد می‌کنند، بدون آن‌که فوراً دامنه امنیتی اتصال broker را گسترش دهند.

## ترتیب پیشنهادی backlog

| رتبه | کار | معیار پذیرش |
|---:|---|---|
| ۱ | اضافه‌کردن test runner و CI | اجرای موفق lint، typecheck، test و build در هر PR |
| ۲ | schema validation مشترک API | هیچ route حساس بدون parse و validation typed باقی نماند |
| ۳ | ماتریس دسترسی و helper احراز هویت | تست مثبت و منفی برای همه routeهای حساس |
| ۴ | استاندارد خطا، request ID و لاگ امن | عدم ارسال exception خام یا secret به client/log عمومی |
| ۵ | refactor صفحه اصلی | `app/page.tsx` فقط orchestration و layout داشته باشد |
| ۶ | repository abstraction | امکان تعویض FileRepository با SQLite/PostgreSQL بدون تغییر domain |
| ۷ | replay بازتولیدپذیر و data-quality monitor | یک session با config و seed یکسان دقیقاً نتیجه یکسان تولید کند |
| ۸ | داشبورد ریسک و گزارش عملکرد | شاخص‌ها از یک منبع محاسباتی معتبر و قابل تست تغذیه شوند |

## نتیجه نهایی

بهترین مسیر برای این پروژه، افزودن قابلیت‌های بیشتر به‌صورت مستقیم در `app/page.tsx` یا routeهای پراکنده نیست. ابتدا باید **قابلیت اجرای تست، قراردادهای ورودی، سیاست دسترسی و abstraction ذخیره‌سازی** تثبیت شود. سپس refactor feature-based انجام شود. بعد از آن، داشبورد ریسک، replay بازتولیدپذیر و پایش کیفیت داده بیشترین ارزش عملی را خواهند داشت.

## References

[1]: /home/ubuntu/Tradewithhamed/app/page.tsx "صفحه اصلی و orchestration رابط کاربری"

[2]: /home/ubuntu/Tradewithhamed/app/api/orders/submit/route.ts "مسیر ثبت سفارش"

[3]: /home/ubuntu/Tradewithhamed/app/api/operator/session/route.ts "مسیر نشست اپراتور"

[4]: /home/ubuntu/Tradewithhamed/app/api/recovery/route.ts "مسیر بازیابی اضطراری"

[5]: /home/ubuntu/Tradewithhamed/lib/server/storage/persistent-store.ts "ذخیره‌سازی پایدار فایل‌محور"

[6]: /home/ubuntu/Tradewithhamed/lib/persistence/storage.ts "اعتبارسنجی و انتقال وضعیت مرورگر"

[7]: /home/ubuntu/Tradewithhamed/package.json "اسکریپت‌ها و وابستگی‌های پروژه"

[8]: /home/ubuntu/Tradewithhamed/lib/core/__tests__ "آزمون‌های دامنه و پذیرش"

[9]: /home/ubuntu/Tradewithhamed/docs/release-checklist.md "چک‌لیست انتشار پروژه"

[10]: /home/ubuntu/Tradewithhamed/.env.example "متغیرهای محیطی و مرز پیکربندی"

— **Manus AI**
