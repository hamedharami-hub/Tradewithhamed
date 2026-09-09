# Runbook اجرای Paper-Forward سی‌روزه با feed واقعی و **بدون Broker Write**

## هدف و مرز قطعی

این runbook فقط برای **Paper-Forward read-only** روی cTrader **Demo** است. monitor دادهٔ بازار را از endpoint JSON رسمی Demo می‌خواند، candle بسته می‌سازد، candidate مکانیکی را ارزیابی می‌کند و نتایج را فقط در یک دفترکل محلی ثبت می‌کند. این مسیر هیچ سفارش، تغییر سفارش، reconciliation حساب، تغییر موجودی یا broker write انجام نمی‌دهد.

> `brokerWrites` باید در تمام رخدادها `false` باشد. هر رخداد write، payload سفارش یا خطای preflight نتیجه را مردود می‌کند و مجوز ادامه یا promotion نمی‌دهد.

## پیش‌نیازها

رایانهٔ شخصی باید در کل دوره روشن، متصل به اینترنت و بدون sleep باشد. Node.js 20 یا جدیدتر لازم است. برای baseline `DETERMINISTIC` به کلید AI نیاز نیست. `WEBLLM` فقط روی مرورگر دارای GPU واقعی و WebGPU pass شده قابل استفاده است؛ Node monitor آن را عمداً `BLOCKED` می‌کند.

```bash
git clone https://github.com/hamedharami-hub/Tradewithhamed.git
cd Tradewithhamed
npm ci
npm run typecheck
npm run test:domain
```

## Credential و allowlist امنیتی

Credentialها فقط روی رایانهٔ میزبان، در secret manager یا shell environment قرار می‌گیرند. هیچ مقدار secretی را در Git یا گفتگو وارد نکنید. برنامه فقط با OAuth scope `accounts`/`SCOPE_VIEW` ادامه می‌دهد. حساب Live یا scope `trading` در فرایند authorization رد می‌شود.

```bash
export CTRADER_CLIENT_ID='...'
export CTRADER_CLIENT_SECRET='...'
export CTRADER_ACCESS_TOKEN='...'
export CTRADER_ACCOUNT_ID='...'
export CTRADER_ENVIRONMENT='demo'
export CTRADER_GATEWAY_HOST='demo.ctraderapi.com'
export CTRADER_GATEWAY_PORT='5036'
export CTRADER_LIVE_ENABLE='false'
export RUN_CTRADER=1
export REQUIRE_CTRADER=1
```

`5036` برای JSON الزامی است. monitor جدید از transport جداگانهٔ read-only استفاده می‌کند و فقط authentication، account-list، symbol discovery، heartbeat و subscription/unsubscription دادهٔ بازار را اجازه می‌دهد. payload سفارش `2106` قبل از هر I/O شبکه مسدود می‌شود. [1] [2]

پیش از هر اجرای monitor، preflight را اجرا کنید:

```bash
npm run research:ctrader:readonly-check
```

ادامه فقط زمانی مجاز است که `readOnlySafe=true`، `forbiddenWriteSignals=0` و `connectionReady=true` باشند. نبود credential در این مرحله باید با exit code غیرصفر و به‌شکل fail-closed پایان یابد؛ این وضعیت به معنی تلاش برای اتصال یا سفارش نیست.

## نمادها و timeframe

`1M` و `5M` تنها timeframeهای مجاز Stage 8 هستند. چهار نماد `GBPUSD`، `EURUSD`، `USDJPY` و `XAUUSD` مبنای baseline هستند. `BTCUSD` در درخواست پیش‌فرض وجود دارد، اما فقط در صورتی فعال می‌شود که symbol discovery read-only آن را در حساب Demo پیدا کند. نام‌های broker-specific مانند `BTCUSD.pro` یا `BTC/USD` پشتیبانی می‌شوند. اگر BTCUSD در حساب در دسترس نباشد، `SYMBOL_DISCOVERY` آن را در `unavailable` ثبت می‌کند و اجرای سایر نمادهای قابل‌دسترسی ادامه می‌یابد.

## اجرای baseline سی‌روزه

ابتدا فقط یک process `DETERMINISTIC` اجرا کنید. report را برای هر run جدید timestampدار انتخاب کنید تا رخدادهای قبلی overwrite نشوند.

