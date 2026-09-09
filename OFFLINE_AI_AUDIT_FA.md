# گزارش ممیزی هوش مصنوعی آفلاین و اجرای درون‌مرورگر

**پروژه:** Hamed Trading Lab  
**دامنه ممیزی:** WebLLM/WebGPU، مدل‌های قطعی، RAG محلی، شورای چندایجنتی، رابط مدیریت مدل، ذخیره‌سازی محلی، وضعیت آفلاین و آزمون‌های اجرایی  
**نتیجه کلی:** کد پروژه از نظر TypeScript، ESLint و آزمون‌های دامنه بدون خطا عبور می‌کند، اما ادعاهای محصول درباره «اجرای ۱۰۰٪ آفلاین» و «استفاده واقعی از مدل عصبی در شورای ایجنت‌ها» با رفتار فعلی کد منطبق نیست. مهم‌ترین خطر، تولید خروجی مثبت و شبه‌تحلیلی از مسیرهای قطعی بدون استفاده از داده واقعی بازار است.

## خلاصه مدیریتی

زیرساخت WebLLM به‌صورت اولیه وجود دارد و مسیر واقعی ایجاد engine، اجرای WebGPU، استریم completion و توقف با `AbortController` در `lib/ai/browser-offline-ai.ts` پیاده شده است. با این حال، این مسیر فقط برای مدل‌هایی اجرا می‌شود که کاربر از پنجره مدیریت مدل انتخاب و بارگذاری کند. در مقابل، بخش مهمی از قابلیت‌هایی که در رابط «هوش مصنوعی آفلاین» و شورای ایجنت‌ها معرفی شده‌اند، در عمل مدل عصبی را فراخوانی نمی‌کنند و با منطق قطعی ثابت کار می‌کنند.

ممیزی محلی روی فهرست مدل‌های WebLLM نشان داد که دو شناسه مدل موجود در کاتالوگ برنامه در رجیستری نصب‌شده WebLLM پیدا نشدند: `DeepSeek-R1-Distill-Qwen-14B-q4f16_1-MLC` و `Qwen2.5-14B-Instruct-q4f16_1-MLC`. بنابراین انتخاب این مدل‌ها در UI می‌تواند تا زمان دانلود یا راه‌اندازی به خطای runtime منجر شود.

بررسی امنیتی و عملکردی نشان داد که برنامه بین «اجرای محلی» و «بدون شبکه» تفکیک دقیقی ندارد. دانلود مدل‌های WebLLM از مخزن مدل به شبکه نیاز دارد؛ فقط پس از cache شدن کامل مدل و موفقیت یک آزمون آفلاین می‌توان آن را بدون شبکه اجرا کرد. وضعیت فعلی این تمایز را به کاربر نشان نمی‌دهد.

## وضعیت اعتبارسنجی فعلی

| بررسی | نتیجه | تفسیر |
|---|---:|---|
| TypeScript typecheck | موفق | خطای ایستا در کد فعلی مشاهده نشد. |
| ESLint | موفق | خطای lint مشاهده نشد. |
| Domain tests | ۱۳ suite، ۶۵ check، صفر شکست | بیشتر آزمون‌ها منطق قطعی و قراردادها را پوشش می‌دهند. |
| آزمون واقعی WebGPU | اجرا نشده | محیط CLI فاقد مرورگر، GPU و CacheStorage واقعی است. |
| آزمون واقعی WebLLM worker | اجرا نشده | build به‌تنهایی موفقیت دانلود و استنتاج مدل را ثابت نمی‌کند. |
| آزمون بدون شبکه | اجرا نشده | هیچ browser E2E با قطع شبکه و مدل cache‌شده وجود ندارد. |

موفقیت typecheck و test به معنی سلامت runtime مرورگر نیست. در حال حاضر برای مسیرهای WebGPU، تست مرورگری واقعی، ماتریس مرورگر/دستگاه و تست قطع شبکه وجود ندارد.

## یافته‌های بحرانی

### یافته ۱: خروجی موتور قطعی برای هر snapshot نتیجه مثبت جعل می‌کند — شدت بحرانی

در `lib/ai/browser-offline-ai.ts` در خطوط 661 تا 685، مسیر `s0-deterministic` بدون بررسی candle، sweep، FVG، spread، خبر، حد ضرر یا ساختار واقعی، متنی تولید می‌کند که در آن sweep تأییدشده، FVG معتبر و ستاپ مجاز اعلام می‌شود. مسیر `deep-critic` نیز در خطوط 672 تا 684 به‌صورت ثابت R:R بالاتر از ۲ و نبود خبر را اعلام می‌کند.

