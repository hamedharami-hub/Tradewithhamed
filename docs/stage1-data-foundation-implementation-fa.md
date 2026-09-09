# اجرای مرحلهٔ اول: Data Foundation

## وضعیت

مرحلهٔ اول با دادهٔ عمومی واقعی اجرا شد و اکنون پروژه دارای یک مخزن چندنمادی و چندتایم‌فریمی HistData است.

## منبع استفاده‌شده

منبع اصلی این مرحله **HistData Generic ASCII M1** بود. طبق مستندات رسمی HistData، فایل شامل timestamp، Open، High، Low، Close و Volume است و timestamp با timezone ثابت EST بدون daylight saving ارائه می‌شود. Parser اختصاصی این پروژه timestamp را با offset ثابت پنج ساعت به UTC تبدیل می‌کند.

منبع: [HistData Data Files Detailed Specification](https://www.histdata.com/f-a-q/data-files-detailed-specification/)

## دادهٔ خام دریافت‌شده

| نماد | بازه | resolution | وضعیت خام |
|---|---|---|---|
| EURUSD | 2024 | M1 | دریافت شد |
| GBPUSD | 2024 | M1 | دریافت شد |
| USDJPY | 2024 | M1 | دریافت شد |
| XAUUSD | 2024 | M1 | دریافت شد |

فایل‌های ZIP خام در `data/raw/histdata/` نگهداری شده‌اند و SHA-256 آن‌ها هنگام دریافت ثبت شده است.

## Datasetهای تولیدشده

برای هر نماد M1 اصلی و تایم‌فریم‌های مشتق‌شدهٔ 5M، 15M و 1H ساخته شد. aggregation فقط از کندل‌های موجود و bucketهای کامل استفاده می‌کند و اطلاعات آینده را وارد کندل قبلی نمی‌کند.

در مجموع **۱۶ dataset** تولید شده است:

- چهار dataset یک‌دقیقه‌ای
- چهار dataset پنج‌دقیقه‌ای
- چهار dataset پانزده‌دقیقه‌ای
- چهار dataset یک‌ساعته

تعداد کل barهای پذیرفته‌شده در datasetهای M1:

| نماد | M1 پذیرفته‌شده | وضعیت | Duplicate ردشده | Gap ثبت‌شده |
|---|---:|---|---:|---:|
| EURUSD | 372,379 | READY | 0 | 316 |
| GBPUSD | 372,047 | PARTIAL | 60 | 386 |
| USDJPY | 372,023 | PARTIAL | 60 | 290 |
| XAUUSD | 355,592 | PARTIAL | 60 | 215 |

`PARTIAL` به‌معنی شکست نیست؛ یعنی رکوردهای تکراری حذف شده‌اند و وضعیت به‌صورت شفاف ثبت شده است. دادهٔ مشتق‌شدهٔ 5M، 15M و 1H هر چهار نماد پس از aggregation با وضعیت READY تولید شده است، هرچند gapهای منبع در گزارش باقی مانده‌اند.

## کنترل‌های اجراشده

- بررسی OHLC منطقی
- رد timestamp نامعتبر
- رد ترتیب زمانی معکوس
- حذف duplicate timestamp
- ثبت gapهای غیرتعطیل
- تبدیل EST ثابت به UTC
- ثبت provider و provider symbol
- ثبت coverage و تعداد barها
- تولید SHA-256 برای محتوای raw
- جداکردن raw archive از dataset مشتق‌شده
- نگهداری source notes و license notes

## ابزارهای جدید

- `scripts/download-histdata.sh`
- `scripts/import-histdata.ts`
- `scripts/build-timeframes.ts`
- `scripts/report-datasets.ts`

## محدودیت مهم

این داده‌ها عمومی و bid-bar هستند و الزاماً با feed cTrader شما یکسان نیستند. برای نتیجهٔ نهایی باید بعداً spread، timezone، rollover، swap و contract specification broker شما با این داده‌ها مقایسه شود. XAUUSD عمومی نیز باید به‌عنوان dataset مستقل بررسی شود و نباید بدون validation با feed broker جایگزین شود.

## قدم بعدی

اکنون این داده‌ها آمادهٔ ورود به مرحلهٔ دوم هستند: تکمیل و آزمایش مستقل S0، BOS/Order Block و Equilibrium روی datasetهای 5M و 15M، سپس اجرای baseline backtest و گزارش segmentها.
