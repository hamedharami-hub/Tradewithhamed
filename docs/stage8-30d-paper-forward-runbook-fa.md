# Runbook اجرای Paper-Forward سی‌روزه با فید واقعی و بدون Broker Write

## هدف و محدوده

این runbook برای اجرای **Paper-Forward read-only** روی cTrader Demo و ارزیابی یکپارچهٔ `S0_SWEEP_FVG`، فیلتر مکانیکی و Advisory Provider نوشته شده است. هیچ سفارش واقعی، تغییر موجودی، تغییر تنظیمات حساب یا broker write مجاز نیست. خروجی مورد انتظار یک فایل رویداد JSONL، خلاصهٔ معاملات فرضی و گزارش تفکیکی نماد/سشن/روز هفته است.

## پیش‌نیاز سخت‌افزاری

برای حالت `DETERMINISTIC` یا `ONLINE`، یک Linux/macOS/Windows با Node.js 20+ کافی است. برای حالت `WEBLLM` باید Chromium/Chrome روی سخت‌افزار دارای GPU واقعی و WebGPU فعال اجرا شود؛ محیط CPU-only نتیجهٔ معتبر WebLLM تولید نمی‌کند. اجرای ۳۰روزه بهتر است روی ماشین همیشه‌روشن انجام شود، نه لپ‌تاپی که sleep می‌شود.

## نصب و آماده‌سازی

```bash
git clone https://github.com/hamedharami-hub/Tradewithhamed.git
cd Tradewithhamed
npm ci
npm run typecheck
npm run test:domain
```

هر دو دستور validation باید بدون خطا تمام شوند. دادهٔ تاریخی حجیم در Git نگهداری نمی‌شود؛ برای Backtest باید datasetها طبق مستندات Stage 1 جداگانه دانلود و در `data/datasets/` قرار گیرند.

## Credential و مرز ایمنی

مقادیر زیر فقط در shell یا secret manager سیستم تنظیم شوند و هرگز در Git commit نشوند:

```bash
export CTRADER_CLIENT_ID='...'
export CTRADER_ACCESS_TOKEN='...'
export CTRADER_ACCOUNT_ID='...'
export CTRADER_ENVIRONMENT='demo'
export RUN_CTRADER=1
export REQUIRE_CTRADER=1
```

قبل از monitor، صحت read-only بودن اتصال را بررسی کنید:

```bash
npm run research:ctrader:readonly-check
```

اجرای امن باید `readOnlySafe true` و `forbiddenWriteSignals 0` نشان دهد. اگر credential وجود ندارد یا environment برابر `demo` نیست، اجرا باید متوقف شود.

## اجرای Paper-Forward سی‌روزه

حالت پیشنهادی مرحلهٔ اول برای baseline:

```bash
export MONITOR_SYMBOLS='GBPUSD,EURUSD,USDJPY,XAUUSD'
export MONITOR_TIMEFRAME='5M'
export MONITOR_DURATION_MS=$((30*24*60*60*1000))
export MONITOR_ANALYST_PROVIDER='DETERMINISTIC'
export MONITOR_REPORT='data/runs/stage8-paper-forward/deterministic-events.jsonl'

npm run research:monitor:hybrid
```

پس از یک اجرای کامل baseline، می‌توان همان بازه را با `ONLINE` اجرا کرد:

```bash
export MONITOR_ANALYST_PROVIDER='ONLINE'
export MONITOR_REPORT='data/runs/stage8-paper-forward/online-events.jsonl'
npm run research:monitor:hybrid
```

برای `WEBLLM` از Node monitor استفاده نشود؛ این مسیر عمداً با وضعیت `BLOCKED` پایان می‌یابد، چون WebLLM باید در مرورگر GPUدار اجرا شود. برای آن، روی میزبان GPU ابتدا این کنترل را اجرا کنید:

```bash
export RUN_CTRADER=0
bash scripts/deploy-stage6-webgpu-ctrader.sh
```

بعد از PASS شدن WebGPU benchmark، اتصال cTrader Demo را با `RUN_CTRADER=1` فعال کنید. در هر دو حالت، `brokerWrites` باید `false` باقی بماند.

## نگهداری، توقف و بازیابی

فرآیند را با `systemd`, `tmux` یا یک supervisor اجرا کنید تا قطع SSH باعث توقف آن نشود. هنگام restart، همان `MONITOR_REPORT` جدید یا یک فایل timestampدار استفاده شود تا رویدادها overwrite نشوند. در صورت قطع gateway، monitor باید با وضعیت `BLOCKED` یا خطای اتصال متوقف شود؛ اتصال ناقص نباید به‌عنوان دادهٔ معتبر forward ثبت شود.

برای توقف دستی:

```bash
Ctrl-C
```

یا PID همان process را با `SIGINT` متوقف کنید. این مسیر gateway را می‌بندد و سفارش ارسال نمی‌کند.

## معیارهای پذیرش ۳۰روزه

گزارش نهایی باید برای هر mode و نماد شامل این موارد باشد:

| معیار | الزام |
|---|---|
| Broker writes | دقیقاً صفر |
| روزهای دارای feed معتبر | ثبت شود؛ gapها گزارش شوند |
| تعداد candidate review | ثبت شود |
| تعداد approval و paper trade | جداگانه ثبت شود |
| Win rate | همراه با تعداد نمونه، نه به‌تنهایی |
| Net PnL و Max Drawdown | با cost model ثابت |
| تفکیک session | London، New York، Asia و overlap |
| تفکیک روز هفته | Monday تا Friday |
| خطا و reconnect | timestamp و علت ثبت شود |
| WebLLM | فقط پس از GPU/WebGPU PASS قابل گزارش است |

هیچ modeی فقط به‌دلیل Win Rate بالا promote نمی‌شود. حداقل ۳۰ معامله شرط لازم است، نه شرط کافی؛ پس از آن باید OOS، bootstrap confidence interval، drawdown، هزینه و پایداری زمانی هم بررسی شود.

## خروجی و آرشیو

فایل‌های `data/runs/` محلی و خارج از Git هستند. در پایان هر اجرا این موارد را آرشیو کنید:

```bash
find data/runs/stage8-paper-forward -type f -maxdepth 1 -print
sha256sum data/runs/stage8-paper-forward/* > data/runs/stage8-paper-forward/SHA256SUMS
```

دادهٔ خام و credential به GitHub ارسال نشود. فقط گزارش خلاصهٔ بدون secret و بدون دادهٔ licensed در repository commit شود.

## تصمیم‌گیری پس از پایان

- اگر feed ناقص، credential ناپایدار یا `brokerWrites` غیرصفر بود: نتیجه مردود و promotion ممنوع است.
- اگر نمونه کمتر از ۳۰ معامله بود: نتیجه برای promotion ناکافی است و فقط exploratory محسوب می‌شود.
- اگر ۳۰ معامله یا بیشتر بود ولی CI و PnL ضعیف بود: mode در Paper-Forward باقی می‌ماند.
- تنها در صورت عبور هم‌زمان از کنترل ایمنی، کف نمونه، OOS مستقل و بررسی drawdown می‌توان دربارهٔ مرحلهٔ بعد تصمیم گرفت؛ این runbook به‌هیچ‌وجه مجوز Live Trading صادر نمی‌کند.

## دستور سریع بررسی وضعیت

```bash
git status --short --branch
npm run research:ctrader:readonly-check
wc -l data/runs/stage8-paper-forward/*.jsonl
```

این پروژه در محدودهٔ فعلی فقط برای تحقیق، backtest و paper trading read-only است.
