# مرحلهٔ پنجم: اجرای واقعی Hybrid WebGPU در مرورگر

## آنچه پیاده‌سازی شد

یک مسیر مرورگری واقعی در `/webgpu-harness` اضافه شد که مراحل زیر را انجام می‌دهد:

1. تشخیص WebGPU با `BrowserOfflineAIManager.probeHardware()`؛
2. دانلود و بارگذاری واقعی مدل `phi-4-mini-instruct-mlc` با WebLLM؛
3. بررسی مقیم بودن مدل در WebGPU؛
4. آماده‌سازی آزمون Offline Verification؛
5. اجرای review چهارعاملی روی یک candidate ثابت GBPUSD؛
6. ثبت `source=WEBLLM_WEBGPU`، مدل مقیم، verdict، confidence و Judge decision.

اسکریپت CDP مرورگر نیز اضافه شد و واقعاً Chrome headless را با Remote Debugging اجرا می‌کند:

```bash
npm run test:browser:hybrid-webgpu
```

## نتیجهٔ اجرای واقعی در Sandbox

```json
{
  "status": "BLOCKED",
  "error": "WEBGPU_UNAVAILABLE",
  "runtime": {
    "state": "IDLE",
    "residentModelId": null,
    "selectedModelId": "s0-deterministic"
  }
}
```

این نتیجه به معنی شکست معماری نیست. معنی آن این است که Sandbox فعلی GPU/WebGPU قابل‌استفاده برای Chrome ندارد. در نتیجه مدل نه دانلود/کامپایل WebGPU شد و نه review عصبی اجرا شد. هیچ نتیجه‌ای به‌عنوان اثر AI ثبت نشده است.

## اجرای واقعی روی سیستم کاربر

روی لپ‌تاپ یا دسکتاپی که Chrome/Edge و WebGPU فعال دارد:

```bash
npm install
npm run test:browser:hybrid-webgpu
```

در اولین اجرا مدل Phi حدود ۲٫۱ گیگابایت دانلود می‌شود و اتصال شبکه لازم است. پس از آن برای Offline Verification باید شبکه قطع شود. برای اجرای موفق باید خروجی شامل `PASS` و `residentModelId` غیرخالی باشد.

برای مقایسهٔ علمی، اجرای browser harness باید برای candidateهای یکسان و با سه پیکربندی انجام شود:

- OFF؛
- DETERMINISTIC_COUNCIL؛
- HYBRID_WEBGPU.

## وضعیت مراحل بزرگ

| مرحله | وضعیت |
|---|---|
| ۱. Data Foundation و دادهٔ تاریخی چندنمبعی | تکمیل شده |
| ۲. Rule Base و Strategy Engine | تکمیل شده |
| ۳. Walk-Forward، OOS و تحلیل سشن/روز | تکمیل شده |
| ۴. Ablation اولیه GBPUSD | تکمیل شده؛ OFF در برابر شورای قطعی اجرا شد |
| ۵. اجرای واقعی Hybrid WebGPU | harness تکمیل شده؛ اجرای نهایی به سخت‌افزار WebGPU کاربر وابسته است |
| ۶. Paper-Forward با quote واقعی | باقی‌مانده؛ نیازمند منبع quote/credential دمو |
| ۷. تکرار چندساله و چندنمادی | باقی‌مانده |
| ۸. تصمیم نهایی Go/No-Go | باقی‌مانده |

بنابراین پس از Stage 5، **سه مرحلهٔ اصلی باقی می‌ماند**: Paper-Forward واقعی، اعتبارسنجی گستردهٔ چندنمادی/چندبازه، و تصمیم Go/No-Go.
