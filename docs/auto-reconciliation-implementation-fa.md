# پیاده‌سازی Reconciliation خودکار

## نقاط فعال‌سازی

سرویس `AutoReconciliationService` اکنون با Gateway lifecycle متصل است. بعد از دریافت موفق `ProtoOAAccountAuthRes` و تکمیل subscription، اولین snapshot با trigger `STARTUP` درخواست می‌شود. پس از هر reconnect که دوباره به account authentication برسد، snapshot جدید با trigger `RECONNECT` گرفته می‌شود. اگر ارسال سفارش Demo انجام شود اما execution event در مهلت ۱۵ ثانیه‌ای نرسد، OMS ابتدا وضعیت را طبق سیاست موجود به `UNKNOWN_RECONCILE_REQUIRED` می‌برد و سپس trigger `ORDER_TIMEOUT` در یک tick جداگانه اجرا می‌شود؛ این ترتیب از race و بازنویسی نادرست state جلوگیری می‌کند.

## کنترل هم‌پوشانی و retry

سرویس single-flight است. در هر لحظه فقط یک snapshot request فعال می‌ماند. اگر در زمان اجرای آن trigger دیگری برسد، درخواست در وضعیت queued قرار می‌گیرد و بعد از پایان اجرای فعلی، یک بار دوباره اجرا می‌شود. خطاهای snapshot با exponential backoff از یک ثانیه تا حداکثر سی ثانیه retry می‌شوند و پس از پنج شکست متوالی، retry خودکار متوقف می‌شود تا سیستم وارد loop دائمی نشود.

پاسخ موفق snapshot از طریق همان `CTraderOMS.reconcileSnapshot` قبلی اعمال می‌شود. بنابراین سفارش بدون evidence بروکر به‌صورت ساختگی reconciled نمی‌شود و protection ناقص همچنان به `PROTECTION_FAILED` منتقل می‌شود.

## مشاهده وضعیت

`GET /api/gateway/status` اکنون علاوه بر وضعیت Gateway، وضعیت reconciliation خودکار را نیز برمی‌گرداند:

```text
reconciliation.running
reconciliation.queued
reconciliation.lastTrigger
reconciliation.lastStartedAt
reconciliation.lastCompletedAt
reconciliation.lastReport
reconciliation.lastError
reconciliation.consecutiveFailures
```

## محدودیت مهم

این قابلیت از lifecycle اتصال موجود استفاده می‌کند؛ بنابراین process باید Gateway را با secretهای معتبر Demo و یک process همیشه‌روشن اجرا کند. در محیط بدون token یا account معتبر، triggerها fail-closed و بدون تغییر وضعیت سفارش باقی می‌مانند. اجرای end-to-end با broker واقعی هنوز نیازمند credentials معتبر Demo است.

## اعتبارسنجی

- Typecheck: موفق
- Lint: موفق
- Test suites: ۱۳
- Checks: **۶۵ از ۶۵ موفق**
- Production build: موفق
