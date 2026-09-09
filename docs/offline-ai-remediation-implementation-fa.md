# پیاده‌سازی سه‌مرحله‌ای اصلاح هوش مصنوعی آفلاین

**وضعیت:** تکمیل و اعتبارسنجی‌شده  
**دامنه:** ایمنی خروجی‌ها، اتصال واقعی WebLLM، مدیریت منابع و آزمون مرورگری  
**محدودیت ایمنی دائمی:** هیچ خروجی AI، چه قطعی و چه WebLLM، به‌تنهایی مجوز ارسال سفارش ایجاد نمی‌کند.

## مرحله ۱: ایمنی تصمیم و صداقت وضعیت آفلاین

مسیرهای قطعی `S0` و `Deep Critic` دیگر گزاره‌هایی مانند «سوییپ تأیید شد»، «FVG معتبر است» یا «ورود مجاز است» را بدون evidence واقعی تولید نمی‌کنند. قرارداد `DeterministicMarketEvidence` اکنون الزام‌های مشخصی برای قیمت معتبر، sweep، FVG، context، R:R، spread و خبر دارد. نبود هر evidence ضروری با reason code مانند `SWEEP_NOT_CONFIRMED`، `FVG_NOT_CONFIRMED` یا `RISK_REWARD_INSUFFICIENT` به `NO_TRADE` منجر می‌شود.

خروجی جدید `StructuredCandidateAdvisory` همیشه `advisoryOnly: true` دارد. حتی زمانی که evidence کامل باشد، نتیجه فقط برای تحلیل سایه و آموزش است و اجازه ارسال سفارش نیست.

واژه‌های رابط نیز اصلاح شدند. «استنتاج محلی» از «آفلاین تایید‌شده» تفکیک شده است. دانلود اولیه مدل WebLLM می‌تواند به شبکه نیاز داشته باشد. وضعیت آفلاین تنها زمانی ثبت می‌شود که مدل کامل در cache باشد، `navigator.onLine` برابر false باشد و آزمون inference با شبکه قطع‌شده موفق شود. اجرای عادی inference دیگر وضعیت `OFFLINE_VERIFIED` ثبت نمی‌کند.

مدل‌های فاقد artifact پشتیبانی‌شده در registry داخلی WebLLM از قبل قابل تشخیص‌اند و رابط آن‌ها را به‌عنوان غیرقابل اجرا نمایش می‌دهد. Chrome Prompt API نیز چون در این نسخه implementation ندارد، دیگر به‌اشتباه مانند موتور قطعی اجرا نمی‌شود.

موتور RAG محلی نیز برای query خالی fail-closed است؛ query خالی هیچ سندی را با اعتماد کاذب به‌عنوان evidence برنمی‌گرداند.

## مرحله ۲: اتصال واقعی WebLLM به تحلیل سایه

فایل `lib/ai/webllm-agent-adapter.ts` یک نگاشت صریح بین شناسه موتور ایجنت و مدل WebLLM قابل اجرا ایجاد می‌کند. این نگاشت شامل Llama 3.2 3B، Phi-4-mini، Qwen 3.5 در ظرفیت‌های پشتیبانی‌شده، Qwen 2.5 7B و DeepSeek R1 7B است. موتورهای فاقد artifact معتبر، به‌جای تولید نتیجه ساختگی، با `MODEL_NOT_SUPPORTED` یا `UNMAPPED_AGENT_MODEL` به حالت `REVIEW_REQUIRED` می‌روند.

`BrowserOfflineAIManager.evaluateCandidateAdvisory` مدل مقیم در GPU را با prompt ساخت‌یافته فراخوانی می‌کند. خروجی مدل باید JSON با verdict، confidence، rationale و riskFlags باشد. داده malformed، confidence خارج از بازه یا JSON نامعتبر، به خروجی fail-closed `REVIEW_REQUIRED` تبدیل می‌شود.

`AnalystCriticPipeline.runShadowPipelineAsync` اکنون برای پروفایل‌های WebLLM به adapter واقعی وصل شده است. رابط صفحه نیز این مسیر را فقط در مرورگر و به‌صورت async اجرا می‌کند. مدل در حافظه GPU بارگذاری نشده باشد، هیچ دانلود خودکاری رخ نمی‌دهد؛ نتیجه به‌شکل امن متوقف می‌شود. در عین حال، `MultiAgentOrchestrator` همگام در صورت انتخاب هر engine عصبی، ارسال سفارش را مسدود می‌کند تا نتیجه metadata به‌جای اجرای واقعی مدل، مجوز معامله ایجاد نکند.

## مرحله ۳: چرخه عمر مدل، مشاهده‌پذیری و آزمون مرورگری

