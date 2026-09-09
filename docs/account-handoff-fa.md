# بستهٔ انتقال پروژه Tradewithhamed به اکانت Manus دیگر

## وضعیت انتقال

این سند برای ادامهٔ پروژه در یک اکانت Manus دیگر تهیه شده است. مرجع کد در GitHub قرار دارد:

```text
https://github.com/hamedharami-hub/Tradewithhamed
```

آخرین commit معتبر انتقال:

```text
df39976 docs: add cross-account project handoff package
```

Commit زیرساخت اصلی قبل از آن نیز در تاریخچهٔ Git موجود است:

```text
f10065b feat: complete quantitative research and paper trading foundation
```

مخزن در زمان تهیهٔ این سند clean و با `origin/main` همگام بوده است.

## خواستهٔ اصلی کاربر

کاربر می‌خواهد یک آزمایشگاه حرفه‌ای برای تحقیق کمی، Backtest عمیق، Walk-Forward، Out-of-Sample، Bootstrap و Paper-Forward read-only داشته باشد. سیستم باید قوانین مکانیکی را به‌صورت صریح اجرا کند و AI فقط به‌عنوان فیلتر/مشاور قابل‌اندازه‌گیری وارد تصمیم شود. هیچ Live Trading یا broker write مجاز نیست.

## نتیجهٔ معتبر آخرین آزمایش

آخرین آزمایش روی GBPUSD با دیتاست چندسالهٔ HistData، تایم‌فریم ۱۵ دقیقه، OOS ثابت و Candidate Set مشترک ۱۵۰تایی اجرا شد. همهٔ modeها دقیقاً همان candidateها را دریافت کردند تا Selection Effect کنترل شود.

| حالت | معاملات | Win Rate | Net Profit | Max Drawdown | وضعیت |
|---|---:|---:|---:|---:|---|
| OFF | 354 | 33.9٪ | -3,683.50 | 38.04 | حداقل نمونه عبور کرد، اما زیان‌ده |
| DETERMINISTIC | 343 | 33.8٪ | -3,728.41 | 37.50 | حداقل نمونه عبور کرد، اما زیان‌ده |
| ONLINE | 89 | 42.7٪ | -158.67 | 4.57 | Gate سی‌معامله عبور کرد، سود خالص منفی |
| HYBRID | 95 | 43.2٪ | -164.64 | 4.73 | Gate سی‌معامله عبور کرد، سود خالص منفی |
| WEBLLM | 0 | — | — | — | BLOCKED؛ GPU/WebGPU واقعی موجود نبود |

OOS از `2023-07-11T04:45:00Z` شروع شد و شامل ۳۶٬۳۸۴ bar بود. نتیجهٔ دقیق محلی در فایل زیر است که به‌علت سیاست عدم commit داده‌های run در GitHub قرار نگرفته است:

```text
data/runs/stage7-common-gbpusd-15m-2020-2024-all-modes.json
```

این آزمایش به معنی promotion نیست. Net Profit حالت‌های AI هنوز منفی است. Hybrid و Online فقط برای Paper-Forward و تحقیق بیشتر واجد شرایط‌اند.

## نتیجهٔ آزمایش قبلی 1H

در آزمایش GBPUSD یک‌ساعته با Candidate Set مشترک ۹۶تایی، Online با ۵۸ معامله از Gate عبور کرد، اما Hybrid با ۲۷ معامله به Gate نرسید. آزمایش ۱۵ دقیقه‌ای بعدی این کمبود نمونه را برطرف کرد و Hybrid را به ۹۵ معامله رساند.

## معماری فعلی

| لایه | محل اصلی |
|---|---|
| UI و workspaceها | `app/`, `components/` |
| قراردادهای بازار و استراتژی | `lib/contracts/` |
| Gateway و market data | `lib/gateway/` |
| اجرای امن و reconciliation | `lib/execution/`, `lib/server/` |
| استراتژی مکانیکی | `lib/research/strategy-rules.ts` |
| موتور تحقیق و Backtest | `lib/research/experiment-engine.ts` |
| Walk-Forward | `lib/research/walk-forward.ts` |
| Paper-Forward | `lib/research/paper-forward-runner.ts` |
| AI providers | `lib/ai/advisory-provider.ts` و `lib/ai/` |
| WebLLM browser adapter | `lib/ai/webllm-agent-adapter.ts` |
| تست‌های دامنه | `scripts/run-domain-tests.ts` و `lib/**/__tests__/` |
| اجرای OOS مشترک | `scripts/run-common-candidate-set-oos.ts` |
| benchmark providerها | `scripts/run-gbp-provider-benchmark.ts` |

## حالت‌های AI

