# مرحلهٔ دوم: AdvisoryProvider و benchmark GBPUSD OOS

## وضعیت اجرا

مرحلهٔ دوم از نظر فنی پیاده‌سازی و اجرا شد. یک لایهٔ provider قابل‌تعویض برای چهار حالت ساخته شد: **Deterministic، WebLLM، Online API و Hybrid**. این providerها فقط نقش advisory دارند و هیچ‌کدام دسترسی به broker، حجم معامله، حدضرر، حدسود یا اجرای سفارش ندارند.

اجرای benchmark روی دیتاست واقعی GBPUSD یک‌ساعتهٔ HistData انجام شد:

| ویژگی | مقدار |
|---|---:|
| Dataset | `DS-HISTDATAAGGREGATED-GBPUSD-1H-dd467dfc2f05` |
| بازهٔ OOS | از 2024-09-12 01:00 UTC |
| کندل‌های train/warmup | 4,369 |
| کندل‌های OOS | 1,873 |
| variant | `S0_SWEEP_FVG` |
| candidateهای review‌شده در این اجرای bounded | 12 |
| مدل Online | `gpt-5-nano` |
| cost model | همان baseline پروژه |

## نتایج OOS

| حالت | وضعیت | تأییدشده | معامله | Win Rate | Net Profit | Profit Factor | Expectancy | Max DD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| OFF | اندازه‌گیری‌شده | — | 29 | 31.0% | -185.45 | 0.68 | -6.39 | 2.44% |
| DETERMINISTIC_COUNCIL | اندازه‌گیری‌شده | 12 | 24 | 37.5% | -55.72 | 0.88 | -2.32 | 2.02% |
| WEBLLM | مسدود | 0 | 0 | — | — | — | — | — |
| ONLINE_ADVISORY | اندازه‌گیری‌شده | 6 | 6 | 50.0% | 37.82 | 1.40 | 6.30 | 0.33% |
| HYBRID_COMPARE | اندازه‌گیری‌شده | 8 | 7 | 57.1% | 90.33 | 2.04 | 12.90 | 0.63% |

## تفسیر فنی

در این اجرای آزمایشی، حالت Deterministic نسبت به OFF زیان را از **185.45-** به **55.72-** کاهش داد، نرخ برد را از 31.0% به 37.5% رساند و drawdown را کمی پایین آورد؛ اما هنوز expectancy منفی و Profit Factor کمتر از یک است. بنابراین Deterministic Council در این نمونه یک **فیلتر ریسک مفید** است، ولی هنوز سیستم سودده اثبات‌شده نیست.

حالت Online روی شش candidate اجازهٔ عبور داد و در همین OOS کوچک به 6 معامله، نرخ برد 50% و سود خالص 37.82 رسید. Hybrid هفت معامله اجرا کرد و سود خالص 90.33، Profit Factor برابر 2.04 و expectancy برابر 12.90 ثبت کرد. این نتیجه امیدوارکننده است، اما **اثبات برتری مدل نیست**؛ زیرا فقط 12 candidate برای review انتخاب شد، تعداد معاملات کم است و نتیجه به یک dataset، یک بازه و یک prompt وابسته است.

حالت WebLLM به‌درستی `BLOCKED` ثبت شد، نه صفرِ ساختگی. دلیل دقیق آن `WEBLLM_BROWSER_RUNTIME_REQUIRED` است: WebLLM باید داخل مرورگر با WebGPU و مدل resident اجرا شود. اجرای Node batch بدون مدل local resident نمی‌تواند به‌صورت معتبر نتیجهٔ عصبی تولید کند.

## دلایل reject در providerها

### Online

در شش مورد provider به‌دلیل خروجی‌هایی مانند `PendingConfirmation`، `RequiresFinalValidation` یا `ONLINE_ADVISORY_NOT_HARD_AUTHORITY` candidate را عبور نداد. این رفتار از نظر ایمنی درست است: مدل باید در صورت ambiguity به‌جای حدس‌زدن، معامله را رد یا برای review علامت‌گذاری کند.

