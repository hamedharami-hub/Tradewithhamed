# مرحلهٔ هفتم: cTrader Demo و بهینه‌سازی S0_SWEEP_FVG

## وضعیت اتصال cTrader Demo

Worker واقعی cTrader به‌صورت fail-closed اجرا و بررسی شد:

```bash
PAPER_DURATION_MS=5000 npm run research:live-paper
```

اتصال برقرار نشد، چون این محیط فاقد سه مقدار ضروری است:

- `CTRADER_CLIENT_ID`
- `CTRADER_ACCESS_TOKEN`
- `CTRADER_ACCOUNT_ID`

خطای ثبت‌شده:

```text
LIVE_PAPER_NOT_STARTED: CTRADER_ACCESS_TOKEN، CTRADER_ACCOUNT_ID و CTRADER_CLIENT_ID تنظیم نشده‌اند.
```

این رفتار صحیح و ایمن است. سیستم به‌جای ساختن quote یا وانمودکردن به اتصال Demo، متوقف شد. برای اتصال واقعی باید OAuth cTrader و account Demo تکمیل شود. پس از مقداردهی secretها، همین worker فقط quote می‌خواند و `brokerWrites=false` باقی می‌ماند.

## بهینه‌سازی پارامترهای S0

روی dataset واقعی GBPUSD یک‌سالهٔ HistData در تایم‌فریم 1H، تعداد **۱۶۲ ترکیب** پارامتر بررسی شد. داده به‌صورت chronological به ۷۰٪ Train و ۳۰٪ OOS تقسیم شد؛ OOS در انتخاب پارامتر دخالت نداشت.

پارامترهای بررسی‌شده:

| پارامتر | مقادیر |
|---|---|
| stopLossAtrBuffer | 0.15، 0.20، 0.30 |
| targetRiskReward | 1.5، 2.0، 2.5 |
| entryExpiryBars | 6، 12، 18 |
| minSweepPenetrationAtr | 0.10، 0.20، 0.35 |
| minFvgSizeAtr | 0.20، 0.30 |

معیار انتخاب صرفاً Win Rate نبود؛ ترکیب زیر استفاده شد:

```text
Train netProfit + 100 × profitFactor
```

و حداقل ۸ معامله برای جلوگیری از انتخاب ترکیب کم‌نمونه اعمال شد.

### بهترین ترکیب Train

```json
{
  "stopLossAtrBuffer": 0.3,
  "targetRiskReward": 2.5,
  "entryExpiryBars": 6,
  "minSweepPenetrationAtr": 0.1,
  "minFvgSizeAtr": 0.2
}
```

نتایج Train:

| معیار | نتیجه |
|---|---:|
| معاملات | 46 |
| Win Rate | 43.5% |
| Net Profit | 313.89 |
| Profit Factor | 1.40 |
| Max Drawdown | 1.80% |

### نتیجهٔ مستقل OOS

| معیار | نتیجه |
|---|---:|
| معاملات | 34 |
| Win Rate | 32.4% |
| Net Profit | -19.78 |
| Profit Factor | 0.97 |
| Max Drawdown | 1.58% |
| Commission | 28.92 |

## تصمیم فنی

پارامتر منتخب Train در OOS سوددهی خود را حفظ نکرده است. بنابراین **به‌صورت خودکار وارد Paper-Forward نشده** و به‌عنوان نسخهٔ production یا live توصیه نمی‌شود.

این نتیجه نشانهٔ احتمال overfitting یا ناپایداری edge است. افزایش Win Rate در Train به‌تنهایی کافی نیست؛ باید هم‌زمان PF، expectancy، هزینه، drawdown و ثبات در OOS بررسی شود.

## کنترل Paper-Forward

پارامترها اکنون قابل‌تنظیم و audit هستند، اما promotion دستی است:

```bash
PAPER_STOP_LOSS_ATR_BUFFER=0.3 \
PAPER_TARGET_RR=2.5 \
PAPER_EXPIRY_BARS=6 \
PAPER_MIN_SWEEP_ATR=0.1 \
PAPER_MIN_FVG_ATR=0.2 \
PAPER_DURATION_MS=3600000 \
npm run research:live-paper
```

تا وقتی OOS مستقل مثبت و پایدار نشده، مقدارهای baseline زیر باید حفظ شوند:

```text
stopLossAtrBuffer=0.2
 targetRiskReward=2
 entryExpiryBars=12
 minSweepPenetrationAtr=0.1
 minFvgSizeAtr=0.3
```

## گام بعدی لازم

۱. دریافت و ثبت credentials معتبر cTrader Demo؛ ۲. اجرای read-only Paper-Forward حداقل ۳۰ روز؛ ۳. ثبت نتایج به تفکیک session، روز هفته و regime؛ ۴. اجرای دوبارهٔ optimizer روی rolling windows؛ ۵. فقط در صورت مثبت‌بودن OOS و Paper-Forward، بررسی promotion به نسخهٔ بعدی Strategy.
