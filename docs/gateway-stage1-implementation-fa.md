# پیاده‌سازی مرحله اول Gateway cTrader

## آنچه اضافه شد

- قراردادهای typed برای وضعیت Gateway، quote نرمال‌شده و event کیفیت داده.
- خواندن تنظیمات فقط از environment سرور و سیاست fail-closed.
- اتصال WebSocket به proxy Demo با:
  - app authentication
  - account authentication
  - heartbeat ده‌ثانیه‌ای
  - reconnect نمایی با سقف تلاش
  - صف ارسال ترتیبی و کنترل نرخ
  - subscription به spot برای XAUUSD و EURUSD
- نرمال‌سازی bid/ask از پیام cTrader و انتقال quote معتبر به `LiveMarketFeed`.
- تشخیص quote نامعتبر، timestamp برگشتی و quote stale.
- API وضعیت Gateway:

```text
GET  /api/gateway/status
POST /api/gateway/status { "action": "start" }
POST /api/gateway/status { "action": "stop" }
```

- API قبلی `/api/market/quotes` اکنون در صورت وجود quote معتبر Gateway، آن را بر quote شبیه‌سازی‌شده مقدم می‌کند و وضعیت Gateway را نیز گزارش می‌دهد.
- تست‌های Gateway برای پذیرش quote معتبر، رد bid/ask نامعتبر، رد timestamp خارج از ترتیب و fail-closed بودن بدون secret اضافه شد.

## فعال‌سازی Demo

مقادیر زیر فقط در `.env.local` یا secret store سرور قرار گیرند و هرگز در کلاینت یا repository commit نشوند:

```env
CTRADER_ENVIRONMENT=demo
CTRADER_CLIENT_ID=...
CTRADER_CLIENT_SECRET=...
CTRADER_ACCESS_TOKEN=...
CTRADER_ACCOUNT_ID=...
CTRADER_GATEWAY_HOST=demo.ctraderapi.com
CTRADER_GATEWAY_PORT=5035
```

بعد از راه‌اندازی سرویس، با نشست اپراتور معتبر درخواست زیر ارسال شود:

```bash
curl -X POST http://localhost:3000/api/gateway/status \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <operator-session-cookie>' \
  -d '{"action":"start"}'
```

سپس وضعیت را بررسی کنید:

```bash
curl http://localhost:3000/api/gateway/status \
  -H 'Cookie: <operator-session-cookie>'
```

## محدودیت مهم فعلی

این commit زیرساخت Gateway و مسیر JSON را آماده کرده است، اما اتصال واقعی باید ابتدا با یک حساب Demo و secretهای معتبر در محیط همیشه‌روشن آزموده شود. اگر proxy پیام باینری Protobuf ارسال کند، Gateway عمداً وضعیت `DEGRADED` می‌دهد و نیاز به فعال‌سازی codec Protobuf رسمی cTrader خواهد داشت؛ در این حالت نباید quote را Live فرض کرد.

همچنین `CTRADER_ACCESS_TOKEN` فعلاً برای process Gateway از environment خوانده می‌شود. برای production باید این مقدار از vault سروری یا token store رمزنگاری‌شده خوانده و refresh token lifecycle نیز اضافه شود؛ انتقال token از cookie مرورگر به process Gateway نباید با خواندن client-side انجام شود.

## نتیجه اعتبارسنجی

- Typecheck: موفق
- Lint: موفق
- Test suites: ۱۰
- Checks: **۵۶ از ۵۶ موفق**
- Production build: موفق
- Route جدید: `/api/gateway/status`