مدیر مدل اکنون state machine تک‌عملیاتی با وضعیت‌های `IDLE`، `LOADING`، `GENERATING`، `UNLOADING`، `DELETING` و `ERROR` دارد. عملیات هم‌زمان با خطای `AI_OPERATION_BUSY` متوقف می‌شوند. `residentModelId` فقط state حافظه runtime است و دیگر در `localStorage` نگهداری نمی‌شود؛ بنابراین refresh صفحه مدل تخلیه‌شده را به‌اشتباه مقیم VRAM نشان نمی‌دهد.

بارگذاری مدل ابتدا از پشتیبانی واقعی آن در `prebuiltAppConfig` مطمئن می‌شود، سپس WebGPU را بررسی می‌کند. fallback `q4f16` به `q4f32` فقط در صورتی اعمال می‌شود که artifact جایگزین واقعاً در registry وجود داشته باشد. unload و delete، engine و worker را پاک‌سازی می‌کنند و حذف cache، رکورد تأیید آفلاین را هم حذف می‌کند.

شاخص نمایشی قدیمی `tokensPerSec` به `chunksPerSec` تغییر کرد، زیرا callback استریم WebLLM الزاماً با یک token واقعی یک‌به‌یک نیست. رابط هم وضعیت عملیات جاری، قابلیت واقعی Dedicated Worker، وضعیت resident و دکمه مستقل «تأیید آفلاین» را نمایش می‌دهد.

اسکریپت `scripts/browser-smoke.sh` و دستور `npm run test:browser:smoke` اضافه شدند. این آزمون یک dev server موقت راه‌اندازی می‌کند، Chromium headless را روی رابط اجرا می‌کند و DOM نهایی را بررسی می‌کند. این آزمون smoke است و جایگزین benchmark سخت‌افزار WebGPU یا آزمون مدل دانلودشده واقعی روی دستگاه کاربر نیست.

## روش استفاده ایمن

1. ابتدا از پنجره مدیریت مدل، سخت‌افزار WebGPU و پشتیبانی artifact را بررسی کنید.
2. یک مدل پشتیبانی‌شده را دانلود و سپس در حافظه GPU بارگذاری کنید. دانلود اولیه ممکن است شبکه مصرف کند.
3. مدل انتخاب‌شده فقط در تحلیل سایه استفاده می‌شود. هر `REVIEW_REQUIRED`، `NO_TRADE`، خطای مدل، قطع inference یا خروجی JSON نامعتبر باید به عدم معامله منجر شود.
4. برای نمایش «آفلاین تأییدشده»، شبکه دستگاه را واقعاً قطع کنید و دکمه «تأیید آفلاین» را بزنید. موفقیت این آزمون نشان می‌دهد مدل از cache محلی اجرا شده است.
5. کنترل‌های risk، freshness بازار، spread، خبر، OMS و execution باید مستقل از پاسخ متن آزاد مدل باقی بمانند.

## اعتبارسنجی نهایی

| فرمان | نتیجه |
|---|---|
| `npm run typecheck` | موفق |
| `npm run lint` | موفق |
| `npm test` | ۱۶ suite و ۸۷ check موفق |
| `npm run test:browser:smoke` | موفق در Chromium headless |
| `npm run build` | موفق؛ build production و TypeScript کامل |

## فایل‌های کلیدی

| فایل | مسئولیت |
|---|---|
| `lib/ai/offline-ai-contracts.ts` | evidence، advice، وضعیت runtime و رکورد تأیید آفلاین |
| `lib/ai/browser-offline-ai.ts` | lifecycle WebLLM، inference ساخت‌یافته، آزمون واقعی شبکه‌قطع و fail-closed |
| `lib/ai/webllm-agent-adapter.ts` | نگاشت engineهای AI به artifactهای WebLLM قابل اجرا |
| `lib/core/analyst-critic.ts` | اجرای async مدل واقعی در shadow pipeline |
| `app/page.tsx` | اتصال مدل منتخب به تحلیل سایه بدون اثرگذاری بر مجوز سفارش |
| `components/trading/offline-ai-manager-modal.tsx` | وضعیت پشتیبانی مدل، عملیات runtime و تأیید آفلاین |
| `scripts/browser-smoke.sh` | آزمون smoke مرورگر قابل تکرار |

## موارد باقی‌مانده برای production

این پیاده‌سازی مسیرهای خطرناک prototype را ایمن کرده است، اما production readiness همچنان به benchmark دستگاه‌های هدف، آزمون E2E واقعی WebGPU با مدل‌های دانلودشده، نگهداری versioned artifact registry، logging پایدار telemetry و ارزیابی کیفیت مدل با dataset برچسب‌خورده نیاز دارد. تا زمان تکمیل آن‌ها، نقش AI باید تحلیل سایه و آموزشی باقی بماند.
