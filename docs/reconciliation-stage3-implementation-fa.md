# پیاده‌سازی مرحله سوم: Snapshot Reconciliation

## نتیجه

مسیر بازتطبیق دیگر وضعیت سفارش را حدس نمی‌زند و شناسه ساختگی تولید نمی‌کند. Gateway اکنون `ProtoOAReconcileReq` با payload type `2124` را ارسال می‌کند و `ProtoOAReconcileRes` با payload type `2125` را به snapshot استاندارد داخلی تبدیل می‌کند.

Snapshot شامل موارد زیر است:

```text
accountId
receivedAt
orders[]
positions[]
```

برای هر order، شناسه بروکر، client order ID، position ID و وجود Stop Loss و Take Profit ثبت می‌شود. برای هر position نیز position ID، order ID و وضعیت protection نگهداری می‌شود.

## قواعد تطبیق

OMS هر record محیط `BROKER_DEMO` را با اولویت‌های زیر تطبیق می‌دهد:

1. `brokerOrderId` داخلی با `orderId` بروکر.
2. `intentId` داخلی با `clientOrderId` بروکر.
3. `brokerPositionId` داخلی با `positionId` بروکر.
4. ارتباط order و position از طریق order ID بروکر.

اگر order تطبیق شود، وضعیت به `ACKNOWLEDGED` می‌رود. اگر position تطبیق شود، وضعیت به `FILLED` منتقل می‌شود. اگر snapshot تأیید SL یا TP را نشان ندهد، وضعیت بدون استثنا به `PROTECTION_FAILED` می‌رود.

اگر رکورد `UNKNOWN_RECONCILE_REQUIRED` یا `SUBMITTING` در snapshot پیدا نشود، همان وضعیت نامطمئن حفظ می‌شود و در `unresolvedIntentIds` گزارش می‌شود. در این حالت هیچ broker ID، fill یا protection به‌صورت ساختگی ایجاد نمی‌شود.

## API جدیدشده

```text
POST /api/orders/reconcile
```

بدون body، کل outboxهای Demo را با snapshot فعلی تطبیق می‌دهد. برای درخواست یک intent مشخص:

```json
{
  "intentId": "INT-..."
}
```

خروجی شامل این فیلدهاست:

```text
matchedIntentIds
protectionFailures
unresolvedIntentIds
updatedStates
receivedAt
accountId
```

در صورت نبود اتصال یا timeout snapshot، HTTP status برابر 503 است و سفارش تغییری نمی‌کند.

## رفتار ایمنی

- درخواست reconcile فقط در صورت وجود نشست اپراتور و rate limit معتبر اجرا می‌شود.
- Gateway متصل‌نشده، حساب Demo نامعتبر یا timeout باعث تغییر state نمی‌شود.
- snapshot حساب دیگری از طریق account ID قابل پذیرش نیست.
- سفارش‌های `CANCELLED` و `REJECTED_BY_BROKER` بازنویسی نمی‌شوند.
- eventهای خارج از outbox سفارش جدید ایجاد نمی‌کنند.
- reconciliation بدون evidence بروکر، `RECONCILED` جعلی تولید نمی‌کند.

## اعتبارسنجی

- Typecheck: موفق
- Lint: موفق
- Test suites: ۱۲
- Checks: **۶۳ از ۶۳ موفق**
- Production build: موفق

## محدودیت محیطی

در محیط فعلی حساب و token واقعی Demo در دسترس نبود؛ بنابراین پاسخ واقعی `ProtoOAReconcileRes` با broker end-to-end اجرا نشد. قرارداد، مسیر درخواست، تبدیل snapshot، تطبیق OMS و رفتار fail-closed با تست‌های دامنه اعتبارسنجی شده‌اند. برای تست عملی باید Gateway روی process همیشه‌روشن با secretهای Demo اجرا شود.
