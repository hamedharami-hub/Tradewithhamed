# ممیزی نهایی پیاده‌سازی سه‌مرحله‌ای هوش مصنوعی آفلاین

**وضعیت نهایی:** قبول با محدودیت‌های عملیاتی مشخص  
**تاریخ ممیزی:** ۹ سپتامبر ۲۰۲۶  
**دامنه:** ایمنی تصمیم‌های قطعی، اتصال واقعی WebLLM، مدیریت lifecycle، ذخیره‌سازی، رابط کاربری، آزمون‌های خودکار و build production.

## نتیجه اجرایی

سه مرحله پیاده‌سازی‌شده اکنون از منظر کد و آزمون‌های در دسترس **کامل و منسجم هستند**. مسیرهای مهمی که سابقاً می‌توانستند اجرای مدل عصبی را جعل کنند یا بدون evidence خروجی مثبت بسازند، به رفتار fail-closed تغییر یافته‌اند. خروجی هر مدل در وضعیت advisory باقی می‌ماند و مجوز مستقل برای سفارش ایجاد نمی‌کند.

یک ایراد باقی‌مانده در ممیزی نهایی کشف و همان‌جا اصلاح شد: متد همگام قدیمی `runShadowPipeline` هنگامی که با پروفایل neural فراخوانی می‌شد، هنوز می‌توانست متن تأیید غیرواقعی تولید کند. اکنون این مسیر با `NEURAL_ASYNC_REQUIRED` متوقف می‌شود و تنها `runShadowPipelineAsync` می‌تواند از adapter واقعی WebLLM استفاده کند.

## کنترل‌های سه مرحله

| مرحله | کنترل | وضعیت نهایی | شواهد پیاده‌سازی |
|---|---|---|---|
| ۱. ایمنی و صداقت | خروجی قطعی بدون evidence نباید معامله را تأیید کند. | **قبول** | `buildDeterministicAdvisory` برای قیمت، sweep، FVG، context و R:R reason code تولید می‌کند. نبود هر شرط لازم، `NO_TRADE` است. |
| ۱. ایمنی و صداقت | پاسخ مدل نباید به‌تنهایی مجوز سفارش باشد. | **قبول** | `StructuredCandidateAdvisory.advisoryOnly` همیشه `true` است. مسیر سفارش همچنان به کنترل‌های مستقل risk و OMS متکی است. |
| ۱. ایمنی و صداقت | query خالی RAG نباید evidence جعلی بسازد. | **قبول** | `LocalRAGEngine.search` برای query خالی آرایه خالی برمی‌گرداند. |
| ۲. اتصال واقعی WebLLM | مدل انتخاب‌شده باید artifact و registry معتبر داشته باشد. | **قبول** | `isModelSupported` فهرست `prebuiltAppConfig` را بررسی می‌کند و UI مدل‌های نامعتبر را غیرفعال می‌کند. |
| ۲. اتصال واقعی WebLLM | پروفایل neural باید inference واقعی یا توقف امن داشته باشد. | **قبول** | `webllm-agent-adapter.ts` مدل نگاشته‌شده و resident را الزام می‌کند؛ در غیر این صورت `REVIEW_REQUIRED` برمی‌گردد. |
| ۲. اتصال واقعی WebLLM | مسیر همگام نباید اجرای عصبی را جعل کند. | **قبول** | `runShadowPipeline` برای پروفایل neural با `NEURAL_ASYNC_REQUIRED` fail-closed است. |
| ۲. اتصال واقعی WebLLM | خروجی متن آزاد مدل باید validate شود. | **قبول** | JSON verdict، confidence، rationale و riskFlags parse و محدود می‌شوند؛ خطای parse به `REVIEW_REQUIRED` تبدیل می‌شود. |
| ۳. lifecycle و منابع | refresh مرورگر نباید VRAM resident جعلی نشان دهد. | **قبول** | resident model فقط در runtime memory نگهداری می‌شود و از `localStorage` بازیابی نمی‌شود. |
| ۳. lifecycle و منابع | عملیات همزمان نباید state مدل را خراب کند. | **قبول** | state machine تک‌عملیاتی و `AI_OPERATION_BUSY` برای load، generate، unload و delete وجود دارد. |
| ۳. lifecycle و منابع | «آفلاین تأییدشده» باید آزمون قطع شبکه واقعی داشته باشد. | **قبول** | تأیید فقط با cache مدل، `navigator.onLine === false` و inference موفق ثبت می‌شود. |
| ۳. lifecycle و منابع | fallback quantization نباید cache پنهان باقی بگذارد. | **قبول** | cache بررسی و حذف artifactهای q4f16 و q4f32 انجام می‌شود. |

