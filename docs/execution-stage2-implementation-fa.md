# پیاده‌سازی مرحله دوم: Execution Event و OMS Demo

## موارد اضافه‌شده

- اصلاح envelope رسمی JSON cTrader به شکل:

```json
{
  "clientMsgId": "...",
  "payloadType": 2106,
  "payload": {}
}
```

- اصلاح payload typeهای رسمی cTrader برای:
  - `ProtoOANewOrderReq = 2106`
  - `ProtoOAExecutionEvent = 2126`
  - `ProtoOASubscribeSpotsReq = 2127`
  - `ProtoOASpotEvent = 2131`
- ارسال Application Auth با `clientSecret`.
- ارسال Account Auth با `accessToken`.
- ارسال واقعی Demo Limit Order از طریق Gateway.
- correlation سفارش با `clientOrderId`.
- دریافت و نرمال‌سازی execution eventهای زیر:
  - `ORDER_ACCEPTED`
  - `ORDER_FILLED`
  - `ORDER_PARTIAL_FILL`
  - `ORDER_CANCELLED`
  - `ORDER_EXPIRED`
  - `ORDER_REJECTED`
  - `ORDER_CANCEL_REJECTED`
- اتصال event نرمال‌شده به outbox و OMS.
- ثبت broker order، position و deal ID.
- ثبت protection confirmation برای SL/TP.
- تبدیل eventهای فاقد تأیید protection به `PROTECTION_FAILED`.
- اجرای idempotent برای eventهای تکراری.
- فعال‌شدن broker handler واقعی فقط برای `BROKER_DEMO`.
- همگام‌سازی وضعیت اتصال Gateway و `CTraderOMS.isBrokerOnline()`.
- انتظار محدود ۱۵ ثانیه‌ای برای اولین execution event پس از ارسال سفارش.

## مسیر اجرا

۱. Gateway با secretهای Demo فعال می‌شود:

```text
POST /api/gateway/status
{"action":"start"}
```

۲. پس از برقراری WebSocket و `onopen`، وضعیت اتصال OMS نیز online می‌شود.

۳. سفارش `BROKER_DEMO` از مسیر فعلی زیر ارسال می‌شود:

```text
POST /api/orders/submit
```

۴. OMS ابتدا `SUBMITTING` را پایدار می‌کند، سپس Gateway پیام `ProtoOANewOrderReq` را در صف می‌فرستد.

۵. اولین `ProtoOAExecutionEvent` بر اساس `clientOrderId` به intent متصل می‌شود.

۶. event هم در listener عمومی به OMS اعمال می‌شود و هم handler سفارش را آزاد می‌کند.

## سیاست‌های ایمنی

- محیط Live همچنان فعال نمی‌شود.
- نبود `CTRADER_ACCESS_TOKEN`، `CTRADER_ACCOUNT_ID` یا secret باعث fail-closed شدن می‌شود.
- Gateway متصل‌نشده اجازه سفارش Demo نمی‌دهد.
- timeout اجرای event سفارش را به مسیر خطای نامطمئن می‌فرستد؛ retry کور انجام نمی‌شود.
- event بدون record متناظر، به‌عنوان event unmatched گزارش می‌شود و سفارش جدیدی ساخته نمی‌شود.
- event تکراری state را دوباره تغییر نمی‌دهد.
- event fill بدون تأیید حد ضرر/سود به `PROTECTION_FAILED` می‌رود.
- پیام باینری Protobuf هنوز عمداً به‌عنوان `DEGRADED` علامت‌گذاری می‌شود؛ برای production باید codec Protobuf رسمی یا مسیر JSON معتبر انتخاب شود.

## اعتبارسنجی

- Typecheck: موفق
- Lint: موفق
- Test suites: ۱۱
- Checks: **۶۱ از ۶۱ موفق**
- Production build: موفق

## محدودیت آزمون محیطی

در محیط فعلی secret معتبر cTrader Demo وجود نداشت؛ بنابراین handshake، ارسال سفارش و execution event با حساب واقعی Demo در این اجرا انجام نشده است. کد، قرارداد و state transitionها تست شده‌اند؛ تست end-to-end باید پس از قرارگیری secretها در محیط سروری همیشه‌روشن اجرا شود.
