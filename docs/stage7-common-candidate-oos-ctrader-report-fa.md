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


## نتیجهٔ نهایی benchmark چندسالهٔ ۱۵ دقیقه‌ای

برای کاهش اثر کمبود نمونه، یک آزمایش از پیش‌تعریف‌شده روی dataset چندسالهٔ GBPUSD با تایم‌فریم ۱۵ دقیقه و Candidate Set مشترک ۱۵۰تایی اجرا شد. Candidate Set برای تمام modeها یکسان بود و پس از مشاهدهٔ نتایج تغییر نکرد.

| مورد | مقدار |
|---|---:|
| train bars | 84,893 |
| OOS bars | 36,384 |
| شروع OOS | 2023-07-11 04:45 UTC |
| Candidate Set مشترک | 150 |
| حداقل Gate | 30 معامله |

| حالت | وضعیت | Approved | معاملات | Win Rate | Net Profit | Max Drawdown | Gate |
|---|---|---:|---:|---:|---:|---:|---|
| OFF | MEASURED | 0 | 354 | 33.9٪ | -3,683.50 | 38.04 | عبور |
| DETERMINISTIC | MEASURED | 150 | 343 | 33.8٪ | -3,728.41 | 37.50 | عبور |
| ONLINE | MEASURED | 97 | 89 | 42.7٪ | -158.67 | 4.57 | عبور |
| HYBRID | MEASURED | 103 | 95 | 43.2٪ | -164.64 | 4.73 | عبور |
| WEBLLM | BLOCKED | 0 | 0 | — | — | — | عدم ارزیابی |

### تفسیر نهایی

Gate حداقل ۳۰ معامله برای `ONLINE` و `HYBRID` اکنون با فاصلهٔ مناسب عبور کرده است؛ Hybrid با ۹۵ معامله و Win Rate برابر ۴۳.۲٪، نسبت به اجرای بدون AI و Deterministic از نظر کاهش تعداد معاملات و drawdown بسیار فیلترشده‌تر است. بااین‌حال Net Profit در مدل هزینهٔ فعلی منفی است؛ بنابراین عبور از Gate به‌تنهایی مجوز promotion یا Live Trading نیست و این نتیجه فعلاً برای Paper-Forward و تحلیل بیشتر معتبر است.

`WEBLLM` هنوز Gate را رد نکرده است، نه به‌دلیل عملکرد ضعیف، بلکه به‌دلیل `BLOCKED` بودن اجرای واقعی WebGPU در محیط فعلی. هیچ نتیجهٔ شبیه‌سازی‌شده‌ای به‌عنوان عملکرد WebLLM ثبت نشده است. برای ارزیابی آن باید همین Candidate Set و پروتکل روی Browser مجهز به GPU واقعی اجرا شود.

Artifact کامل benchmark در محیط محلی تولید شده است:

```text
data/runs/stage7-common-gbpusd-15m-2020-2024-all-modes.json
```

این فایل به‌دلیل حجم داده و سیاست repository در Git commit نمی‌شود؛ گزارش عددی و قابل بازتولید در همین سند ثبت شده است.

### تصمیم Stage 7

- `ONLINE`: **Measured / Paper-Forward eligible؛ بدون promotion خودکار**
- `HYBRID`: **Measured / Paper-Forward eligible؛ بدون promotion خودکار**
- `WEBLLM`: **BLOCKED؛ نیازمند GPU/WebGPU واقعی**
- Live trading: **ممنوع و خارج از محدودهٔ این پروژه**
- گام بعدی: اجرای Paper-Forward read-only سی‌روزه با ثبت تفکیکی session، weekday، هزینه، drawdown و gapهای feed طبق runbook Stage 8.