### Hybrid

Hybrid علاوه بر Online، خروجی Deterministic Critic و Judge را هم بررسی کرد. چهار candidate رد شدند؛ مهم‌ترین دلایل `ANALYST_NOT_APPROVED` و `ANALYST_CONFIDENCE_BELOW_THRESHOLD` بودند. این نشان می‌دهد Hybrid حساس‌تر است و تعداد معامله را کاهش می‌دهد، اما در این نمونه کیفیت معاملات عبوری بهتر بوده است.

## محدودیت مهم benchmark فعلی

این اجرا یک **pilot benchmark** است، نه benchmark نهایی release. برای محدود نگه‌داشتن هزینه و زمان، فقط 12 candidate برای provider review ارسال شد؛ در حالی‌که اجرای simulator برای هر mode همهٔ signalهای OOS را می‌بیند و فقط candidateهای approved را عبور می‌دهد. بنابراین مقایسهٔ فعلی برای تصمیم نهایی کافی نیست.

برای benchmark معتبر مرحلهٔ بعد باید:

1. همهٔ candidateهای OOS یا حداقل یک sample از پیش‌تعریف‌شده و ثابت review شوند.
2. candidate set بین همهٔ modeها دقیقاً یکسان باشد.
3. prompt، model ID، model revision و temperature قفل شوند.
4. benchmark حداقل روی چند fold، چند session و چند symbol تکرار شود.
5. confidence interval، bootstrap و حداقل تعداد معامله اضافه شود.
6. Online با حداقل دو مدل سریع مقایسه شود؛ مثلاً `gpt-5-nano` و `gemini-3-flash-preview`.
7. WebLLM با harness مرورگری واقعی روی همان packetها اجرا و نتیجهٔ آن با همان candidate IDs به simulator بازگردانده شود.

## تغییرات کدی

فایل‌های اصلی اضافه یا اصلاح‌شده:

- `lib/ai/advisory-provider.ts`: interface و adapterهای Deterministic، WebLLM، Online و Hybrid.
- `scripts/run-gbp-provider-benchmark.ts`: اجرای benchmark تفکیکی OOS با concurrency محدود و خروجی JSON.
- `lib/research/contracts.ts`: modeهای `ONLINE_ADVISORY` و `HYBRID_COMPARE`.
- `lib/ai/offline-ai-contracts.ts`: sourceهای Online و Hybrid.
- `lib/research/experiment-engine.ts`: دروازهٔ provider و اجرای candidateهای approved در simulator.
- `data/runs/stage2-gbp-provider-benchmark.json`: artifact کامل benchmark.

## نتیجهٔ Go/No-Go

**Go برای ادامهٔ مرحلهٔ WebLLM browser benchmark و افزایش sample size.** نتیجهٔ فعلی نشان می‌دهد که AdvisoryProvider واقعی است و Online/Hybrid توانسته‌اند روی این sample کوچک candidateها را فیلتر کنند. اما **No-Go برای ادعای سوددهی یا فعال‌سازی خودکار معاملات**؛ چون OOS هنوز کم‌نمونه، تک‌نماد و partially reviewed است.

مدل AI در این معماری همچنان تصمیم‌گیرندهٔ مستقل نیست. تصمیم نهایی ترکیبی از Rule Engine، evidence packet، provider advisory و Judge قطعی است. هر provider نامعتبر، unavailable یا متناقض به عدم معامله یا review تبدیل می‌شود.

## artifact اجرا

[فایل خام benchmark](../data/runs/stage2-gbp-provider-benchmark.json)

## منابع و روش

دادهٔ بازار از dataset نسخه‌دار و UTC پروژه خوانده شد. اجرای شبیه‌سازی با cost model داخلی، تأخیر fill و commission انجام شد. Online provider با API سازگار با OpenAI و خروجی JSON Schema اجرا شد. WebLLM در Node عمداً اجرا نشد تا نتیجهٔ جعلی به مدل نسبت داده نشود.

نویسنده: **Manus AI**
تاریخ: 2026-09-09