## اصلاح ممیزی نهایی

موردی که پس از پیاده‌سازی اولیه باقی مانده بود، در متد همگام `AnalystCriticPipeline.runShadowPipeline` بود. این متد برای حفظ سازگاری با call siteهای synchronous وجود دارد. اگر پروفایل neural به آن داده می‌شد، قبلاً از evaluator قطعی استفاده می‌کرد و آن را به‌عنوان inference WebLLM معرفی می‌کرد. این مشکل اکنون رفع شد.

رفتار جدید روشن است: پروفایل neural در مسیر همگام نتیجه `passed: false`، reason code برابر `NEURAL_ASYNC_REQUIRED` و رأی `NO_TRADE` برمی‌گرداند. اجرای واقعی فقط از طریق مسیر async مرورگر صورت می‌گیرد و به مدل resident متکی است. یک regression test مستقل نیز برای این رفتار افزوده شد.

## نتایج اعتبارسنجی

| فرمان | نتیجه |
|---|---|
| `npm run typecheck` | موفق؛ بدون خطای TypeScript |
| `npm run lint` | موفق؛ بدون خطای ESLint |
| `npm test` | موفق؛ ۱۶ suite، ۸۸ check، صفر شکست |
| `npm run test:browser:smoke` | موفق در Chromium Headless |
| `npm run build` | موفق؛ build production، بررسی TypeScript و تولید ۱۳ صفحه کامل شد |
| `git diff --check` | موفق؛ whitespace error مشاهده نشد |

## محدوده‌ای که هنوز نیازمند آزمون دستگاه هدف است

نتیجه «قبول» به معنی آن است که پیاده‌سازی داخلی، build و آزمون‌های قابل اجرا سالم هستند. این نتیجه جایگزین آزمون عملکرد واقعی یک مدل چندگیگابایتی روی GPU دستگاه کاربر نیست. موارد زیر باید پیش از افزایش نقش AI از shadow به هر نقش عملیاتی دیگر، روی دستگاه‌های هدف اجرا شوند:

1. دانلود و اجرای واقعی هر مدل فعال روی browser و GPU هدف، با ثبت زمان بارگذاری، زمان اولین chunk، مصرف حافظه و errorهای WebGPU.
2. قطع واقعی شبکه بعد از cache کامل artifact و اجرای دکمه «تأیید آفلاین» برای هر مدل.
3. بارگذاری و توقف همزمان در رابط واقعی، به‌ویژه روی موبایل و حافظه محدود.
4. ارزیابی کیفیت خروجی WebLLM روی dataset برچسب‌خورده معاملات، با معیارهای precision، recall، نرخ false positive و نرخ `REVIEW_REQUIRED`.
5. بازبینی مستقل پیش از هر تغییری که بخواهد advisory مدل را به مجوز سفارش یا تغییر وضعیت OMS متصل کند.

> **حکم نهایی:** سه مرحله با کیفیت مناسب اجرا شده‌اند و از نظر ایمنی نسبت به نسخه قبلی به‌طور معناداری بهتر هستند. AI باید فعلاً در حالت آموزشی و shadow باقی بماند؛ این تصمیم یک محدودیت طراحی عمدی و صحیح است، نه نقص build.

## References

[1]: https://webllm.mlc.ai/docs/ "WebLLM documentation"

[2]: https://github.com/mlc-ai/web-llm "MLC WebLLM repository and prebuilt model configuration"

[3]: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API "MDN WebGPU API reference"
