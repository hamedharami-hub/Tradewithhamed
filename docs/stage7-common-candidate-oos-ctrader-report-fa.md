# گزارش اجرای کنترل Candidate Set مشترک و cTrader Read-only

## خلاصهٔ اجرایی

کنترل مقایسه‌ای با یک Candidate Set مشترک روی GBPUSD OOS اجرا شد. همهٔ modeها از همان ۳۳ candidate و همان dataset hash استفاده کردند. این کار Selection Effect را از طراحی آزمایش حذف می‌کند، اما Gate حداقل ۳۰ معامله برای هیچ modeی به‌جز baseline در این dataset عبور نکرد.

## Candidate Set مشترک

| مورد | مقدار |
|---|---:|
| نماد | GBPUSD |
| تایم‌فریم | 1H |
| train bars | 4369 |
| OOS bars | 1873 |
| تعداد candidate مشترک | 33 |
| Candidate Set hash check | موفق |
| Selection Effect بین modeها | حذف‌شده در سطح ورودی |

هر mode دقیقاً همان `candidateIds` را دریافت کرد. تفاوت تعداد معاملات بعد از این مرحله ناشی از approval gate، برخورد زمانی معاملات، open-position constraints و منطق اجرای شبیه‌ساز است؛ نه تفاوت در candidate discovery.

## نتیجهٔ Gate حداقل ۳۰ معامله

| حالت | وضعیت | معاملات | Win Rate | Net PnL | نتیجهٔ Gate |
|---|---|---:|---:|---:|---|
| OFF | baseline measured | 29 | 31.0٪ | -185.45 | شکست؛ 29 < 30 |
| DETERMINISTIC | measured | 24 | 37.5٪ | -55.72 | شکست؛ 24 < 30 |
| ONLINE | measured | 16 | 43.8٪ | 36.10 | شکست؛ 16 < 30 |
| HYBRID | measured | 21 | 28.6٪ | -179.87 | شکست؛ 21 < 30 |
| WEBLLM | blocked | 0 | — | — | شکست؛ GPU browser اجرا نشده |

### تفسیر

Gate هفتم **عبور نکرده است**. این نتیجه شکست فنی نیست؛ یک نتیجهٔ معتبر ضد-promotion است. دادهٔ فعلی برای ادعای عملکرد پایدار کافی نیست.

برای عبور باید یکی از این کارها انجام شود:

1. استفاده از بازهٔ OOS طولانی‌تر یا dataset چندساله با حفظ یک Candidate Set ثابت؛
2. تجمیع چند نماد با گزارش جداگانه و pooled analysis؛
3. اجرای مجدد با تایم‌فریم/نماد دیگری، بدون تغییر پس از مشاهدهٔ نتیجه؛
4. اجرای واقعی WebLLM روی Browser دارای GPU و تولید حداقل ۳۰ معامله برای همان Candidate Set.

افزایش مصنوعی تعداد معاملات یا تغییر Candidate Set پس از دیدن نتایج مجاز نیست.

## کنترل مشترک اجراشده

اسکریپت کنترل:

[اجرای OOS با Candidate Set مشترک](</home/ubuntu/Tradewithhamed/scripts/run-common-candidate-set-oos.ts>)

Runner اصلی اکنون از `--candidate-file` و `--modes` پشتیبانی می‌کند:

```bash
npx tsx scripts/run-gbp-provider-benchmark.ts \
  --dataset data/datasets/histdata/histdata-gbpusd-1h-2024.dataset.json \
  --candidate-file data/runs/stage7-common-gbpusd-candidates.json \
  --modes OFF,DETERMINISTIC,ONLINE,HYBRID,WEBLLM \
  --output data/runs/stage7-common-gbpusd-all-modes.json
```

Artifactها:

- `data/runs/stage7-common-gbpusd-candidates.json`
- `data/runs/stage7-common-gbpusd-all-modes.json`
- `data/runs/stage7-common-benchmark.log`

## بررسی اتصال cTrader Demo

[اسکریپت تشخیص cTrader read-only](</home/ubuntu/Tradewithhamed/scripts/check-ctrader-readonly.ts>)

اجرا:

```bash
npm run research:ctrader:readonly-check
```

نتیجهٔ فعلی:

```text
CTRADER_CLIENT_ID      <missing>
CTRADER_ACCESS_TOKEN    <missing>
CTRADER_ACCOUNT_ID      <missing>
CTRADER_ENVIRONMENT     <missing>
connectionReady         false
forbiddenWriteSignals   0
readOnlySafe             true
```

دو log قبلی نیز بررسی شدند و هر دو به‌درستی `BLOCKED` بودند:

```text
CTRADER_ACCESS_TOKEN، CTRADER_ACCOUNT_ID و CTRADER_CLIENT_ID تنظیم نشده‌اند.
```

هیچ سیگنال سفارش یا broker write پیدا نشد. بنابراین اتصال فعلاً برقرار نیست، اما safety boundary read-only حفظ شده است.

## پیکربندی موردنیاز برای اجرای واقعی

```bash
export CTRADER_CLIENT_ID="..."
export CTRADER_ACCESS_TOKEN="..."
export CTRADER_ACCOUNT_ID="..."
export CTRADER_ENVIRONMENT="demo"
export RUN_CTRADER=1
export REQUIRE_CTRADER=1
export MONITOR_SYMBOLS="GBPUSD"
export MONITOR_TIMEFRAME="5M"
export MONITOR_ANALYST_PROVIDER="DETERMINISTIC"

npm run research:ctrader:readonly-check
npm run stage7:gpu:30trades
```

مقادیر secret در repository ذخیره نمی‌شوند.

## نتیجهٔ نهایی

- Candidate Set مشترک: **موفق**
- حذف Selection Effect در ورودی: **موفق**
- Gate حداقل ۳۰ معامله: **ناموفق برای همهٔ modeها**
- WebLLM واقعی: **اجرا نشده؛ نیازمند GPU واقعی**
- cTrader Demo: **متوقف‌شده به‌دلیل نبود credential**
- Broker writes: **صفر؛ ایمن**

بنابراین در این مرحله نباید Hybrid یا هیچ mode دیگری را به‌عنوان استراتژی تأییدشده معرفی کرد.
