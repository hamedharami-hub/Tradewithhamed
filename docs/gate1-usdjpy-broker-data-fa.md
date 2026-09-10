# Gate 1: دادهٔ واقعی USDJPY از cTrader Demo

**تاریخ:** ۱۰ سپتامبر ۲۰۲۶
**وضعیت فعلی:** آمادهٔ اجرا، اما **پاس نشده**؛ credential و دسترسی read-only cTrader Demo در این نشست موجود نیست.
**مرز ثابت:** این مسیر فقط trendbar تاریخی و quote مشاهده‌ای را می‌خواند. هیچ سفارش، تغییر سفارش، broker write یا Live Trading انجام نمی‌دهد.

## تصمیم فعلی

Gate 1 را نمی‌توان با یک نمونهٔ ساختگی، Yahoo Finance یا HistData پاس کرد. شرط Gate 1 تطابق داده با محیط اجرایی آینده است. در وضعیت کنونی هیچ `CTRADER_*` credential در محیط وجود ندارد و connector cTrader نیز پیکربندی نشده است. به همین دلیل صادرکنندهٔ جدید عمداً با `BLOCKED` و exit code `2` پایان یافت و حتی directory خروجی هم نساخت. این **fail-closed** بودن، رفتار درست و امن است.

در مقابل، برای اجرای Gate 1 اکنون مسیر کاملاً آماده شده است: یک صادرکنندهٔ read-only مستقیماً trendbarهای تاریخی USDJPY را از `demo.ctraderapi.com:5036` می‌خواند، داده را به CSV استاندارد تبدیل می‌کند، checksum محتوایی می‌سازد، کیفیت را بررسی می‌کند، spread واقعی مشاهده‌شده را ثبت می‌کند و یک گزارش صریح `PASS` یا `HOLD` تولید می‌کند.

> **فایل نمونه فقط قالب است:** [`usdjpy-broker-csv-template.csv`](examples/usdjpy-broker-csv-template.csv) شامل ده کندل ساختگی آموزشی است. این فایل دادهٔ broker نیست، حداقل 1,000 bar لازم Gate 1 را ندارد و هرگز نباید به‌عنوان نتیجه یا دادهٔ پژوهشی استفاده شود.

## قالب دقیق CSV

صادرکننده فایل را با ستون‌های زیر ایجاد می‌کند. زمان باید ISO-8601 با `Z` باشد؛ یعنی UTC. USDJPY معمولاً با سه رقم اعشار در قیمت ارائه می‌شود. `volume` برای cTrader trendbar حجم tick است، نه حجم واقعی بازار بین‌بانکی.

| ستون | نوع | نمونه | الزام |
|---|---|---|---|
| `time` | ISO-8601 UTC | `2026-08-03T00:00:00.000Z` | الزامی؛ هر ردیف آغاز یک کندل بسته‌شده است |
| `open` | عدد | `146.800` | الزامی |
| `high` | عدد | `146.804` | الزامی؛ باید بزرگ‌تر یا مساوی open و close باشد |
| `low` | عدد | `146.797` | الزامی؛ باید کوچک‌تر یا مساوی open و close باشد |
| `close` | عدد | `146.802` | الزامی |
| `volume` | عدد صحیح یا صفر | `0` یا `42` | اختیاری در parser؛ خروجی API مقدار trendbar را نگه می‌دارد |

نمونهٔ CSV با parser برنامه سازگار است، اما برای Gate 1 عمداً ناکافی است. برنامه همچنین CSVهایی با separator کاما، semicolon یا tab و headerهای دارای `time/date`, `open`, `high`, `low`, `close`, `volume` را می‌خواند. برای دادهٔ broker، export مستقیم این ابزار ترجیح دارد؛ زیرا source، provider symbol، بازه، checksum، کیفیت و spread observation را هم ثبت می‌کند.

## مسیر توصیه‌شده: دریافت مستقیم از cTrader Demo