این رفتار یک bug عملکردی مستقیم است، نه فقط محدودیت مدل. اگر این خروجی در تصمیم‌گیری معاملاتی استفاده شود، سیستم می‌تواند ستاپ ناموجود را معتبر جلوه دهد. همچنین `currentPrice` فقط در متن خروجی درج می‌شود و هیچ نقشی در محاسبه ندارد.

**اصلاح لازم:** موتور قطعی باید ورودی typed شامل candleها، ATR، spread، session، خبر، سطوح sweep، FVG، entry، SL و TP دریافت کند. اگر داده‌ای وجود ندارد، خروجی باید `NO_TRADE` با reason code مشخص باشد. هیچ متن موفقیت ثابت نباید در مسیر تولید باقی بماند.

### یافته ۲: انتخاب مدل عصبی در شورای ایجنت‌ها به استنتاج عصبی منجر نمی‌شود — شدت بحرانی

در `lib/core/analyst-critic.ts` خطوط 251 تا 263، اگر پروفایل نوع `WEBLLM_WEBGPU` داشته باشد، همان `evaluateCandidate` و `critiqueReview` قطعی اجرا می‌شوند. هیچ فراخوانی به `BrowserOfflineAIManager.runOfflineInferenceTest`، `CreateMLCEngine` یا engine عصبی وجود ندارد. فقط متن توضیح به کاربر می‌گوید استنتاج محلی WebLLM انجام شده است.

همین الگو در `lib/core/multi-agent-orchestrator.ts` نیز دیده می‌شود. در این فایل، `engineId` و `engineType` در خروجی ثبت می‌شوند، اما توابع `runScannerAgent`، `runAnalystAgent` و `runCriticAgent` بر اساس شرط‌های ثابت روی candidate پاسخ تولید می‌کنند. پس انتخاب Llama، Phi یا DeepSeek در تنظیمات فعلی فقط metadata را تغییر می‌دهد.

**اصلاح لازم:** قرارداد ایجنت باید دو مسیر صریح داشته باشد: `DETERMINISTIC` و `NEURAL_WEBGPU`. مسیر دوم باید async باشد، وضعیت engine را بررسی کند، prompt ساخت‌یافته بسازد، خروجی JSON schema را parse و validate کند و در صورت عدم دسترسی به مدل با reason code به مسیر fail-closed بازگردد. نام مدل تنها زمانی باید در نتیجه ثبت شود که همان مدل واقعاً inference انجام داده باشد.

### یافته ۳: دو شناسه مدل در رجیستری نصب‌شده وجود ندارند — شدت بالا

مقایسه کاتالوگ پروژه با `prebuiltAppConfig.model_list` بسته WebLLM نشان داد:

| شناسه | وضعیت در رجیستری نصب‌شده |
|---|---|
| `DeepSeek-R1-Distill-Qwen-14B-q4f16_1-MLC` | پیدا نشد |
| `Qwen2.5-14B-Instruct-q4f16_1-MLC` | پیدا نشد |

در `browser-offline-ai.ts` این مدل‌ها به‌عنوان مدل قابل انتخاب معرفی شده‌اند. هنگام بارگذاری، `CreateMLCEngine` یا worker می‌تواند با خطای model ID، artifact یا app config متوقف شود. fallback فعلی فقط در صورت نبود `shader-f16`، نام مدل را از `q4f16_1` به `q4f32_1` تبدیل می‌کند؛ برای شناسه‌ای که اساساً در registry وجود ندارد، این fallback کافی نیست.

**اصلاح لازم:** کاتالوگ مدل باید از registry واقعی در build یا startup تولید شود. هر مدل غیرقابل‌دسترسی باید در UI غیرفعال شود. برای مدل سفارشی باید `model_list`، URLهای artifact، tokenizer و revision دقیق در یک app config versioned ثبت شود.

### یافته ۴: عبارت «۱۰۰٪ آفلاین» در زمان دانلود نادرست است — شدت بالا

در UI مدیریت مدل، خطوط 251 تا 259 از `offline-ai-manager-modal.tsx` اجرای «بدون سرور، Ollama یا cloud» را اعلام می‌کند. در عین حال، `loadModelToMemory` در `browser-offline-ai.ts` خطوط 527 تا 580 ممکن است engine را ایجاد کند و WebLLM برای مدل cache‌نشده وزن‌ها را از شبکه دریافت کند. خود فایل نیز `modelUrl`های Hugging Face را در کاتالوگ ثبت کرده است.

