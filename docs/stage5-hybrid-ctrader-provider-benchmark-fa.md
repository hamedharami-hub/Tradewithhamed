# مرحلهٔ پنجم: مانیتور ترکیبی cTrader و Benchmark Providerها

## وضعیت اجرایی

زیرساخت مرحلهٔ پنجم آماده و typecheck/lint آن موفق شد، اما اجرای live cTrader در این محیط به‌دلیل نبود credentialهای Demo به‌صورت fail-closed متوقف می‌شود. هیچ سفارش بروکری ارسال نمی‌شود.

معماری آماده‌شده:

```text
cTrader Demo read-only quotes
        |
        v
Deterministic S0_SWEEP_FVG scanner
        |
        +--> Deterministic analyst
        +--> Online advisory provider
        +--> WebLLM local analyst (فقط Browser + GPU)
        |
        v
PaperForward ledger — brokerWrites=false
```

## مانیتور cTrader

اسکریپت زیر ساخته شد:

```bash
npm run research:monitor:hybrid
```

تنظیمات مهم:

```bash
MONITOR_SYMBOLS=GBPUSD,EURUSD
MONITOR_TIMEFRAME=5M
MONITOR_ANALYST_PROVIDER=DETERMINISTIC
MONITOR_DURATION_MS=2592000000
MONITOR_REPORT=data/runs/stage5-hybrid-monitor/events.jsonl
```

providerهای قابل انتخاب:

- `DETERMINISTIC`: قابل اجرا در Node و بدون مدل عصبی.
- `ONLINE`: provider سازگار با OpenAI API؛ مدل از `TRADING_ONLINE_MODEL` انتخاب می‌شود.
- `WEBLLM`: در Node عمداً مسدود است و باید از Browser-GPU monitor استفاده شود.
- `HYBRID`: پس از تنظیم provider آنلاین، ترکیب advisory آنلاین و critic قطعی را اجرا می‌کند.

برای cTrader Demo باید این مقادیر تنظیم شوند:

```bash
CTRADER_CLIENT_ID=...
CTRADER_ACCESS_TOKEN=...
CTRADER_ACCOUNT_ID=...
CTRADER_ENVIRONMENT=demo
```

تا زمانی که این مقادیر وجود نداشته باشند، خروجی صحیح `BLOCKED` است.

## Benchmark providerها

اسکریپت قابل انتقال به سرور GPU ساخته شد:

```bash
npm run research:benchmark:stage5 -- \
  public/webgpu-candidates-gbpusd.json \
  data/runs/stage5-provider-benchmark.json
```

حالت‌های benchmark:

| حالت | وضعیت در این sandbox |
|---|---|
| OFF | قابل مقایسه با نتایج قبلی |
| DETERMINISTIC_COUNCIL | measured |
| WEBLLM_LOCAL | `SIMULATED_UNTIL_GPU_RUN`؛ عمداً خروجی جعلی تولید نمی‌کند |
| ONLINE_FAST | اگر provider و key فعال باشد measured |
| HYBRID | نیازمند provider آنلاین و در بخش محلی critic قطعی دارد |

provider آنلاین از API سازگار با OpenAI استفاده می‌کند. برای Gemini Flash باید یک adapter OpenAI-compatible یا endpoint رسمی Gemini تنظیم شود و مقدار زیر به مدل مناسب تغییر کند:

```bash
TRADING_ONLINE_MODEL=gemini-2.5-flash
```

نام دقیق مدل باید مطابق account و endpoint انتخابی باشد؛ این پروژه بدون credential یا endpoint معتبر دربارهٔ Gemini نتیجهٔ ساختگی ثبت نمی‌کند.

## گزارش benchmark فعلی

در اجرای sandbox، provider آنلاین از credential موجود سازگار با OpenAI استفاده کرد و بخشی از candidateها را بررسی کرد. بسیاری از candidateها به‌درستی `REVIEW_REQUIRED` شدند، نه `APPROVED`، به‌دلیل نبود ATR و evidence کافی برای بررسی آستانه‌های زیر:

- sweep penetration نسبت به ATR
- حداقل FVG نسبت به ATR
- اعتبار entry نسبت به FVG
- کنترل‌های ریسک و cost model

این نتیجه نشان می‌دهد provider آنلاین در نقش advisory فعال است، ولی hard authority نیست و بدون evidence packet کامل نباید candidate را approve کند.

WebLLM محلی در benchmark عددی قرار نگرفت و با برچسب زیر ثبت شد:

```text
SIMULATED_UNTIL_GPU_RUN
```

علت: sandbox فعلی GPU واقعی و `navigator.gpu` ندارد. اجرای WebLLM روی Node نیز مجاز نیست.

## مقایسهٔ Bootstrap با فرض WebGPU شبیه‌سازی‌شده

تحلیل Bootstrap مرحلهٔ قبل همچنان معتبر است، اما باید با برچسب «شبیه‌سازی provider» خوانده شود، نه نتیجهٔ اجرای واقعی WebGPU. نتایج کلیدی:

| نماد | حالت | n | میانگین PnL | CI 95٪ |
|---|---|---:|---:|---:|
| GBPUSD | Hybrid | 5 | 13.80 | [-17.54, 45.14] |
| EURUSD | Hybrid | 4 | -27.14 | [-31.98, -23.51] |
| XAUUSD | Hybrid | 6 | -1.18 | [-22.52, 20.99] |

این اعداد برای تصمیم promotion کافی نیستند. تعداد معاملات کم است و intervalها یا صفر را قطع می‌کنند یا نسبت به تغییر چند candidate حساس‌اند.

## نتیجهٔ مرحله

- اتصال read-only cTrader آماده است.
- مسیر Paper-Forward بدون broker writes حفظ شده است.
- Scanner قطعی از Analyst جدا شده است.
- WebLLM محلی به‌درستی فقط برای Browser-GPU مجاز است.
- benchmark providerها برای سرور GPU آماده و قابل تکرار است.
- Gemini Flash از طریق provider آنلاین قابل اضافه‌شدن است، مشروط به endpoint و credential معتبر.
- هیچ خروجی WebGPU شبیه‌سازی‌شده‌ای به‌عنوان اندازه‌گیری واقعی گزارش نشده است.

## گام اجرایی روی سرور GPU

1. Chromium را روی GPU host نصب و `navigator.gpu` را تأیید کنید.
2. مدل SmolLM2 را با browser harness دانلود کنید.
3. شبکه را قطع و `verifyCachedModelOffline` را اجرا کنید.
4. benchmark تمام candidateها را اجرا کنید.
5. همان candidate packet و dataset hash را نگه دارید.
6. نتایج WebLLM واقعی را با `stage3-bootstrap-analysis.json` مقایسه کنید.
7. فقط پس از حداقل 30 تا 50 معامله در هر mode، nested walk-forward و bootstrap جدید، provider را وارد Paper-Forward طولانی کنید.
