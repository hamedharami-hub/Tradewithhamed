# مرحلهٔ چهارم: فعال‌سازی WebLLM روی سخت‌افزار GPU

## نتیجهٔ محیط فعلی

مرحلهٔ چهارم از نظر کد و تشخیص محیط آغاز و اصلاح شد، اما اجرای واقعی مدل در sandbox فعلی امکان‌پذیر نیست؛ این محیط GPU سخت‌افزاری در اختیار ندارد.

شواهد محیط:

| بررسی | نتیجه |
|---|---|
| PCI GPU tools | `lspci` و `nvidia-smi` موجود نیستند |
| `/dev/dri` | دستگاه GPU قابل دسترس پیدا نشد |
| Vulkan physical device | فقط `llvmpipe` با `PHYSICAL_DEVICE_TYPE_CPU` |
| Vulkan driver | `DRIVER_ID_MESA_LLVMPIPE` |
| Chromium headless | `navigator.gpu === false` |
| WebGPU harness | بدون PASS؛ اجرای sandbox با timeout متوقف شد |

بنابراین BLOCKED بودن فعلی **مشکل منطق تصمیم‌گیری یا provider نیست**؛ محدودیت واقعی محیط اجراست.

## اصلاحات انجام‌شده

### ۱. انتخاب مدل واقعی از رجیستری WebLLM

مدل قبلی `phi-4-mini-instruct-mlc` در رجیستری WebLLM نصب‌شده موجود نبود و برای یک benchmark قابل‌اجرا انتخاب مناسبی نبود. یک پروفایل واقعی و سبک اضافه شد:

```text
Model: SmolLM2-360M-Instruct-q4f16_1-MLC
Project ID: smollm2-360m-mlc
Approximate size: 220 MB
Estimated VRAM: 600 MB
```

این مدل در `prebuiltAppConfig.model_list` نصب‌شده وجود دارد و برای smoke test اولیهٔ WebGPU مناسب است.

### ۲. نقش Agent جدید

پروفایل زیر اضافه شد:

```text
smollm2-360m-analyst
```

این پروفایل به artifact واقعی SmolLM2 نگاشت شده و برای Analyst و Critic در harness استفاده می‌شود. Scanner همچنان قطعی باقی می‌ماند؛ این تفکیک عمدی است و اجازه نمی‌دهد مدل زبانی جای evidence scanner را بگیرد.

### ۳. جلوگیری از اجرای دوباره

در صفحهٔ benchmark، `useRef` اضافه شد تا React Strict Mode باعث شروع دوبارهٔ عملیات load نشود. این اصلاح خطای قبلی `AI_OPERATION_BUSY` را برطرف می‌کند.

## چرا harness هنوز PASS نشد؟

Chromium این sandbox با WebGPU واقعی بالا نمی‌آید و Vulkan فقط CPU software renderer یعنی llvmpipe را گزارش می‌کند. به همین دلیل حتی مدل 360M نیز نباید به‌عنوان نتیجهٔ عصبی معتبر اجرا شود. اجرای طولانی harness با timeout قطع شد تا فرآیند معلق باقی نماند.

این رفتار fail-closed است و نتیجهٔ صحیح فعلی:

```text
WEBGPU_HARDWARE_REQUIRED
```

نه `PASS` و نه نتیجهٔ جعلی مدل.

## دستور اجرای واقعی روی دستگاه GPU

روی دستگاهی که GPU واقعی و Chromium WebGPU فعال دارد:

```bash
npm install
npm run typecheck
npm run lint
npx tsx scripts/prepare-webgpu-gbpusd-candidates.ts \
  data/datasets/histdata/histdata-gbpusd-1h-2024.dataset.json \
  public/webgpu-candidates-gbpusd.json

WEBGPU_BENCHMARK_PORT=3105 \\\nWEBGPU_BENCHMARK_DEBUG_PORT=9225 \\\nnpm run test:browser:webgpu-gbpusd
```

برای اجرای مستقیم نیز می‌توان استفاده کرد:

```bash
node scripts/browser-webgpu-gbpusd-oos.mjs
```

شرایط لازم:

1. GPU سخت‌افزاری با درایور صحیح Vulkan/D3D12/Metal.
2. فعال بودن `navigator.gpu` در Chromium.
3. فضای دیسک کافی برای cache مدل.
4. اتصال اینترنت فقط برای دانلود اولیهٔ artifact.
5. بعد از دانلود، قطع شبکه و اجرای verification آفلاین.
6. استفاده از همان dataset hash و candidate packet برای قابل‌تکرار بودن نتیجه.

در لینوکس باید در diagnostics چیزی شبیه GPU فیزیکی با `PHYSICAL_DEVICE_TYPE_DISCRETE_GPU` یا `INTEGRATED_GPU` دیده شود؛ `llvmpipe` کافی نیست.

## وضعیت فعلی Stage 4

| بخش | وضعیت |
|---|---|
| انتخاب artifact واقعی | انجام شد |
| نگاشت Agent به مدل | انجام شد |
| اصلاح Strict Mode | انجام شد |
| تشخیص سخت‌افزار | انجام شد |
| اجرای واقعی WebLLM در sandbox | مسدود به‌علت نبود GPU |
| اجرای واقعی روی GPU خارجی | آمادهٔ اجرا |

## تصمیم

کد برای اجرای روی سخت‌افزار دارای GPU آماده‌تر و دقیق‌تر شده است، اما از داخل این sandbox نمی‌توان ادعا کرد که WebLLM واقعاً inference انجام داده است. برای PASS واقعی باید همین harness روی سیستم دارای GPU اجرا شود و خروجی شامل `status: PASS`، `residentModelId` واقعی، hardware adapter و review تمام 33 candidate را تولید کند.