`OFF` هیچ advisory را اعمال نمی‌کند. `DETERMINISTIC` از council قطعی و rule-based استفاده می‌کند. `ONLINE` از provider آنلاین سازگار با OpenAI استفاده می‌کند. `HYBRID` فیلتر deterministic و advisory آنلاین/AI را ترکیب می‌کند. `WEBLLM` باید داخل Browser مجهز به WebGPU واقعی اجرا شود و در Node یا CPU-only معتبر نیست.

در تمام حالت‌ها، candidate ابتدا باید از فیلتر مکانیکی عبور کند. AI نباید به‌عنوان تولیدکنندهٔ آزاد سیگنال خام تلقی شود. خروجی AI باید ساختاریافته، قابل ثبت و قابل مقایسه با OFF باشد.

## وضعیت تست نرم‌افزار

آخرین validation:

- TypeScript typecheck: موفق.
- Domain test suites: ۱۹ suite.
- Checks: ۱۰۵.
- Failures: صفر.

اجرای مجدد:

```bash
npm ci
npm run typecheck
npm run test:domain
```

## داده‌های خارج از GitHub

به‌دلیل حجم و سیاست repository، داده‌های خام، datasetهای تبدیل‌شده و runهای حجیم در `.gitignore` هستند. حجم فعلی تقریبی:

| دسته | حجم تقریبی |
|---|---:|
| `data/datasets/` | ۱.۲۳ گیگابایت |
| `data/runs/` | ۴۸۸ مگابایت |

Datasetهای چندساله شامل GBPUSD، EURUSD، USDJPY و XAUUSD در تایم‌فریم‌های M1، M5، M15، H1، H4 و D1 هستند. برای شروع سریع، datasetهای GBPUSD چندسالهٔ 1H و 15M مهم‌ترین مواردند.

Manifest و روش ساخت دوبارهٔ داده‌ها در repository و اسکریپت‌های زیر موجود است:

```text
scripts/download-histdata-range.sh
scripts/import-histdata.ts
scripts/merge-histdata-years.ts
scripts/build-timeframes.ts
scripts/report-datasets.ts
```

## مهم‌ترین artifactهای محلی

```text
data/runs/stage7-common-gbpusd-15m-2020-2024-all-modes.json
data/runs/stage7-common-gbpusd-15m-2020-2024-candidates.json
data/runs/stage7-common-gbpusd-1h-2020-2024-all-modes.json
data/runs/stage7-common-gbpusd-1h-2020-2024-candidates.json
data/runs/stage3-bootstrap-analysis.json
data/runs/stage7-hybrid-depth-analysis.json
data/runs/stage7-ctrader-readonly-diagnostics.json
data/datasets/stage1-dataset-quality.json
```

یک بستهٔ کوچک از همین artifactهای کلیدی در کنار این سند تولید شده است. datasetهای ۱.۲۳GB در آن بسته قرار ندارند و باید جداگانه منتقل یا بازسازی شوند.

## Credentialها و اطلاعاتی که نباید منتقل شوند

مقادیر `CTRADER_ACCESS_TOKEN`، `CTRADER_CLIENT_ID`، `CTRADER_ACCOUNT_ID` و کلیدهای Online AI هرگز در GitHub، این سند یا archive قرار نگرفته‌اند. در اکانت جدید باید credentialهای خود کاربر در secret/environment همان اکانت تنظیم شوند.

تنها محیط مجاز:

```text
CTRADER_ENVIRONMENT=demo
RUN_CTRADER=1
REQUIRE_CTRADER=1
```

قبل از monitor باید `npm run research:ctrader:readonly-check` اجرا شود و `readOnlySafe=true` و `forbiddenWriteSignals=0` تأیید شود.

## گام‌های بعدی

گام بعدی توسعهٔ بزرگ جدید نیست. باید Paper-Forward read-only سی‌روزه اجرا شود. دستورها و معیار پذیرش در این فایل repository آمده است:

```text
docs/stage8-30d-paper-forward-runbook-fa.md
```

ترتیب پیشنهادی این است: ابتدا Deterministic baseline، سپس Online، و فقط روی سخت‌افزار GPU واقعی WebLLM. گزارش نهایی باید تعداد نمونه، feed gap، approval، trade، Win Rate، Net PnL، drawdown، session و weekday را جدا کند. هیچ نتیجه‌ای بدون حداقل ۳۰ معامله و بررسی OOS/Bootstrap برای promotion کافی نیست.

## منابع داخلی

مستندات تحقیق و تصمیم‌های طراحی در `docs/` قرار دارند. برای درک سریع، این فایل‌ها اول خوانده شوند:

```text
docs/research-lab-foundation-fa.md
docs/deep-standard-research-mechanical-rules-ai-fa.md
docs/stage7-gpu-30trades-hybrid-analysis-fa.md
docs/stage7-common-candidate-oos-ctrader-report-fa.md
docs/stage8-30d-paper-forward-runbook-fa.md
```

این پروژه در محدودهٔ فعلی فقط تحقیق، Backtest و Paper Trading read-only است و نباید به Live Trading تغییر داده شود.
