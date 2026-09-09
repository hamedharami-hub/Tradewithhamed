# مرحلهٔ هفتم: WebLLM واقعی، حداقل ۳۰ معامله و تحلیل عمیق Hybrid

## وضعیت اجرا

اسکریپت‌های Stage 7 آماده و از نظر typecheck، lint، syntax و diff validation موفق شدند. اجرای واقعی در این sandbox انجام نشد، چون GPU واقعی و credential حساب cTrader Demo وجود ندارد. این محدودیت عمداً fail-closed است.

## اجرای واقعی Stage 7

اسکریپت اصلی:

```bash
npm run stage7:gpu:30trades
```

این اسکریپت قبل از هر اجرا موارد زیر را الزام می‌کند:

- `CTRADER_ENVIRONMENT=demo`
- `CTRADER_CLIENT_ID`
- `CTRADER_ACCESS_TOKEN`
- `CTRADER_ACCOUNT_ID`
- نصب Chromium
- عبور واقعی `navigator.gpu`
- PASS شدن benchmark واقعی WebLLM
- وجود artifact benchmark نهایی
- حداقل ۳۰ معاملهٔ بسته‌شده برای هر mode

اگر هر حالت کمتر از ۳۰ معامله داشته باشد، اجرای نهایی با `TRADE_GATE_FAILED` متوقف می‌شود. بنابراین نتیجهٔ مثبت با ۴، ۵ یا ۶ معامله دیگر اجازهٔ promotion ندارد.

تنظیمات از `.env.example` قابل کپی است، اما secretها عمداً در repository قرار نمی‌گیرند.

## حالت‌های مورد انتظار

```bash
STAGE7_MODES=DETERMINISTIC,ONLINE,HYBRID,WEBLLM
STAGE7_MIN_TRADES=30
MONITOR_SYMBOLS=GBPUSD
MONITOR_TIMEFRAME=5M
RUN_CTRADER=1
REQUIRE_CTRADER=1
```

Paper-Forward همچنان `brokerWrites=false` دارد و هیچ مسیر ارسال سفارش واقعی در Stage 7 فعال نیست.

## تحلیل عمیق Hybrid

تحلیل با bootstrap trade-level و posterior بیزی Beta(1,1) انجام شد. علاوه بر Win Rate، تفاوت میانگین PnL Hybrid با OFF و Deterministic نیز bootstrap شد.

### GBPUSD

| معیار | نتیجه |
|---|---:|
| معاملات Hybrid | 5 |
| برد/باخت | 3 / 2 |
| Win Rate مشاهده‌شده | 60٪ |
| میانگین posterior Win Rate | 57.1٪ |
| CI 95٪ posterior | 22.5٪ تا 88.5٪ |
| احتمال posterior بالاتر از ۵۰٪ | 65.9٪ |
| اختلاف PnL Hybrid - OFF | +20.20 به‌ازای معامله |
| CI اختلاف با OFF | -16.34 تا +54.44 |
| احتمال بهتر بودن از OFF | 85.8٪ |
| اختلاف PnL Hybrid - Deterministic | +16.12 |
| CI اختلاف با Deterministic | -21.01 تا +50.54 |
| احتمال بهتر بودن | 81.0٪ |

نتیجهٔ GBPUSD امیدوارکننده است، اما interval اختلاف هر دو مقایسه صفر را قطع می‌کند. بنابراین برتری Hybrid هنوز قطعی نیست.

### EURUSD

| معیار | نتیجه |
|---|---:|
| معاملات Hybrid | 4 |
| برد/باخت | 0 / 4 |
| Win Rate مشاهده‌شده | 0٪ |
| میانگین posterior Win Rate | 16.7٪ |
| CI 95٪ posterior | 0.5٪ تا 52.4٪ |
| احتمال posterior بالاتر از ۵۰٪ | 3.2٪ |
| اختلاف PnL Hybrid - OFF | -29.78 |
| CI اختلاف با OFF | -47.52 تا -12.85 |
| احتمال بهتر بودن از OFF | 0٪ |
| اختلاف PnL Hybrid - Deterministic | -35.40 |
| CI اختلاف با Deterministic | -56.13 تا -14.30 |
| احتمال بهتر بودن | 0.02٪ |