Open API cTrader برای trendbar تاریخی پیام `ProtoOAGetTrendbarsReq` و پاسخ `ProtoOAGetTrendbarsRes` دارد. request به `ctidTraderAccountId`، `symbolId`، period، `fromTimestamp` و `toTimestamp` نیاز دارد. پاسخ، OHLC را به‌شکل relative نگه می‌دارد: low بر `100000` تقسیم می‌شود و deltaهای open/high/close به low اضافه می‌شوند. این تبدیل در exporter انجام می‌شود. JSON فقط روی پورت `5036` مجاز است. [1] [2]

### 1. credential را فقط روی رایانهٔ میزبان قرار دهید

در محیط shell محلی یا secret manager خود، مقادیر زیر را قرار دهید. مقدار واقعی را در Git، issue، PR، چت یا CSV ثبت نکنید.

```bash
export CTRADER_CLIENT_ID='...'
export CTRADER_CLIENT_SECRET='...'
export CTRADER_ACCESS_TOKEN='...'
export CTRADER_ACCOUNT_ID='...'
export CTRADER_ENVIRONMENT='demo'
export CTRADER_GATEWAY_HOST='demo.ctraderapi.com'
export CTRADER_GATEWAY_PORT='5036'
export CTRADER_LIVE_ENABLE='false'
export RUN_CTRADER='1'
export REQUIRE_CTRADER='1'
export MONITOR_SYMBOLS='USDJPY'
```

توکن باید OAuth scope مشاهده‌ای `SCOPE_VIEW` داشته باشد. حساب باید Demo باشد. Live environment، scope نامعتبر، host یا port متفاوت، نبود credential و `CTRADER_LIVE_ENABLE=true` پیش از بازشدن network connection رد می‌شوند.

### 2. اجرای preflight

```bash
npm run research:ctrader:readonly-check
```

ادامه فقط در صورت `readOnlySafe=true`، `forbiddenWriteSignals=0` و `connectionReady=true` مجاز است.

### 3. دریافت یک نمونهٔ M1 واقعی و timestampدار

برای آغاز، سه روز کاری اخیر را با chunkهای 72ساعته دریافت کنید. بازه را با زمان UTC واقعی انتخاب کنید. مثال زیر فقط شکل فرمان را نشان می‌دهد؛ تاریخ‌ها را با بازهٔ قابل‌دریافت خود جایگزین کنید.

```bash
npm run data:export:ctrader-usdjpy:gate1 -- \
  --timeframe M1 \
  --from 2026-08-03T00:00:00Z \
  --to 2026-08-06T00:00:00Z \
  --chunk-hours 72 \
  --output-dir data/gate1/ctrader-demo-usdjpy
```

هر request حداکثر سه روز است تا احتمال truncation کاهش یابد. اگر پاسخ `hasMore=true` باشد، exporter بدون تولید گزارش موفق متوقف می‌شود و باید `--chunk-hours` کاهش یابد. هر اجرای exporter حداکثر 45 روز را می‌پذیرد. برای پوشش طولانی‌تر باید فایل‌های timestampدار و بدون هم‌پوشانی بسازید؛ پارامتر استراتژی نباید بین فایل‌ها بهینه شود.

### 4. artifactهای لازم

| artifact | محتوای آن | نقش در Gate 1 |
|---|---|---|
| `*.csv` | کندل‌های OHLCV با زمان UTC | ورودی رابط، replay و backtest |
| `*.dataset.json` | manifest، hash، source، symbol، timeframe، گپ و تکرار | قابلیت بازتولید و کنترل کیفیت |
| `*.gate1-report.json` | نتیجه PASS/HOLD، معیارها، provider symbol و summary spread | مدرک تصمیم Gate 1 |

نام account و credentialها در هیچ artifactی ذخیره نمی‌شوند. تنها provider symbol کشف‌شده و endpoint ثابت Demo در گزارش نوشته می‌شود.

## معیار قبولی Gate 1