این قابل قبول است اگر محصول بین دو وضعیت تفکیک کند: «دانلود اولیه با شبکه» و «استنتاج محلی پس از cache». وضعیت فعلی این دو را یکی می‌کند و می‌تواند به کاربر اطمینان اشتباه درباره عدم ارتباط شبکه بدهد.

**اصلاح لازم:** وضعیت‌ها باید دست‌کم شامل `REMOTE_DOWNLOAD_REQUIRED`، `CACHED_LOCAL_READY`، `LOCAL_INFERENCE_READY` و `OFFLINE_VERIFIED` باشند. قبل از اعلام آفلاین بودن، باید cache کامل، hash/revision و یک inference موفق با شبکه مسدودشده تأیید شود.

### یافته ۵: وضعیت `OFFLINE_VERIFIED` بیش از حد اعتمادپذیر ثبت می‌شود — شدت بالا

در `browser-offline-ai.ts` خطوط 748 تا 755، پس از هر استنتاج موفق WebLLM، `markOfflineVerified(modelId)` اجرا می‌شود. این استنتاج ممکن است همان اجرای اول پس از دانلود شبکه باشد. بنابراین نام وضعیت نشان می‌دهد مدل بدون شبکه آزمایش شده، در حالی که فقط inference موفق انجام شده است.

**اصلاح لازم:** آزمون آفلاین باید یک مرحله جدا داشته باشد. برنامه باید ابتدا network requestهای مدل را در service worker یا browser context قطع کند، سپس از cache مدل را load و inference انجام دهد. فقط موفقیت این آزمون باید `OFFLINE_VERIFIED` را ثبت کند. timestamp، artifact revision، browser version و مدل GPU نیز باید در رکورد ذخیره شوند.

## یافته‌های مهم عملکردی

### مدیریت مدل همزمان‌سازی نشده است

در `BrowserOfflineAIManager`، فیلدهای static مانند `activeEngine`، `activeWorker` و `currentResidentModelId` وجود دارند، اما mutex یا operation ID برای جلوگیری از اجرای همزمان `loadModelToMemory`, `unloadModelFromMemory`, `deleteModel` و `runOfflineInferenceTest` وجود ندارد. کاربر می‌تواند در زمان دانلود روی load، unload یا delete کلیک کند. نتیجه ممکن است شامل worker خاتمه‌یافته، engine آزادشده یا resident ID ناهماهنگ باشد.

راه‌حل پیشنهادی، یک state machine واقعی با `operationId` و صف تک‌عملیاتی است. هر عملیات باید cancellation-safe باشد و نتیجه عملیات قدیمی نتواند state جدیدتر را بازنویسی کند.

### resident model از localStorage بازیابی می‌شود، اما VRAM واقعاً خالی است

`getResidentModelId` در خطوط 465 تا 468 اگر مقدار localStorage موجود باشد همان model ID را برمی‌گرداند. پس از refresh صفحه یا restart tab، localStorage می‌تواند بگوید مدل مقیم است، در حالی که `activeEngine` برابر `null` است و مدل در VRAM نیست. UI در این حالت مدل را resident نمایش می‌دهد، اما مسیر inference دوباره باید آن را load کند.

باید resident بودن به یک session-only runtime state محدود شود. localStorage تنها می‌تواند `lastSelectedModel` یا `cachedModel` را نگه دارد، نه `residentInVRAM` را. هنگام startup مقدار resident باید `null` باشد تا پس از probe و load واقعی تغییر کند.

### fallback به q4f32 ناقص است

در خطوط 531 تا 538، مدل با جایگزینی رشته‌ای `q4f16_1` به `q4f32_1` fallback می‌شود. این تبدیل فقط زمانی امن است که مدل متناظر در registry و با artifact معتبر وجود داشته باشد. همچنین fallback مدل، وضعیت مدل انتخاب‌شده و cache را به‌روزرسانی نمی‌کند؛ بنابراین ممکن است مدل q4f32 بارگذاری شود ولی UI همچنان نام q4f16 را نمایش دهد.

fallback باید یک رکورد resolve‌شده شامل `requestedModelId`, `resolvedModelId`, `quantization`, `artifactRevision` و علت fallback داشته باشد.

### تشخیص حافظه GPU برای ظرفیت مدل کافی نیست

