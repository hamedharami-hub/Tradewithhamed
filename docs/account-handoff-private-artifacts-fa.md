# فهرست فایل‌های خصوصی خارج از GitHub

این فایل فقط توضیح می‌دهد چه artifactهایی روی ماشین قبلی وجود دارند و کدام‌ها باید جداگانه منتقل شوند. هیچ secret یا token در این فهرست وجود ندارد.

## بستهٔ کوچک پیشنهادی برای انتقال فوری

فایل archive ساخته‌شده در مسیر زیر قرار دارد:

```text
/home/ubuntu/Tradewithhamed-handoff-artifacts-20260909.tar.gz
```

این archive شامل گزارش‌های JSON کوچک و مهم برای ادامهٔ تحلیل است، اما datasetهای حجیم M1 تا D1 داخل آن نیستند.

## محتوای archive کوچک

```text
data/datasets/stage1-dataset-quality.json
data/runs/stage3-bootstrap-analysis.json
data/runs/stage7-hybrid-depth-analysis.json
data/runs/stage7-ctrader-readonly-diagnostics.json
data/runs/stage7-common-gbpusd-15m-2020-2024-all-modes.json
data/runs/stage7-common-gbpusd-15m-2020-2024-candidates.json
data/runs/stage7-common-gbpusd-1h-2020-2024-all-modes.json
data/runs/stage7-common-gbpusd-1h-2020-2024-candidates.json
data/runs/stage5-provider-benchmark.json
data/runs/stage3-gbpusd-provider-benchmark.json
data/runs/stage3-eurusd-provider-benchmark-v2.json
data/runs/stage3-xauusd-provider-benchmark-v2.json
```

## Datasetهای تاریخی

کل `data/datasets/` حدود ۱.۲۳GB است و شامل داده‌های چندسالهٔ HistData برای GBPUSD، EURUSD، USDJPY و XAUUSD در M1، M5، M15، H1، H4 و D1 است. مهم‌ترین فایل‌ها برای تکرار آخرین آزمایش:

```text
data/datasets/histdata/multi-year/histdata-gbpusd-15m-2020-2024.dataset.json
data/datasets/histdata/multi-year/histdata-gbpusd-1h-2020-2024.dataset.json
```

برای انتقال کامل، کل پوشهٔ `data/datasets/` را با یک روش خصوصی منتقل کن. برای انتقال حداقلی، همین دو فایل GBPUSD و `data/datasets/stage1-dataset-quality.json` کافی‌اند.

## سایر runهای تحقیق

کل `data/runs/` حدود ۴۸۸MB است. فایل‌های قبلی شامل Walk-Forward، ablation، session optimization، paper-forward و گزارش‌های مقایسه‌ای هستند. انتقال آن‌ها اختیاری است؛ archive کوچک آخرین شواهد ضروری را پوشش می‌دهد.

## مواردی که مطلقاً منتقل یا commit نشوند

- `.env` و هر فایل secret.
- `CTRADER_ACCESS_TOKEN` و OAuth credential.
- کلیدهای Online AI.
- اطلاعات حساب واقعی یا دادهٔ خصوصی broker.
- هر فایل حاوی token در log.

Credentialها باید در اکانت جدید دوباره و فقط برای cTrader Demo تنظیم شوند.