```bash
export MONITOR_SYMBOLS='GBPUSD,EURUSD,USDJPY,XAUUSD,BTCUSD'
export MONITOR_TIMEFRAME='1M'
export MONITOR_ANALYST_PROVIDER='DETERMINISTIC'
export MONITOR_DURATION_MS=$((30*24*60*60*1000))
export MONITOR_REPORT="data/runs/stage8-paper-forward/deterministic-$(date -u +%Y%m%dT%H%M%SZ)-events.jsonl"

npm run research:monitor:stage8:readonly
```

monitor فقط پس از دریافت ۱۴۰ candle بسته برای هر symbol، candidate را ارزیابی می‌کند. trade فرضی در candle بستهٔ بعدی و با قانون intrabar بدبینانه ثبت می‌شود. این قانون از استفاده از range آیندهٔ candle سیگنال جلوگیری می‌کند.

پس از پایان، report را تحلیل کنید:

```bash
npm run research:analyze:stage8 -- \
  --input "$MONITOR_REPORT" \
  --output "${MONITOR_REPORT%.jsonl}-analysis.json"

sha256sum "$MONITOR_REPORT" "${MONITOR_REPORT%.jsonl}-analysis.json" \
  > "${MONITOR_REPORT%.jsonl}-SHA256SUMS"
```

تحلیل نهایی تعداد candidate review، approval، paper trade، feed gap، reconnect، Win Rate، Net PnL، Max Drawdown، sessionهای `ASIA`، `LONDON`، `LONDON_NEW_YORK_OVERLAP` و `NEW_YORK`، weekday UTC و Bootstrap CI با seed ثابت و ۱۰٬۰۰۰ بازنمونه را ثبت می‌کند.

## providerها

| حالت | وضعیت | شرط فعال‌سازی | رفتار در نبود شرط |
|---|---|---|---|
| `DETERMINISTIC` | baseline آفلاین | بدون credential | فعال |
| `WEBLLM` | مرورگر GPU | WebGPU واقعی و browser harness pass | `BLOCKED` در Node/CPU |
| `ONLINE` | OpenAI-compatible | `OPENAI_API_KEY` و `OPENAI_API_BASE` | `BLOCKED` بدون fallback |
| `GEMINI` | Gemini API | `GEMINI_API_KEY` | `BLOCKED` بدون fallback |
| `XAI` | xAI/Grok API | `XAI_API_KEY` | `BLOCKED` بدون fallback |

پس از پایان کامل baseline می‌توان run جداگانه‌ای با `ONLINE`، `GEMINI` یا `XAI` آغاز کرد. این run به‌علت زمان متفاوت، **مقایسهٔ exploratory غیرهم‌زمان** است و paired comparison روی feed یکسان محسوب نمی‌شود. AI فقط reviewer ساختاریافتهٔ candidateهای مکانیکی است و هرگز signal generator یا مجوز broker execution نیست.

## توقف و بازیابی

برای توقف دستی `Ctrl-C` یا `SIGTERM` استفاده کنید. monitor transport read-only را می‌بندد و `STOPPED` ثبت می‌کند. قطع feed، socket error، scope نادرست، نمادهای کاملاً ناموجود یا هر خطای gateway به `BLOCKED` منتهی می‌شود؛ دادهٔ ناقص نباید به‌عنوان forward test معتبر ثبت شود. پس از restart باید گزارش جدیدی انتخاب و preflight مجدداً PASS شود.

## معیار پایان و تصمیم بعدی

هیچ modeی فقط به‌دلیل Win Rate بالا promote نمی‌شود. کمتر از ۳۰ معاملهٔ بسته `INSUFFICIENT_SAMPLE` است. ۳۰ معامله یا بیشتر نیز فقط برای ادامهٔ پژوهش کافی است و همچنان نیازمند OOS مستقل، Bootstrap CI، کنترل drawdown، مدل هزینه و پایداری زمانی است. این runbook هرگز مجوز Live Trading صادر نمی‌کند.

## References

[1]: https://help.ctrader.com/open-api/protocol-buffers-json/ "cTrader Open API: Protobuf and JSON"
[2]: https://help.ctrader.com/open-api/account-authentication/ "cTrader Open API: App and account authentication"
