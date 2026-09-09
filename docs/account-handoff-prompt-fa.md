من پروژهٔ `Tradewithhamed` را از یک اکانت Manus دیگر منتقل کرده‌ام. لطفاً ابتدا repository زیر را clone یا بررسی کن:

https://github.com/hamedharami-hub/Tradewithhamed

آخرین commit انتقال: `df39976`.

هدف پروژه ساخت یک آزمایشگاه Quantitative Trading برای Backtest، Walk-Forward، Out-of-Sample، Bootstrap و Paper-Forward است. Live Trading و هرگونه broker write ممنوع است. AI باید فقط به‌عنوان فیلتر/مشاور ساختاریافته و قابل‌اندازه‌گیری وارد شود، نه تولیدکنندهٔ آزاد سیگنال.

لطفاً این کارها را به‌ترتیب انجام بده:

1. فایل `docs/account-handoff-fa.md` را کامل بخوان.
2. فایل `docs/stage8-30d-paper-forward-runbook-fa.md` را برای ادامهٔ کار بخوان.
3. وضعیت Git، package و تست‌ها را بررسی کن.
4. این دستورات را اجرا کن:

```bash
npm ci
npm run typecheck
npm run test:domain
```

انتظار قبلی: ۱۹ suite، ۱۰۵ check و صفر failure.

نتیجهٔ آخرین benchmark معتبر GBPUSD چندساله روی 15M با Candidate Set مشترک 150تایی:

- OFF: 354 trades، Win Rate 33.9٪، Net Profit -3683.50، Max DD 38.04
- DETERMINISTIC: 343 trades، Win Rate 33.8٪، Net Profit -3728.41، Max DD 37.50
- ONLINE: 89 trades، Win Rate 42.7٪، Net Profit -158.67، Max DD 4.57
- HYBRID: 95 trades، Win Rate 43.2٪، Net Profit -164.64، Max DD 4.73
- WEBLLM: BLOCKED، چون GPU/WebGPU واقعی در محیط قبلی موجود نبود

Hybrid و Online از حداقل 30 معامله عبور کرده‌اند، ولی به‌دلیل Net Profit منفی هنوز promotion یا Live Trading مجاز نیستند. WebLLM باید فقط روی Browser مجهز به GPU واقعی تست شود و نباید نتیجهٔ شبیه‌سازی‌شده به‌عنوان نتیجهٔ WebLLM ثبت شود.

Artifactهای مهم محلی که ممکن است جداگانه منتقل شوند:

```text
data/runs/stage7-common-gbpusd-15m-2020-2024-all-modes.json
data/runs/stage7-common-gbpusd-15m-2020-2024-candidates.json
data/runs/stage7-common-gbpusd-1h-2020-2024-all-modes.json
data/runs/stage3-bootstrap-analysis.json
data/runs/stage7-hybrid-depth-analysis.json
data/runs/stage7-ctrader-readonly-diagnostics.json
data/datasets/stage1-dataset-quality.json
```

داده‌های خام و datasetهای حجیم در GitHub نیستند و باید از archive خصوصی یا با scriptهای `scripts/download-histdata-range.sh`, `scripts/import-histdata.ts`, `scripts/merge-histdata-years.ts` و `scripts/build-timeframes.ts` بازسازی شوند.

گام بعدی فقط اجرای Paper-Forward read-only سی‌روزه است:

1. ابتدا baseline با `DETERMINISTIC`.
2. سپس مقایسه با `ONLINE`.
3. سپس، فقط در GPU واقعی، اجرای Browser WebLLM.
4. گزارش تفکیکی session، weekday، symbol، feed gap، approval، trade count، Win Rate، Net PnL، Max Drawdown و Bootstrap CI.

هرگز secretها را در GitHub commit نکن. این متغیرها فقط در environment اکانت جدید تنظیم شوند:

```bash
CTRADER_CLIENT_ID
CTRADER_ACCESS_TOKEN
CTRADER_ACCOUNT_ID
CTRADER_ENVIRONMENT=demo
RUN_CTRADER=1
REQUIRE_CTRADER=1
```

قبل از هر monitor، `npm run research:ctrader:readonly-check` را اجرا کن و ادامه بده فقط اگر `readOnlySafe=true` و `forbiddenWriteSignals=0` باشد. هیچ سفارش واقعی یا write به broker انجام نده.

لطفاً از تکرار benchmarkهای پرهزینه بدون سؤال از من خودداری کن. ابتدا وضعیت موجود را با artifactها و گزارش‌های ثبت‌شده بررسی کن و فقط آزمایش‌هایی را اجرا کن که برای گام Paper-Forward یا رفع یک نقص مشخص لازم‌اند.
