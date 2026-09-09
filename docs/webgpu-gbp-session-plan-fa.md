# برنامهٔ فعال‌سازی WebGPU و بهینه‌سازی GBPUSD

## فعال‌سازی واقعی مدل عصبی

مدل عصبی در این پروژه فقط وقتی واقعی محسوب می‌شود که سه شرط هم‌زمان برقرار باشد: مدل در WebLLM registry پشتیبانی شود، artifact آن در CacheStorage مرورگر دانلود شده باشد، و همان مدل در حافظهٔ WebGPU مقیم باشد. در غیر این صورت adapter باید `MODEL_NOT_RESIDENT` یا `MODEL_NOT_SUPPORTED` برگرداند و Judge اجازهٔ معامله ندهد.

پیشنهاد عملی برای آزمایش اولیه این است که Analyst با `phi-4-mini-analyst` و Critic با `deepseek-r1-7b-critic` تنظیم شوند. Scanner و Judge بهتر است فعلاً قطعی بمانند؛ Scanner برای جلوگیری از ورود همهٔ candleها به مدل و Judge برای safety veto و fail-closed. این طراحی جایگزینی کامل Agentهای قطعی نیست، بلکه معماری hybrid و قابل‌اندازه‌گیری است.

مراحل مرورگر:

1. پروژه را با `npm run dev` اجرا کنید و با Chrome/Edge دارای WebGPU باز کنید.
2. در Hardware Probe مطمئن شوید `hasWebGPU=true` و `isReadyForInference=true` است.
3. از Offline AI Manager یک مدل سبک مانند `phi-4-mini-instruct-mlc` یا ابتدا `smollm2-360m-mlc` را دانلود کنید.
4. صبر کنید وضعیت به `READY` و سپس `OFFLINE_VERIFIED` برسد. تست offline باید درحالی انجام شود که شبکه قطع است.
5. در Multi-Agent Orchestrator، Analyst و Critic را روی موتورهای Neural WebGPU بگذارید و Scanner/Judge قطعی را نگه دارید.
6. حداقل یک candidate را در UI اجرا کنید و در trace بررسی کنید که `source=WEBLLM_WEBGPU`، `modelId` درست، `MODEL_NOT_RESIDENT` absent و `promptVersion=agent-prompts-v1` باشد.
7. برای ablation سه اجرا با candidateهای یکسان انجام دهید: بدون AI، شورای قطعی، و hybrid WebGPU.

مدل نباید خودسرانه سفارش ایجاد کند. خروجی آن فقط advisory است و تصمیم نهایی همچنان باید از Scanner، Critic/Judge قطعی و Risk Guardian عبور کند.

## نتیجهٔ GBPUSD فقط London و New York

اسکریپت اجراشده:

```bash
npm run research:optimize:gbp-session -- \
  --dataset data/datasets/histdata/histdata-gbpusd-1h-2024.dataset.json \
  --output data/runs/gbpusd-london-newyork-optimization-v1.json
```

تقسیم زمانی ۶۰/۴۰ انجام شد و فقط candidateهایی اجازهٔ ورود داشتند که در سشن‌های `LONDON` یا `NEW_YORK` UTC ایجاد شده بودند.

بهترین ترکیب Train، `BOS_ORDER_BLOCK_V1` با Target RR برابر ۲٫۵ بود:

| معیار | Train | OOS |
|---|---:|---:|
| Signals | 107 | 37 |
| معاملات بسته | 106 | 36 |
| Win rate | 36.8% | 30.6% |
| Net PnL | 481.45 | -4.91 |
| Profit Factor | 1.28 | 0.99 |
| Max Drawdown | 3.59% | 2.21% |

نتیجهٔ علمی: این انتخاب در Train بهتر بوده اما در OOS تقریباً به نقطهٔ سر‌به‌سر رسیده است. بنابراین **فعلاً edge قابل اتکا اثبات نشده و نباید به‌عنوان استراتژی فعال انتخاب شود**. گام بعدی، تکرار همین آزمون روی سال‌ها و datasetهای مستقل و سپس Paper-Forward است.

## نقشهٔ مراحل بعدی

### مرحلهٔ ۴: WebGPU Hybrid Ablation

مدل سبک ابتدا روی یک سیستم دارای WebGPU verify می‌شود. سپس با candidateهای ثابت، سه حالت بدون AI، شورای قطعی و Hybrid WebGPU مقایسه می‌شوند. معیار موفقیت، افزایش پایدار Profit Factor و کاهش Drawdown در OOS است، نه صرفاً افزایش تعداد معاملات.

### مرحلهٔ ۵: بهبود Research و جلوگیری از بیش‌برازش

GBPUSD روی چند بازهٔ زمانی، چند سال، چند timeframe و dataset مستقل اجرا می‌شود. Walk-Forward، purge gap، هزینهٔ spread/slippage، session attribution و day-of-week attribution باید هم‌زمان ثبت شوند. هر انتخابی که فقط در Train خوب باشد و در OOS افت کند، رد می‌شود.

### مرحلهٔ ۶: Paper-Forward واقعی

پس از ارائهٔ credentials دمو cTrader، worker read-only با `npm run research:live-paper` اجرا می‌شود. این worker سفارش بروکری ارسال نمی‌کند و فقط quote واقعی را به کندل بسته و Paper-Forward تبدیل می‌کند. حداقل دورهٔ معتبر برای قضاوت اولیه ۳۰ تا ۹۰ روز است.

### مرحلهٔ ۷: تثبیت Agent و Prompt

Promptهای Analyst و Critic با evidence packet نسخه‌بندی می‌شوند. خروجی باید JSON ساختاریافته، confidence، risk flags و evidence IDs داشته باشد. هر disagreement باید fail-closed شود و trace کامل برای بازبینی ذخیره شود.

### مرحلهٔ ۸: تصمیم Go/No-Go

فقط در صورت هم‌زمانی این شروط اجازهٔ ادامه داده می‌شود: OOS مثبت در چند بازه، PF بالاتر از ۱ پس از هزینه‌ها، Drawdown قابل‌قبول، عدم وابستگی شدید به یک سشن، و Paper-Forward پایدار. در غیر این صورت Rule یا prompt اصلاح و آزمایش از ابتدا تکرار می‌شود.