در `probeHardware` خطوط 391 تا 405، `maxBufferSize` به‌عنوان نشانه توانایی اجرای مدل استفاده می‌شود. این مقدار limit WebGPU است و معادل VRAM آزاد، memory budget واقعی، اندازه KV cache یا قابلیت اجرای مدل منتخب نیست. `isReadyForInference` نیز فقط برابر `hasWebGPU` است و اندازه مدل را در نظر نمی‌گیرد.

پروب باید برای مدل انتخابی یک dry-run یا allocation test انجام دهد و ظرفیت context، backend، shader، cache و memory error را ثبت کند. سطح‌بندی `WINDOWS_SNAPDRAGON` و `PIXEL_FOLD` فعلی نیز از user agent یا adapter دقیق استفاده نمی‌کند و ممکن است طبقه‌بندی اشتباه بدهد.

### callback استریم با «توکن» یکی نیست

در `runOfflineInferenceTest` خطوط 731 تا 740، هر `delta.content` به‌عنوان یک token شمرده می‌شود. API ممکن است یک delta شامل چند token یا بخشی از یک token بدهد. بنابراین `tokensPerSec` تقریبی است و نباید با دقت واقعی در UI گزارش شود. نام آن بهتر است `chunksPerSec` باشد، یا از usage metadata واقعی engine استفاده شود.

### stop کردن inference در worker به‌صورت کامل تأیید نشده است

`stopInference` فقط `AbortController` را abort می‌کند. برای WebLLM worker، stream ممکن است تا دریافت chunk بعدی متوقف نشود و خود worker همچنان منابع GPU را نگه دارد. باید signal cancellation با API پشتیبانی‌شده WebLLM بررسی شود و بعد از abort، timeout برای پاک‌سازی stream و در صورت نیاز terminate/recreate worker وجود داشته باشد.

## یافته‌های RAG محلی

### RAG محلی در واقع retrieval کلمه‌محور است، نه embedding معنایی

`LocalRAGEngine` در خطوط 106 تا 173 TF-IDF را در حافظه می‌سازد. نام «semantic RAG» در کامنت‌ها و UI، انتظار embedding یا درک معنایی ایجاد می‌کند، اما الگوریتم فعلی lexical TF-IDF به‌همراه unigram و bigram است. این برای یک موتور سبک و قابل‌پیش‌بینی مفید است، اما نباید با semantic embedding یکسان معرفی شود.

پیشنهاد می‌شود نام UI به «Local TF-IDF Retrieval» تغییر کند یا یک embedding واقعی محلی جداگانه با مدل کوچک اضافه شود. در هر دو حالت باید رتبه‌بندی با queryهای منفی، مترادف‌ها، املای عربی/فارسی و داده‌های خارج از corpus ارزیابی شود.

### جستجوی query خالی امتیاز ۱۰۰٪ برمی‌گرداند

در خطوط 221 تا 231، query خالی باعث می‌شود اولین chunkها با score برابر 100 برگردند. این رفتار ممکن است در grounding به‌عنوان evidence معتبر تعبیر شود. query خالی باید `[]` برگرداند یا صراحتاً با reason code `EMPTY_QUERY` رد شود.

### dynamic chunk index برای رشد ژورنال هزینه خطی و blocking دارد

در `registerJournalTrades`، ایندکس برای کل مجموعه دوباره ساخته می‌شود. در هر chunk، tokenها و Mapهای متعدد ایجاد می‌شوند. برای ژورنال کوچک مناسب است، اما در رشد داده، عملیات synchronous روی main thread می‌تواند UI را متوقف کند. rebuild باید debounce و worker-based شود یا index incremental داشته باشد.

### highlight برای زبان فارسی شکننده است

`generateHighlightSnippet` در خطوط 309 تا 319 عبارت normalized را در متن اصلی جستجو می‌کند. چون tokenize حروف و نیم‌فاصله را normalize می‌کند ولی content اصلی را تغییر نمی‌دهد، بسیاری از matched termها مانند شکل‌های دارای نیم‌فاصله در متن پیدا نمی‌شوند و snippet از ابتدای سند نمایش داده می‌شود. برای highlight باید index mapping بین متن normalized و متن اصلی نگه داشته شود.

## یافته‌های شورای چندایجنتی

### نام مدل، engine واقعی نیست

در `multi-agent-orchestrator.ts` گزینه‌هایی مانند Llama، Phi و DeepSeek در `AGENT_ENGINE_OPTIONS` نمایش داده می‌شوند، اما implementation همه آن‌ها را با rule-based functions اجرا می‌کند. آزمون `multi-agent-council.test.ts` نیز عمدتاً بررسی می‌کند که engine ID در خروجی همان مقدار config است؛ این آزمون اثبات نمی‌کند inference با مدل انجام شده است.

