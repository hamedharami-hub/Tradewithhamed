# مرحلهٔ هشتم: مانیتورینگ ۳۰روزه و اعتبارسنجی قوی‌تر OOS

## وضعیت شروع مانیتور

مانیتور ۳۰روزهٔ read-only ساخته و اجرا شد:

```bash
npm run research:monitor:30d
```

مانیتور برای هر روز گزارش JSONL تولید می‌کند و این موارد را ثبت خواهد کرد:

- وضعیت Gateway و freshness quote؛
- تعداد کندل‌های دریافت‌شده و پذیرفته‌شده؛
- عملکرد Paper-Forward؛
- تفکیک Sessionهای Asia، London، New York و Off-hours؛
- تفکیک روزهای هفته؛
- تفکیک Regime؛
- تعداد سیگنال و معامله؛
- Win Rate، PF، expectancy، drawdown و PnL؛
- تأیید `brokerWrites=false`.

## نتیجهٔ فعلی

مانیتور به‌درستی fail-closed شد، زیرا credentials cTrader در محیط موجود نیست:

```json
{
  "status": "BLOCKED",
  "brokerWrites": false,
  "source": "CTRADER_READ_ONLY",
  "gateway": {
    "state": "DISABLED",
    "configured": false,
    "connected": false
  }
}
```

Artifact readiness در این مسیر ذخیره شده است:

```text
data/runs/stage8-30d/gbpusd-monitor-report.jsonl
```

پس از قراردادن سه مقدار زیر، اجرای ۳۰روزه واقعاً شروع می‌شود:

```text
CTRADER_CLIENT_ID
CTRADER_ACCESS_TOKEN
CTRADER_ACCOUNT_ID
```

دستور اجرا:

```bash
MONITOR_SYMBOL=GBPUSD \
MONITOR_TIMEFRAME=5M \
MONITOR_DURATION_MS=2592000000 \
npm run research:monitor:30d
```

در این مسیر هیچ order endpoint فراخوانی نمی‌شود و worker فقط quote می‌خواند.

## پروتکل قوی‌تر برای OOS و جلوگیری از Overfitting

Split سادهٔ ۷۰/۳۰ کافی نیست. پروتکل پیشنهادی مرحلهٔ بعد چنین است:

### ۱. Nested Walk-Forward

برای هر fold، پارامترها فقط روی Train داخلی انتخاب شوند. سپس روی Validation داخلی رتبه‌بندی و در نهایت فقط روی OOS بیرونی امتیازدهی شوند. OOS نباید برای انتخاب، tie-break یا تغییر پارامتر استفاده شود.

### ۲. Purge و Embargo

بین انتهای Train و شروع OOS حداقل به اندازهٔ `entryExpiryBars` کندل حذف شود. اگر position ممکن است بیشتر باز بماند، purge باید برابر بیشینهٔ holding period واقعی باشد. پس از OOS نیز embargo کوتاه برای جلوگیری از contamination در fold بعدی اعمال شود.

### ۳. چند پنجره و چند رژیم

پارامتر فقط زمانی قابل قبول باشد که در چند fold زمانی، چند session و چند regime عملکرد قابل‌قبول داشته باشد. یک fold بسیار خوب نباید چند fold ضعیف را پنهان کند.

### ۴. Parameter Stability و Plateau Test

به‌جای انتخاب یک نقطهٔ قله، اطراف پارامتر منتخب نیز آزمایش شود. اگر فقط یک ترکیب دقیق سودده و همسایه‌های آن ضعیف باشند، احتمال overfit زیاد است. باید یک plateau پایدار وجود داشته باشد.

### ۵. هزینه و حساسیت

هر نتیجه با spread، slippage و commission پایه، ۱٫۵ برابر و ۲ برابر اجرا شود. Strategy تنها وقتی robust است که با افزایش واقع‌بینانهٔ هزینه کاملاً فرو نریزد.

### ۶. Deflated و Probability-of-Backtest-Overfitting

تعداد کل ترکیب‌های امتحان‌شده، بهترین Train score و تعداد foldها ثبت شود. هرچه تعداد آزمون‌ها بیشتر باشد، آستانهٔ پذیرش باید سخت‌تر شود. گزارش نهایی باید تعداد جست‌وجوها را نمایش دهد، نه فقط بهترین نتیجه را.

### ۷. معیار Go/No-Go

برای Paper-Forward حداقل این شروط پیشنهاد می‌شود:

- حداقل ۳ fold OOS؛
- حداقل ۳۰ معاملهٔ OOS تجمیعی؛
- Profit Factor تجمیعی بزرگ‌تر از ۱٫۱۰؛
- expectancy مثبت بعد از هزینه؛
- نبودن وابستگی شدید به یک session یا یک روز؛
- افت عملکرد کمتر از ۳۰٪ بین Train و OOS؛
- عبور از تست هزینهٔ ۱٫۵ برابر؛
- نبودن یک پارامتر منفرد که بیش از ۲۵٪ PnL کل را تولید کند.

تا زمانی که این شروط با دادهٔ مستقل و Paper-Forward واقعی برقرار نشده‌اند، هیچ parameter promotion یا اجرای بروکری نباید انجام شود.
