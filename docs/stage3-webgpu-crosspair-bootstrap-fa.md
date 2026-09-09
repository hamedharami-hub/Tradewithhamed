# مرحلهٔ سوم: WebLLM مرورگری، اعتبارسنجی چندنمادی و Bootstrap

## خلاصهٔ اجرایی

مرحلهٔ سوم سه هدف داشت: اجرای واقعی WebLLM در مرورگر روی تمام candidateهای GBPUSD OOS، مقایسهٔ providerها روی EURUSD و XAUUSD، و محاسبهٔ bootstrap confidence interval روی PnL معاملات واقعی.

نتیجهٔ اصلی این است که **cross-pair validation انجام شد، اما WebLLM هنوز measured نشده است**. harness مرورگری با Chromium و WebGPU راه‌اندازی شد، تمام 33 candidate GBPUSD نیز آماده شدند، اما اجرای مدل در این sandbox در وضعیت `LOADING` گیر کرد و بعد از timeout خروجی معتبر PASS تولید نکرد. بنابراین WebLLM همچنان باید `BLOCKED` تلقی شود و هیچ نتیجه‌ای به آن نسبت داده نمی‌شود.

## 1. اجرای تمام candidateهای GBPUSD OOS

فایل candidate packet شامل **33 candidate** از OOS GBPUSD است و از همان dataset نسخه‌دار و همان evaluation boundary تولید شده است:

| ویژگی | مقدار |
|---|---:|
| Dataset | `DS-HISTDATAAGGREGATED-GBPUSD-1H-dd467dfc2f05` |
| شروع OOS | `2024-09-12T01:00:00Z` |
| تعداد candidate | 33 |
| مدل انتخاب‌شده | `phi-4-mini-instruct-mlc` |
| مرورگر | Chromium 151 |

harness ابتدا candidateها را از فایل عمومی می‌خواند، WebGPU را probe می‌کند، مدل را بارگذاری می‌کند، شبکه را قطع می‌کند، سپس هر candidate را با Scanner، Analyst، Critic و Judge بررسی می‌کند.

دو تلاش انجام شد. تلاش اول به دلیل اجرای دوبارهٔ effect در React Strict Mode با خطای `AI_OPERATION_BUSY` متوقف شد. این defect اصلاح شد و قفل single-start اضافه گردید. تلاش دوم نیز در وضعیت بارگذاری مدل بدون خروجی نهایی ماند و به‌صورت timeout متوقف شد. artifact آن خالی یا PASS نیست؛ در نتیجه **نتیجهٔ عصبی معتبر وجود ندارد**.

این رفتار از نظر کنترل ریسک درست است: WebLLM نباید با صفر یا نتیجهٔ حدسی جایگزین شود.

## 2. benchmark چندنمادی

هر benchmark روی split مستقل 70/30 همان نماد، تایم‌فریم 1H و cost model پروژه اجرا شد. provider review در این مرحله برای هر نماد به 12 candidate محدود بود؛ بنابراین این بخش cross-pair pilot است، نه validation کامل همهٔ candidateها.

| نماد | حالت | معاملات | Win Rate | سود خالص | Max DD |
|---|---|---:|---:|---:|---:|
| GBPUSD | OFF | 29 | 31.0% | -185.45 | 2.44% |
| GBPUSD | Deterministic | 24 | 37.5% | -55.72 | 2.02% |
| GBPUSD | Online | 6 | 33.3% | -37.63 | 0.59% |
| GBPUSD | Hybrid | 5 | 60.0% | 69.01 | 0.36% |
| EURUSD | OFF | 17 | 41.2% | 44.90 | 0.96% |
| EURUSD | Deterministic | 12 | 50.0% | 99.06 | 0.83% |
| EURUSD | Online | 6 | 50.0% | 47.16 | 0.68% |
| EURUSD | Hybrid | 4 | 0.0% | -108.57 | 1.11% |
| XAUUSD | OFF | 14 | 35.7% | -5.74 | 1.05% |
| XAUUSD | Deterministic | 12 | 33.3% | -12.37 | 1.03% |
| XAUUSD | Online | 7 | 28.6% | -24.44 | 1.04% |
| XAUUSD | Hybrid | 6 | 33.3% | -7.08 | 0.87% |

### برداشت

Deterministic روی GBPUSD و EURUSD در این نمونه بهتر از OFF بوده، اما روی XAUUSD بهبود نداده است. Hybrid روی GBPUSD مثبت بوده، ولی روی EURUSD با چهار معامله کاملاً منفی شده و روی XAUUSD نیز منفی باقی مانده است. بنابراین ادعای «Hybrid به‌طور عمومی بهتر است» پشتیبانی نمی‌شود؛ نتیجه به نماد و regime وابسته است.

این یافته برای طراحی سیستم مهم است: provider باید **per-symbol و per-regime قابل ارزیابی** باشد و نباید یک AI mode به‌صورت global روی همهٔ بازارها فعال شود.

## 3. Bootstrap confidence intervals