| معیار | مقدار لازم | علت |
|---|---:|---|
| محیط | `demo` و `SCOPE_VIEW` | جلوگیری از هر مسیر Live یا trading scope |
| endpoint | `demo.ctraderapi.com:5036` | JSON رسمی و endpoint ثابت |
| نماد | `USDJPY` در symbol discovery | جلوگیری از جایگزینی نماد مشابه یا synthetic |
| timeframe | M1 یا M5 | مناسب مرحلهٔ بعد و Stage 8؛ M1 ترجیح دارد |
| تعداد bar پذیرفته‌شده | حداقل 1,000 M1 یا 200 M5 | warmup، کنترل کیفیت و نمونهٔ حداقلی |
| گپ غیرآخرهفته | صفر | جلوگیری از نتیجهٔ آلوده |
| timestamp تکراری | صفر | جلوگیری از دوباره‌شماری یا candle conflict |
| quote bid/ask | حداقل یک مشاهده | ثبت spread واقعی برای سناریوهای هزینهٔ Gate 2 |
| `brokerWrites` | همیشه `false` | مرز غیرقابل‌مذاکرهٔ پروژه |

فقط گزارش با `status: "PASS"` این Gate را می‌بندد. `HOLD` به معنی آن است که داده یا observation ناکافی است و مرحلهٔ بعد آغاز نمی‌شود. یک فایل CSV که دستی export شده است در رابط قابل‌ورود است، اما بدون این manifest و گزارش مستقیم API، فقط دادهٔ **user-imported / provenance-not-verified** است و Gate 1 را نمی‌بندد.

## آزمون ایمنی انجام‌شده در این نشست

صادرکننده در نبود credential اجرا شد. خروجی `BLOCKED` بود و چهار شرط `demoEnvironment`، `readOnlyRunFlag`، `readOnlyRequireFlag` و `credentialsPresent` را false گزارش داد. process با exit code `2` پایان یافت و output directory ایجاد نشد. هیچ اتصال، درخواست تاریخچه، سفارش یا broker write رخ نداد.

تست‌های domain نیز بعد از افزودن historical-read allowlist اجرا شدند: 23 suite، 130 check و صفر failure. دو کنترل جدید ثابت می‌کنند که payload تاریخی `2137` مجاز است و تبدیل relative trendbar به OHLC صحیح انجام می‌شود؛ payload سفارش `2106` همچنان پیش از I/O شبکه رد می‌شود.

## وضعیت و مرحلهٔ بعد

**Gate 1 هنوز باز است.** تنها وابستگی آن credential Demo read-only است. پس از اجرای موفق exporter و مشاهدهٔ `PASS`، مرحلهٔ بعد بدون تغییر قواعد یا پارامترها آغاز می‌شود: Walk-Forward و stress هزینه بر همان dataset cTrader. تا پیش از PASS، Paper-Forward سی‌روزه، Live Trading و هر broker write ممنوع می‌مانند.

## References

[1]: https://help.ctrader.com/open-api/symbol-data/ "cTrader Open API: Attain symbol data"
[2]: https://help.ctrader.com/open-api/protocol-buffers-json/ "cTrader Open API: Protobuf and JSON"
[3]: https://help.ctrader.com/open-api/account-authentication/ "cTrader Open API: App and account authentication"

> **افشای پژوهشی:** مبنای Gate 1 هم‌خوانی source، نماد، timestamp UTC، کیفیت کندل و observation spread است. زمان ارزیابی این سند ۱۰ سپتامبر ۲۰۲۶ است. API cTrader منبع رسمی موردنظر است، اما در این نشست credential آن موجود نبود؛ بنابراین اطمینان نسبت به pipeline فنی بالا و نسبت به انطباق دادهٔ یک broker مشخص تا اجرای واقعی صفر است. این گزارش صرفاً تحلیل پژوهشی است و توصیهٔ شخصی سرمایه‌گذاری نیست.