برای رفع این مشکل باید interface زیر تعریف شود:

```ts
interface AgentEngine {
  id: string;
  type: 'DETERMINISTIC' | 'WEBLLM_WEBGPU';
  isReady(): Promise<boolean>;
  evaluate(input: AgentInput, signal?: AbortSignal): Promise<AgentReviewResult>;
}
```

پس از آن، هر engine عصبی باید artifact revision، latency واقعی، prompt version و output validation را در نتیجه ثبت کند.

### امتیاز اجماع با نتیجه نهایی سازگار نیست

در `multi-agent-orchestrator.ts`، `quorumReached` به امتیاز حداقل ۷۵ و حداقل سه رأی approved وابسته است، اما `isApprovedForTrading` فقط `judgeReview.verdict` و شرط veto را بررسی می‌کند. این دو می‌توانند متفاوت باشند؛ در نتیجه ممکن است `quorumReached` برابر false باشد ولی `isApprovedForTrading` برابر true شود، یا بالعکس. برای سیستم معامله، یک policy واحد لازم است که نتیجه نهایی را از `quorumReached`, veto, risk guard و readiness مدل محاسبه کند.

### confidence و latency عمدتاً ثابت هستند

توابع ایجنت مقادیر ثابت مانند `0.88`, `0.92` و latencyهای config را برمی‌گردانند. این اعداد اندازه‌گیری واقعی نیستند. confidence باید به‌عنوان برآورد مدل یا نتیجه calibration معرفی شود، و latency باید از timer واقعی محاسبه شود. در غیر این صورت نمایش درصد اطمینان و زمان پاسخ به کاربر گمراه‌کننده است.

## رابط کاربری و خطاهای اجرایی

`offline-ai-manager-modal.tsx` در `refreshStatus` وضعیت مدل‌ها را به‌صورت ترتیبی و یکی‌یکی با `await` بررسی می‌کند. با تعداد مدل‌های فعلی، هر بار باز کردن modal چندین dynamic import و cache query انجام می‌دهد. این کار باید با cache کوتاه‌مدت و `Promise.allSettled` انجام شود تا شکست یک مدل کل probe را مختل نکند.

در همین modal، `handleLoadModel`, `handleUnloadModel` و `handleDeleteModel` در برابر exception محافظت کامل ندارند. خطاهای این عملیات می‌توانند به unhandled rejection یا UI بدون پیام منجر شوند. همه عملیات باید از یک helper مشترک با `try/catch/finally`, disabled state و abort پشتیبانی کنند.

`offline-ai-selector-modal.tsx` کامپوننتی است که در جستجوی wiring فعلی والد فعال مشخصی برای آن پیدا نشد. بنابراین احتمالاً بخشی از UI مرده یا مسیر انتخاب پروفایل جدا از `BrowserOfflineAIManager` است. حتی در صورت mount شدن، `onSelectProfile` فقط شناسه پروفایل را تحویل می‌گیرد و در خود modal به `loadModelToMemory` یا `MultiAgentOrchestrator.saveConfiguration` متصل نیست. این موضوع باعث می‌شود انتخابی که کاربر می‌بیند لزوماً مدل مورد استفاده را تغییر ندهد.

## نبود آزمون‌های حیاتی

پوشش فعلی روی RAG، منطق قطعی و قراردادهای دامنه خوب است، اما مسیر اصلی مدل آفلاین را اعتبارسنجی نمی‌کند. موارد زیر باید به browser E2E اضافه شوند:

| سناریو | انتظار |
|---|---|
| WebGPU موجود و مدل معتبر | engine با مدل resolve‌شده load شود و inference انجام شود. |
| WebGPU غایب | فقط مسیر deterministic بدون claim مدل عصبی فعال شود. |
| model ID نامعتبر | UI مدل را غیرفعال و خطای قابل‌فهم نشان دهد. |
| قطع شبکه پس از cache | inference موفق و `OFFLINE_VERIFIED` ثبت شود. |
| قطع شبکه پیش از cache | وضعیت `REMOTE_DOWNLOAD_REQUIRED` باقی بماند. |
| دوبار load همزمان | فقط یک engine ساخته شود. |
| unload هنگام inference | stream متوقف، worker پاک و state به `NOT_LOADED` برگردد. |
| refresh صفحه | مدل در VRAM مقیم گزارش نشود تا load واقعی انجام شود. |
| prompt مخرب یا عدد خارج از دامنه | خروجی ساخت‌یافته validation شود و تصمیم معامله مستقیم از متن آزاد گرفته نشود. |
| مدل عصبی انتخاب‌شده برای agent | telemetry ثابت کند همان model ID واقعاً اجرا شده است. |