Bootstrap با 10,000 تکرار روی PnL واقعی معاملات بسته‌شده اجرا شد. آمارهٔ گزارش‌شده expectancy یعنی میانگین PnL هر معامله است و فاصلهٔ زیر، percentile interval 95% bootstrap است.

| نماد | حالت | n | Mean Expectancy | CI 95% | احتمال مثبت در bootstrap |
|---|---|---:|---:|---:|---:|
| GBPUSD | OFF | 29 | -6.39 | [-18.51, 6.38] | 15.8% |
| GBPUSD | Deterministic | 24 | -2.32 | [-15.28, 12.91] | 42.2% |
| GBPUSD | Online | 6 | -6.27 | [-31.45, 18.93] | 32.0% |
| GBPUSD | Hybrid | 5 | 13.80 | [-17.54, 45.14] | 68.1% |
| EURUSD | OFF | 17 | 2.64 | [-14.21, 19.74] | 58.9% |
| EURUSD | Deterministic | 12 | 8.26 | [-10.95, 27.36] | 81.1% |
| EURUSD | Online | 6 | 7.86 | [-18.80, 33.74] | 65.7% |
| EURUSD | Hybrid | 4 | -27.14 | [-31.98, -23.51] | 0.0% |
| XAUUSD | OFF | 14 | -0.41 | [-14.75, 16.63] | 45.9% |
| XAUUSD | Deterministic | 12 | -1.03 | [-17.32, 16.36] | 40.6% |
| XAUUSD | Online | 7 | -3.49 | [-20.98, 15.01] | 33.3% |
| XAUUSD | Hybrid | 6 | -1.18 | [-22.52, 20.99] | 37.6% |

## تفسیر آماری و Overfitting

هیچ‌یک از حالت‌های GBPUSD یا XAUUSD فاصلهٔ اطمینان باریکی که کاملاً بالای صفر باشد ندارند. Hybrid GBPUSD میانگین مثبتی دارد، اما با فقط پنج معامله CI آن از منفی 17.54 تا مثبت 45.14 است؛ بنابراین این نتیجه از نظر آماری قطعی نیست.

EURUSD Deterministic و Online میانگین مثبت دارند، اما CI آن‌ها نیز صفر را قطع می‌کند. Hybrid EURUSD در این اجرای کوچک ضعیف است و CI به‌شدت منفی شده، ولی n=4 برای نتیجهٔ پایدار کافی نیست.

این bootstrap **عدم Overfitting را اثبات نمی‌کند**. برای اثبات قوی‌تر باید nested walk-forward، purged folds، ثبت همهٔ prompt/model revisionها، تصحیح multiple-hypothesis، آزمون روی دورهٔ زمانی جدید و حداقل تعداد معاملهٔ ازپیش‌تعیین‌شده انجام شود. Bootstrap فقط نشان می‌دهد با sample فعلی، عدم‌قطعیت چقدر زیاد است.

## artifactهای مرحلهٔ سوم

- [Candidate packet کامل GBPUSD](../public/webgpu-candidates-gbpusd.json)
- [نتیجهٔ WebGPU و وضعیت blocked/timeout](../data/runs/stage3-webgpu-gbpusd-oos.json)
- [Benchmark GBPUSD](../data/runs/stage3-gbpusd-provider-benchmark.json)
- [Benchmark EURUSD](../data/runs/stage3-eurusd-provider-benchmark-v2.json)
- [Benchmark XAUUSD](../data/runs/stage3-xauusd-provider-benchmark-v2.json)
- [Bootstrap analysis](../data/runs/stage3-bootstrap-analysis.json)
- [اسکریپت آماده‌سازی candidateها](../scripts/prepare-webgpu-gbpusd-candidates.ts)
- [harness مرورگری WebGPU](../scripts/browser-webgpu-gbpusd-oos.mjs)
- [صفحهٔ benchmark مرورگری](../app/webgpu-benchmark/page.tsx)
- [تحلیلگر Bootstrap](../scripts/analyze-bootstrap-benchmarks.ts)

## تصمیم مرحله

**Cross-pair validation: انجام شد، اما نتیجهٔ عمومی مثبت تأیید نشد.**

**WebLLM: هنوز BLOCKED است و نیاز به اجرای واقعی روی دستگاهی با WebGPU فعال، مدل قابل‌بارگذاری و زمان کافی برای دانلود/compile دارد.**

**Overfitting: با دادهٔ فعلی رد نشده است.** نشانه‌های مثبت GBPUSD کافی نیستند و قبل از Paper-Forward طولانی باید sample، fold و تعداد معاملات افزایش یابد.

اولویت بعدی:

1. اجرای WebLLM با مدل سبک‌تر و timeout قابل تنظیم روی مرورگر GPU واقعی.
2. اجرای provider benchmark با همهٔ candidateها، نه 12 مورد.
3. اجرای nested walk-forward روی حداقل سه fold زمانی.
4. افزودن multiple-testing correction و حداقل 30 تا 50 معامله برای هر مقایسه.
5. فقط پس از عبور از این شروط، ورود mode منتخب به Paper-Forward.
