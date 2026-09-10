# Stage 16: پذیرش پژوهشی و Paper-Forward محلی

## تصمیم پذیرش

نامزد پژوهشی تثبیت‌شده:

`GBPUSD / 4H / TREND_BREAKOUT_55_EMA200_V1`

مبنای پذیرش پژوهشی شامل سه fold مثبت Walk-Forward، حفظ PF بالاتر از ۱ در هر سه سناریوی cost stress، و smoke/ablation شورای آفلاین بود. AI در ablation تفاوت عملکردی ایجاد نکرد؛ بنابراین configuration نهایی برای Paper-Forward از `AI OFF` به‌عنوان baseline استفاده می‌کند و شورای آفلاین فقط در صورت نیاز به‌صورت advisory ثبت می‌شود.

## اجرای Paper-Forward محلی

Replay روی تمام ۱۶۱۵ کندل بسته‌شدهٔ dataset تاریخی GBPUSD/4H اجرا شد.

| شاخص | مقدار |
|---|---:|
| کندل دریافت‌شده | ۱۶۱۵ |
| کندل پذیرفته‌شده | ۱۶۱۵ |
| کندل ردشده | ۰ |
| سیگنال | ۴۱ |
| سفارش فرضی | ۴۱ |
| معاملات بسته‌شده | ۴۰ |
| معاملات برنده | ۱۵ |
| معاملات بازنده | ۲۵ |
| Win Rate | ۳۷٫۵٪ |
| Net PnL | +۷۸٫۴۸ |
| Profit Factor | ۱٫۱۴ |
| Max Drawdown | ۲٫۳۶٪ |
| وضعیت | `COMPLETE` |

محیط runner برابر `PAPER_REPLAY` بود، ورودی فقط کندل‌های بسته‌شده بود، و هیچ gateway، broker، exchange یا order-writing API فراخوانی نشد. Paper ledger محلی با fill کندل بعد و سیاست pessimistic برای برخورد هم‌زمان SL/TP کار می‌کند.

## وضعیت مراحل

سه مرحلهٔ تصمیم‌گیری و اجرای محلی تکمیل شدند:

1. ablation واقعی AI OFF در برابر شورای آفلاین؛
2. تصمیم پذیرش پژوهشی و تثبیت candidate؛
3. Paper-Forward replay محلی read-only.

برای ادامهٔ اختیاری، **۲ مرحلهٔ عملیاتی** باقی می‌ماند:

1. اجرای Paper-Forward read-only بر feed کندل بستهٔ جدید و پایش دوره‌ای؛
2. تحلیل پایان دوره، بررسی drift، feed gap، drawdown و تصمیم ادامه/توقف پژوهشی.

اجرای ۳۰روزه نیازمند یک محیط همیشه‌روشن و feed read-only واقعی است. تا زمان فراهم‌نشدن credential و endpoint مجاز، artifact تاریخی حاضر فقط replay پژوهشی است و نباید به‌عنوان paper-forward زنده معرفی شود.

Live Trading و broker write در کل مسیر ممنوع و اجرا نشده‌اند.