## برنامه اصلاح پیشنهادی

### مرحله اول: اصلاح ایمنی و صداقت محصول

ابتدا خروجی‌های hard-coded مثبت از `runOfflineInferenceTest` حذف شوند. موتور قطعی باید تنها با داده بازار واقعی کار کند و در نبود evidence خروجی `NO_TRADE` بدهد. متن‌های UI درباره «۱۰۰٪ آفلاین» به دو حالت download و inference تفکیک شوند. مدل‌های ناموجود از catalog حذف یا با artifact معتبر جایگزین شوند. همچنین `isOfflineVerified` تا زمان اجرای آزمون واقعی با شبکه مسدودشده ثبت نشود.

### مرحله دوم: یکپارچه‌سازی engine واقعی

یک registry typed برای engineها ایجاد شود. انتخاب مدل WebLLM باید مستقیماً به manager، orchestrator و UI متصل باشد. هر agent عصبی باید async و قابل cancellation باشد. پاسخ آن باید JSON schema داشته باشد و قبل از استفاده در risk یا order pipeline validate شود. در صورت خطا، تصمیم تنها می‌تواند `NO_TRADE` یا `REVIEW_REQUIRED` باشد.

### مرحله سوم: مدیریت منابع و قابلیت اطمینان

مدیریت مدل به state machine تک‌عملیاتی تبدیل شود. وضعیت resident فقط runtime باشد. load و unload باید با mutex، operation ID، timeout و cleanup کامل انجام شوند. probe سخت‌افزاری باید با مدل انتخابی و dry-run واقعی تکمیل شود. گزارش telemetry باید زمان load، زمان اولین token، نرخ chunk، حافظه تقریبی، browser، backend، artifact revision و علت fallback را ثبت کند.

### مرحله چهارم: RAG و ارزیابی علمی

نام semantic RAG یا باید به TF-IDF retrieval تغییر کند یا embedding واقعی اضافه شود. query خالی اصلاح شود. benchmark باید شامل precision@k، recall@k، MRR، queryهای خارج از دامنه و مجموعه تست ثابت باشد. آزمون latency باید روی browser واقعی و datasetهای چندحجمی اجرا شود، نه فقط یک اجرای Node.

### مرحله پنجم: جداسازی تصمیم مدل از اجازه سفارش

هیچ متن آزاد یا confidence مدل نباید مستقیماً مجوز ارسال سفارش تولید کند. خروجی مدل باید فقط یک پیشنهاد ساخت‌یافته باشد. قوانین قطعی risk، execution، spread، freshness، news و protection باید مستقل بمانند. حتی اگر مدل neural پاسخ مثبت بدهد، نبود evidence یا نقض policy باید `NO_TRADE` ایجاد کند.

## جمع‌بندی نهایی

کد فعلی برای یک prototype پژوهشی آفلاین مناسب است و مسیر WebLLM پایه را در خود دارد، اما برای ادعای «هوش مصنوعی آفلاین واقعی و قابل اتکا در معامله» هنوز آماده نیست. اولویت بدون ابهام، حذف پاسخ‌های مثبت hard-coded، جلوگیری از نسبت دادن اجرای قطعی به مدل عصبی، اصلاح catalog مدل‌ها و پیاده‌سازی تست واقعی بدون شبکه است. پس از این اصلاحات، می‌توان مدیریت منابع و سپس ارزیابی کیفیت مدل را تکمیل کرد.

تا پیش از اجرای مرحله اول، پیشنهاد می‌شود خروجی هوش مصنوعی آفلاین صرفاً در حالت shadow و آموزشی باقی بماند و هیچ مسیر آن مجوز مستقل برای ارسال سفارش صادر نکند.

## References

[1]: https://github.com/mlc-ai/web-llm "MLC WebLLM repository and prebuilt model configuration"

[2]: https://webllm.mlc.ai/docs/ "WebLLM documentation"

[3]: https://developer.chrome.com/docs/ai/prompt-api "Chrome Prompt API and Gemini Nano availability"

[4]: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API "MDN WebGPU API reference"

[5]: https://www.w3.org/TR/webgpu/ "W3C WebGPU specification"