EURUSD نشان می‌دهد Hybrid احتمالاً در این نمونه candidateهای نامناسبی را عبور داده یا با regime این نماد سازگار نبوده است. اما چون فقط ۴ معامله وجود دارد، این نتیجه هنوز برای تغییر دائمی policy کافی نیست.

### XAUUSD

| معیار | نتیجه |
|---|---:|
| معاملات Hybrid | 6 |
| برد/باخت | 2 / 4 |
| Win Rate مشاهده‌شده | 33.3٪ |
| میانگین posterior Win Rate | 37.5٪ |
| CI 95٪ posterior | 9.6٪ تا 70.8٪ |
| احتمال posterior بالاتر از ۵۰٪ | 22.7٪ |
| اختلاف PnL Hybrid - OFF | -0.77 |
| CI اختلاف با OFF | -27.50 تا +28.34 |
| احتمال بهتر بودن از OFF | 46.9٪ |
| اختلاف PnL Hybrid - Deterministic | -0.15 |
| CI اختلاف با Deterministic | -28.26 تا +29.63 |
| احتمال بهتر بودن | 48.4٪ |

## علت تفاوت Hybrid در نمونه‌های کم

Hybrid فقط یک فیلتر AI روی همان معاملات نیست؛ candidate set را تغییر می‌دهد. در artifact GBPUSD:

- candidateهای بررسی‌شده: ۱۲
- candidateهای تأییدشده: ۵
- candidateهای ردشده: ۷
- علت غالب: `ANALYST_NOT_APPROVED`
- نرخ تبدیل candidate به معامله: حدود ۴۱.۷٪

بنابراین تفاوت عملکرد از چند منبع می‌آید:

1. **Selection effect:** Hybrid فقط subset کوچکی از candidateها را وارد شبیه‌ساز می‌کند.
2. **Sample-size effect:** با ۴ تا ۶ معامله، یک برد یا باخت چندین واحد درصد Win Rate را جابه‌جا می‌کند.
3. **Regime sensitivity:** فیلتر Hybrid ممکن است در GBPUSD مناسب باشد ولی در EURUSD candidateهای سودده را حذف یا candidateهای ضعیف را عبور دهد.
4. **Evidence mismatch:** بسیاری از candidateها ATR یا evidence کافی برای threshold validation ندارند.
5. **Unequal comparison:** OFF روی تعداد بیشتری candidate اجرا شده است؛ پس مقایسهٔ خام Win Rate، مقایسهٔ منصفانهٔ یک candidate set مشترک نیست.
6. **Provider latency and timeout:** Online/Hybrid ممکن است با timeout، پاسخ ناقص یا REVIEW_REQUIRED متفاوت عمل کند.

## مقایسهٔ صحیح موردنیاز

برای نتیجهٔ معتبر باید همهٔ modeها روی دقیقاً همان candidate IDs اجرا شوند و فقط تصمیم advisory تغییر کند. سپس باید برای هر mode حداقل ۳۰ معامله بسته‌شده ثبت شود و موارد زیر گزارش شود:

- Win Rate
- expectancy
- profit factor
- net PnL
- max drawdown
- bootstrap CI
- paired PnL difference
- تعداد candidateهای بررسی‌شده
- approval/rejection rate
- latency
- سهم `REVIEW_REQUIRED`
- performance به تفکیک session و regime

## artifact تحلیل

[تحلیل عمیق Hybrid](../data/runs/stage7-hybrid-depth-analysis.json)

[اسکریپت تحلیل Hybrid](../scripts/analyze-hybrid-depth.py)

[اسکریپت اجرای Stage 7 روی GPU](../scripts/run-stage7-gpu-30trades.sh)

[تنظیمات محیطی Stage 7](../.env.example)

## نتیجهٔ نهایی

Hybrid در GBPUSD نشانهٔ مثبت اولیه دارد، در EURUSD نشانهٔ منفی جدی دارد و در XAUUSD خنثی/نامطمئن است. این الگو بیشتر با **selection و regime dependency** سازگار است تا برتری عمومی AI.

تا زمانی که هر حالت حداقل ۳۰ معاملهٔ واقعی Paper-Forward نداشته باشد، هیچ mode نباید به‌صورت دائمی promotion شود. WebLLM نیز فقط پس از PASS واقعی روی GPU و ثبت حداقل ۳۰ معامله وارد مقایسهٔ نهایی می‌شود.
